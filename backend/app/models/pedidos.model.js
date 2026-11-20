import pool from '../config/db.js';
import { moverStock, ErrorInventario } from './inventario.model.js';

/**
 * @file pedidos.model.js
 * @description RF14 · Ventas (pedidos) y devoluciones. Usa las tablas del modelo:
 * pedidos → pedido_libro (qué libros y cuántos) → facturas → detalle_factura.
 * Cada venta descuenta del inventario y cada devolución lo repone (con moverStock).
 */

/** Métodos de pago del checkout → id en la tabla metodos_pago. */
export const METODOS_PAGO = { tarjeta: 1, nequi: 2, efectivo: 3 };

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
 * @returns {Promise<{id_pedido:number, id_factura:number, total:number, unidades:number}>}
 */
export const crearPedido = async ({ idUsuario, items, entrega, idMetodoPago }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [pedido] = await conn.query(
      `INSERT INTO pedidos (estado, fecha, id, nombre_destinatario, direccion_entrega, telefono_contacto)
       VALUES ('Activo', CURDATE(), ?, ?, ?, ?)`,
      [idUsuario, entrega.nombre, entrega.direccion, entrega.telefono]
    );
    const idPedido = pedido.insertId;

    const [factura] = await conn.query(
      `INSERT INTO facturas (fecha_emision, total, id_pedido, id_metodo_pago) VALUES (CURDATE(), 0, ?, ?)`,
      [idPedido, idMetodoPago]
    );
    const idFactura = factura.insertId;

    let total = 0;
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
      total += subtotal;
      unidades += item.cantidad;
    }

    await conn.query('UPDATE facturas SET total = ? WHERE id_factura = ?', [total, idFactura]);
    await conn.commit();
    return { id_pedido: idPedido, id_factura: idFactura, total, unidades };
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
            f.total, f.id_factura, mp.nombre_metodo AS metodo_pago
     FROM pedidos p
     LEFT JOIN usuarios u ON u.id = p.id
     LEFT JOIN facturas f ON f.id_pedido = p.id_pedido
     LEFT JOIN metodos_pago mp ON mp.id_metodo_pago = f.id_metodo_pago
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
