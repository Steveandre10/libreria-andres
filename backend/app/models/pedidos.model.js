import pool from '../config/db.js';
import { moverStock, ErrorInventario } from './inventario.model.js';
// RF17: métodos de pago y envíos configurables desde el panel
import { exigirMetodoActivo, exigirEnvioActivo } from './tienda.model.js';

/**
 * @file pedidos.model.js
 * @description RF14 · Ventas (pedidos) y devoluciones. Usa las tablas del modelo:
 * pedidos → pedido_libro (qué libros y cuántos) → facturas → detalle_factura.
 * Cada venta descuenta del inventario y cada devolución lo repone (con moverStock).
 */

/**
 * RF23 · Tasa de IVA que se aplica al carrito. ÚNICO lugar donde se configura.
 * 0 porque en Colombia los libros están excluidos de IVA (Ley 98 de 1993).
 * Si algún día cambia, se pone aquí (ej. 0.19) y carrito, factura y recibo lo toman solos.
 */
export const TASA_IVA = 0;
export const ETIQUETA_IVA = 'IVA (libros excluidos)';

/** Redondea a 2 decimales (centavos) para que la suma no quede como 39.989999999. */
const redondear = (n) => Math.round(n * 100) / 100;

/**
 * RF23/RF17 · Subtotal, impuestos, envío y total (misma regla para cotizar y para cobrar).
 * El IVA se calcula sobre los libros; el envío se suma aparte.
 * @param {number} subtotal - Suma de los libros.
 * @param {number} [costoEnvio=0] - Costo del tipo de envío elegido.
 */
export const calcularTotales = (subtotal, costoEnvio = 0) => {
  const sub = redondear(subtotal);
  const impuestos = redondear(sub * TASA_IVA);
  const envio = redondear(costoEnvio);
  return {
    subtotal: sub, impuestos, costo_envio: envio, total: redondear(sub + impuestos + envio),
    tasa_iva: TASA_IVA, etiqueta_iva: ETIQUETA_IVA
  };
};

/**
 * RF23 · Cotiza el carrito con los datos ACTUALES de la base de datos (precio y stock),
 * sin comprar nada. El carrito la usa al abrirse y en cada cambio de cantidad, así:
 * - los totales que ve el cliente los calcula el servidor (los mismos que se cobrarán),
 * - si el precio cambió o el stock ya no alcanza, el carrito lo avisa antes de pagar.
 *
 * @param {Array<{id_libro:number, cantidad:number}>} items
 * @param {number|null} [idEnvio] - RF17: tipo de envío elegido (si no está activo, se avisa).
 */
export const cotizar = async (items, idEnvio = null) => {
  const ids = items.map(i => i.id_libro);
  const [libros] = ids.length
    ? await pool.query(
      `SELECT l.id_libro, l.titulo, l.autor, l.precio, l.portada,
              CAST(COALESCE(i.stock_actual, 0) AS SIGNED) AS stock
       FROM libros l LEFT JOIN inventarios i ON i.id_libro = l.id_libro
       WHERE l.id_libro IN (?)`, [ids])
    : [[]];

  let subtotal = 0;
  const lineas = items.map(item => {
    const libro = libros.find(l => l.id_libro === item.id_libro);
    if (!libro) return { id_libro: item.id_libro, cantidad: item.cantidad, existe: false, problema: 'Este libro ya no está en el catálogo.' };
    const precio = Number(libro.precio);
    const alcanza = item.cantidad <= libro.stock;
    if (alcanza) subtotal += precio * item.cantidad;
    return {
      id_libro: libro.id_libro, titulo: libro.titulo, autor: libro.autor, portada: libro.portada,
      precio, stock: libro.stock, cantidad: item.cantidad, existe: true,
      subtotal: redondear(precio * item.cantidad),
      problema: alcanza ? null : (libro.stock === 0 ? 'Se agotó.' : `Solo quedan ${libro.stock} unidad(es).`)
    };
  });

  // RF17: costo del envío elegido (solo si sigue activo)
  let envio = null;
  if (idEnvio) {
    const [[e]] = await pool.query('SELECT id_tipo_envio, nombre, costo FROM tipos_envio WHERE id_tipo_envio = ? AND activo = 1', [idEnvio]);
    envio = e ? { id_tipo_envio: e.id_tipo_envio, nombre: e.nombre, costo: Number(e.costo) } : null;
  }

  return {
    lineas,
    envio,
    ...calcularTotales(subtotal, envio ? envio.costo : 0),
    se_puede_pagar: lineas.every(l => !l.problema) && !!envio
  };
};

/**
 * RF14 · Registra una compra completa en UNA transacción:
 * 1. Crea el pedido y la factura.
 * 2. Por cada libro: valida y descuenta el stock (moverStock "Venta"), guarda la línea del pedido y de la factura.
 * Si un solo libro no tiene stock suficiente, se deshace TODO (rollback) y no se cobra nada.
 *
 * El precio se toma de la base de datos, nunca del navegador (alguien podría alterarlo).
 *
 * @param {Object} datos
 * @param {number} datos.idUsuario - Cliente que compra.
 * @param {Array<{id_libro:number, cantidad:number}>} datos.items
 * @param {{nombre:string, direccion:string, telefono:string}} datos.entrega
 * @param {number} datos.idMetodoPago
 * @param {number} datos.idEnvio - RF17: tipo de envío elegido.
 * @returns {Promise<{id_pedido:number, id_factura:number, total:number, unidades:number}>}
 */
export const crearPedido = async ({ idUsuario, items, entrega, idMetodoPago, idEnvio }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // RF17: el método de pago y el envío deben seguir activos AHORA (el admin pudo cambiarlos)
    const metodo = await exigirMetodoActivo(conn, idMetodoPago);
    const envio = await exigirEnvioActivo(conn, idEnvio);

    const [pedido] = await conn.query(
      // RF3: el método de pago elegido queda en el pedido (y abajo también en la factura)
      `INSERT INTO pedidos (estado, fecha, id, nombre_destinatario, direccion_entrega, telefono_contacto,
                            id_tipo_envio, costo_envio, id_metodo_pago)
       VALUES ('Activo', CURDATE(), ?, ?, ?, ?, ?, ?, ?)`,
      [idUsuario, entrega.nombre, entrega.direccion, entrega.telefono, envio.id_tipo_envio, envio.costo, metodo.id_metodo_pago]
    );
    const idPedido = pedido.insertId;

    const [factura] = await conn.query(
      `INSERT INTO facturas (fecha_emision, total, id_pedido, id_metodo_pago) VALUES (CURDATE(), 0, ?, ?)`,
      [idPedido, idMetodoPago]
    );
    const idFactura = factura.insertId;

    let sumaLineas = 0;
    let unidades = 0;
    for (const item of items) {
      const [[libro]] = await conn.query('SELECT id_libro, precio FROM libros WHERE id_libro = ?', [item.id_libro]);
      if (!libro) throw new ErrorInventario('Uno de los libros del carrito ya no existe en el catálogo.', 404);

      // Descuenta del inventario (lanza "solo quedan N" si no alcanza)
      await moverStock(conn, {
        idLibro: libro.id_libro, cambio: -item.cantidad, tipo: 'Venta', idUsuario, idPedido
      });

      const precio = Number(libro.precio);
      const subtotal = precio * item.cantidad;
      await conn.query(
        'INSERT INTO pedido_libro (id_pedido, id_libro, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
        [idPedido, libro.id_libro, item.cantidad, precio]
      );
      await conn.query(
        'INSERT INTO detalle_factura (cantidad, subtotal, id_factura, id_libro) VALUES (?, ?, ?, ?)',
        [item.cantidad, subtotal, idFactura, libro.id_libro]
      );
      sumaLineas += subtotal;
      unidades += item.cantidad;
    }

    // RF23/RF17: la factura guarda subtotal, impuestos, envío y total
    const totales = calcularTotales(sumaLineas, envio.costo);
    await conn.query(
      'UPDATE facturas SET subtotal = ?, impuestos = ?, costo_envio = ?, total = ? WHERE id_factura = ?',
      [totales.subtotal, totales.impuestos, totales.costo_envio, totales.total, idFactura]
    );
    await conn.commit();
    return {
      id_pedido: idPedido, id_factura: idFactura, unidades, ...totales,
      metodo_pago: metodo.nombre_metodo, tipo_envio: envio.nombre
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

/**
 * RF14 · Pasos de una devolución, dentro de una transacción ya abierta:
 * el pedido pasa a "Devuelto" y cada libro vuelve al inventario (movimiento "Devolución").
 * La usan la devolución directa del personal y la aprobación de una solicitud del cliente.
 */
const devolverDentroDe = async (conn, idPedido, idUsuario) => {
  // FOR UPDATE: evita que dos personas devuelvan el mismo pedido a la vez
  const [[pedido]] = await conn.query('SELECT id_pedido, estado FROM pedidos WHERE id_pedido = ? FOR UPDATE', [idPedido]);
  if (!pedido) throw new ErrorInventario('El pedido no existe.', 404);
  if (pedido.estado !== 'Activo') throw new ErrorInventario('Este pedido ya fue devuelto.');

  const [lineas] = await conn.query('SELECT id_libro, cantidad FROM pedido_libro WHERE id_pedido = ?', [idPedido]);
  for (const linea of lineas) {
    await moverStock(conn, {
      idLibro: linea.id_libro, cambio: +linea.cantidad, tipo: 'Devolución', idUsuario, idPedido
    });
  }
  await conn.query(`UPDATE pedidos SET estado = 'Devuelto' WHERE id_pedido = ?`, [idPedido]);
};

/**
 * RF14 · Devolución directa (registrada por el personal, por ejemplo en la tienda física).
 * Si el pedido tenía una solicitud pendiente del cliente, queda aprobada.
 * @param {number} idPedido
 * @param {number} idUsuario - Quién registra la devolución (personal de inventario).
 */
export const devolverPedido = async (idPedido, idUsuario) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await devolverDentroDe(conn, idPedido, idUsuario);
    await conn.query(
      `UPDATE solicitudes_devolucion SET estado = 'Aprobada', id_revisor = ?, fecha_respuesta = NOW(),
         respuesta = COALESCE(respuesta, 'Devolución registrada por el personal.')
       WHERE id_pedido = ? AND estado = 'Pendiente'`,
      [idUsuario, idPedido]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

/**
 * Lista pedidos con sus libros y total. Si se pasa idUsuario, solo los de ese cliente.
 * @param {{idUsuario?:number, limite?:number}} [opciones]
 */
export const getPedidos = async ({ idUsuario = null, limite = 50 } = {}) => {
  const [pedidos] = await pool.query(
    `SELECT p.id_pedido, p.estado, p.fecha_registro, p.nombre_destinatario, p.direccion_entrega,
            p.telefono_contacto, u.nombre AS cliente, u.email AS cliente_email,
            f.subtotal, f.impuestos, f.costo_envio, f.total, f.id_factura, mp.nombre_metodo AS metodo_pago,
            te.nombre AS tipo_envio
     FROM pedidos p
     LEFT JOIN usuarios u ON u.id = p.id
     LEFT JOIN facturas f ON f.id_pedido = p.id_pedido
     LEFT JOIN metodos_pago mp ON mp.id_metodo_pago = COALESCE(p.id_metodo_pago, f.id_metodo_pago) -- RF3
     LEFT JOIN tipos_envio te ON te.id_tipo_envio = p.id_tipo_envio
     ${idUsuario ? 'WHERE p.id = ?' : ''}
     ORDER BY p.id_pedido DESC
     LIMIT ?`,
    idUsuario ? [idUsuario, limite] : [limite]
  );
  if (!pedidos.length) return [];

  const [lineas] = await pool.query(
    `SELECT pl.id_pedido, pl.id_libro, pl.cantidad, pl.precio_unitario, l.titulo
     FROM pedido_libro pl JOIN libros l ON l.id_libro = pl.id_libro
     WHERE pl.id_pedido IN (?)`,
    [pedidos.map(p => p.id_pedido)]
  );
  // RF14: la solicitud de devolución de cada pedido (si la hay)
  const [solicitudes] = await pool.query(
    `SELECT s.id_pedido, s.id_solicitud, s.motivo, s.detalle, s.estado, s.respuesta,
            s.fecha_solicitud, s.fecha_respuesta, r.nombre AS revisor
     FROM solicitudes_devolucion s LEFT JOIN usuarios r ON r.id = s.id_revisor
     WHERE s.id_pedido IN (?)`,
    [pedidos.map(p => p.id_pedido)]
  );
  return pedidos.map(p => ({
    ...p,
    items: lineas.filter(l => l.id_pedido === p.id_pedido),
    solicitud: solicitudes.find(s => s.id_pedido === p.id_pedido) || null
  }));
};

/* ---------------------------------------------------------------
   SOLICITUDES DE DEVOLUCIÓN (RF14)
   --------------------------------------------------------------- */

/** Motivos que el cliente puede elegir al pedir una devolución. */
export const MOTIVOS_DEVOLUCION = [
  'Llegó dañado',
  'No es el libro que pedí',
  'Ya no lo necesito',
  'La entrega se demoró',
  'Otro motivo'
];

/**
 * RF14 · El cliente pide la devolución de UNO de sus pedidos.
 * Reglas: el pedido debe ser suyo, seguir activo y no tener otra solicitud.
 * @param {{idPedido:number, idUsuario:number, motivo:string, detalle?:string}} datos
 */
export const crearSolicitud = async ({ idPedido, idUsuario, motivo, detalle }) => {
  const [[pedido]] = await pool.query('SELECT id_pedido, estado, id FROM pedidos WHERE id_pedido = ?', [idPedido]);
  // Si el pedido es de otra persona respondemos "no existe": no revelamos pedidos ajenos
  if (!pedido || pedido.id !== idUsuario) throw new ErrorInventario('El pedido no existe.', 404);
  if (pedido.estado !== 'Activo') throw new ErrorInventario('Este pedido ya fue devuelto.');

  try {
    const [r] = await pool.query(
      'INSERT INTO solicitudes_devolucion (id_pedido, id_usuario, motivo, detalle) VALUES (?, ?, ?, ?)',
      [idPedido, idUsuario, motivo, detalle || null]
    );
    return r.insertId;
  } catch (error) {
    // La regla UNIQUE (una solicitud por pedido) avisa si ya la había pedido
    if (error.code === 'ER_DUP_ENTRY') throw new ErrorInventario('Ya enviaste una solicitud de devolución para este pedido.');
    throw error;
  }
};

/**
 * RF14 · Solicitudes para el panel: primero las pendientes, luego las últimas resueltas.
 * @returns {Promise<Array<Object>>}
 */
export const getSolicitudes = async () => {
  const [rows] = await pool.query(
    `SELECT s.id_solicitud, s.id_pedido, s.motivo, s.detalle, s.estado, s.respuesta,
            s.fecha_solicitud, s.fecha_respuesta,
            u.nombre AS cliente, r.nombre AS revisor, f.total
     FROM solicitudes_devolucion s
     LEFT JOIN usuarios u ON u.id = s.id_usuario
     LEFT JOIN usuarios r ON r.id = s.id_revisor
     LEFT JOIN facturas f ON f.id_pedido = s.id_pedido
     ORDER BY (s.estado = 'Pendiente') DESC, s.id_solicitud DESC
     LIMIT 30`
  );
  if (!rows.length) return [];
  const [lineas] = await pool.query(
    `SELECT pl.id_pedido, pl.cantidad, l.titulo FROM pedido_libro pl JOIN libros l ON l.id_libro = pl.id_libro
     WHERE pl.id_pedido IN (?)`,
    [rows.map(s => s.id_pedido)]
  );
  return rows.map(s => ({ ...s, items: lineas.filter(l => l.id_pedido === s.id_pedido) }));
};

/**
 * RF14 · El personal responde una solicitud.
 * Aprobar = se hace la devolución (stock repuesto, pedido "Devuelto") en la MISMA transacción.
 * Rechazar = el pedido sigue activo y el cliente ve la respuesta.
 * @param {{idSolicitud:number, aprobar:boolean, respuesta?:string, idRevisor:number}} datos
 */
export const responderSolicitud = async ({ idSolicitud, aprobar, respuesta, idRevisor }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[sol]] = await conn.query(
      'SELECT id_solicitud, id_pedido, estado FROM solicitudes_devolucion WHERE id_solicitud = ? FOR UPDATE',
      [idSolicitud]
    );
    if (!sol) throw new ErrorInventario('La solicitud no existe.', 404);
    if (sol.estado !== 'Pendiente') throw new ErrorInventario('Esta solicitud ya fue respondida.');

    if (aprobar) await devolverDentroDe(conn, sol.id_pedido, idRevisor);

    await conn.query(
      `UPDATE solicitudes_devolucion
       SET estado = ?, respuesta = ?, id_revisor = ?, fecha_respuesta = NOW()
       WHERE id_solicitud = ?`,
      [aprobar ? 'Aprobada' : 'Rechazada', respuesta || null, idRevisor, idSolicitud]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};
