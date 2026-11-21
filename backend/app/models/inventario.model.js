import pool from '../config/db.js';
import { avisarReposicion } from '../services/avisos.js';   // RF26

/**
 * @file inventario.model.js
 * @description RF14 · Todo lo que toca el stock pasa por aquí: ventas, devoluciones,
 * altas y ajustes manuales. Así el número de `inventarios.stock_actual` y su historial
 * (`movimientos`) nunca se desincronizan.
 */

/** RF13 · Librería dueña del inventario (la fila id 1 de la tabla librerias). */
export const ID_LIBRERIA = 1;

/** RF13 · La disponibilidad sale del stock: con unidades = Disponible, sin unidades = Agotado. */
export const estadoPorStock = (stock) => (stock > 0 ? 'Disponible' : 'Agotado');

/**
 * Error de negocio con código y estado HTTP, para que el controlador
 * responda un mensaje claro (por ejemplo 409 "no hay stock") en vez de un 500.
 */
export class ErrorInventario extends Error {
  constructor(mensaje, status = 409) {
    super(mensaje);
    this.status = status;
  }
}

/**
 * RF14 · Mueve el stock de UN libro y deja el movimiento registrado.
 * Debe llamarse DENTRO de una transacción (recibe la conexión `conn`).
 *
 * `SELECT ... FOR UPDATE` bloquea la fila del inventario hasta el commit:
 * si dos clientes compran el último ejemplar al mismo tiempo, el segundo
 * espera, ve stock 0 y recibe "no hay stock" en vez de dejar el stock en -1.
 *
 * @param {import('mysql2/promise').PoolConnection} conn - Conexión con la transacción abierta.
 * @param {Object} mov
 * @param {number} mov.idLibro
 * @param {number} [mov.cambio]      - Unidades a sumar (+) o restar (−). Usar esto o `nuevoStock`.
 * @param {number} [mov.nuevoStock]  - Cantidad final exacta (ajuste manual desde la ficha del libro).
 * @param {'Venta'|'Devolución'|'Ajuste'|'Alta'} mov.tipo
 * @param {number|null} [mov.idUsuario] - Quién lo hizo.
 * @param {number|null} [mov.idPedido]  - Pedido de origen (ventas y devoluciones).
 * @param {string|null} [mov.motivo]    - RF12: por qué se ajustó (conteo cíclico).
 * @returns {Promise<{anterior:number, nuevo:number}>}
 */
export const moverStock = async (conn, { idLibro, cambio, nuevoStock, tipo, idUsuario = null, idPedido = null, motivo = null }) => {
  // Si el libro todavía no tiene fila de inventario, se crea en 0
  await conn.query(
    `INSERT IGNORE INTO inventarios (stock_actual, stock_minimo, id_libreria, id_libro) VALUES (0, 0, ?, ?)`,
    [ID_LIBRERIA, idLibro]
  );

  const [[fila]] = await conn.query(
    `SELECT i.id_inventario, i.stock_actual, l.titulo
     FROM inventarios i JOIN libros l ON l.id_libro = i.id_libro
     WHERE i.id_libro = ? AND i.id_libreria = ? FOR UPDATE`,
    [idLibro, ID_LIBRERIA]
  );
  if (!fila) throw new ErrorInventario('El libro no existe', 404);

  const anterior = fila.stock_actual;
  const nuevo = nuevoStock !== undefined ? nuevoStock : anterior + cambio;
  if (nuevo < 0) {
    throw new ErrorInventario(
      anterior === 0
        ? `«${fila.titulo}» está agotado.`
        : `Solo quedan ${anterior} unidad(es) de «${fila.titulo}».`
    );
  }
  if (nuevo === anterior) return { anterior, nuevo };   // sin cambios, sin movimiento

  await conn.query('UPDATE inventarios SET stock_actual = ? WHERE id_inventario = ?', [nuevo, fila.id_inventario]);
  await conn.query('UPDATE libros SET disponibilidad = ? WHERE id_libro = ?', [estadoPorStock(nuevo), idLibro]);
  await conn.query(
    `INSERT INTO movimientos (tipo_movimiento, cantidad, stock_anterior, stock_nuevo, id_inventario, id_usuario, id_pedido, motivo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tipo, Math.abs(nuevo - anterior), anterior, nuevo, fila.id_inventario, idUsuario, idPedido, motivo]
  );

  // RF26 · Si estaba agotado y volvió a tener unidades, se avisa a quienes pidieron "Avisarme cuando llegue"
  if (anterior === 0 && nuevo > 0) avisarReposicion(idLibro);

  // RF10 · ¿Este movimiento hizo que el libro llegara a su stock mínimo (o por debajo)?
  // Solo se avisa al CRUZAR la línea (antes estaba por encima, ahora no), así no se repite
  // la alerta en cada venta mientras el libro sigue bajo.
  const minimo = await getMinimoDeLibro(conn, idLibro);
  if (nuevo <= minimo && anterior > minimo) {
    await crearAlertaStock(conn, { idLibro, titulo: fila.titulo, stock: nuevo, minimo });
  }
  return { anterior, nuevo };
};

/* ---------------------------------------------------------------
   RF11 · STOCK MÍNIMO POR LIBRO
   inventarios.stock_minimo_personalizado = el mínimo propio del libro (NULL = usar el de por defecto).
   configuraciones.stock_minimo_defecto  = el valor por defecto (5 si nadie lo cambió).
   --------------------------------------------------------------- */

/** Valor que se usa cuando ni el libro ni la configuración tienen uno. */
export const MINIMO_POR_DEFECTO = 5;

/** RF11 · Lee el stock mínimo por defecto de `configuraciones`. */
export const getMinimoDefecto = async (db = pool) => {
  const [[fila]] = await db.query(
    "SELECT valor_parametro FROM configuraciones WHERE nombre_parametro = 'stock_minimo_defecto'"
  );
  const n = Number(fila?.valor_parametro);
  return Number.isInteger(n) && n >= 0 ? n : MINIMO_POR_DEFECTO;
};

/** RF11 · Cambia el stock mínimo por defecto (lo usan todos los libros sin mínimo propio). */
export const setMinimoDefecto = async (minimo, idUsuario) => {
  await pool.query(
    `INSERT INTO configuraciones (nombre_parametro, valor_parametro, configurado_por) VALUES ('stock_minimo_defecto', ?, ?)
     ON DUPLICATE KEY UPDATE valor_parametro = VALUES(valor_parametro), configurado_por = VALUES(configurado_por)`,
    [String(minimo), idUsuario]
  );
};

/** RF11 · Mínimo efectivo de un libro: el suyo si lo tiene, si no el de por defecto. */
export const getMinimoDeLibro = async (db, idLibro) => {
  const [[fila]] = await db.query(
    'SELECT stock_minimo_personalizado AS propio FROM inventarios WHERE id_libro = ? AND id_libreria = ?',
    [idLibro, ID_LIBRERIA]
  );
  return fila?.propio != null ? Number(fila.propio) : getMinimoDefecto(db);
};

/**
 * RF11 · Pone (o quita, con `null`) el mínimo propio de un libro.
 * Si con el nuevo mínimo el libro queda en o por debajo, se genera la alerta de una vez (RF10).
 * @param {number} idLibro
 * @param {number|null} minimo
 */
export const setMinimoDeLibro = async (idLibro, minimo) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT IGNORE INTO inventarios (stock_actual, stock_minimo, id_libreria, id_libro) VALUES (0, 0, ?, ?)`,
      [ID_LIBRERIA, idLibro]
    );
    const [[fila]] = await conn.query(
      `SELECT i.stock_actual, l.titulo FROM inventarios i JOIN libros l ON l.id_libro = i.id_libro
       WHERE i.id_libro = ? AND i.id_libreria = ? FOR UPDATE`,
      [idLibro, ID_LIBRERIA]
    );
    if (!fila) throw new ErrorInventario('El libro no existe', 404);
    const antes = await getMinimoDeLibro(conn, idLibro);
    await conn.query(
      'UPDATE inventarios SET stock_minimo_personalizado = ? WHERE id_libro = ? AND id_libreria = ?',
      [minimo, idLibro, ID_LIBRERIA]
    );
    const ahora = await getMinimoDeLibro(conn, idLibro);
    // Subir el mínimo puede dejar al libro "bajo" sin que se haya vendido nada: también se avisa.
    if (fila.stock_actual <= ahora && fila.stock_actual > antes) {
      await crearAlertaStock(conn, { idLibro, titulo: fila.titulo, stock: fila.stock_actual, minimo: ahora });
    }
    await conn.commit();
    return { minimo: ahora, propio: minimo };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

/* ---------------------------------------------------------------
   RF10 · NOTIFICACIONES DE STOCK BAJO
   --------------------------------------------------------------- */

/**
 * RF10 · Guarda la notificación del panel y, si el servidor tiene ALERTAS_CORREO,
 * manda también un correo (opcional).
 * Va dentro de la misma transacción que el movimiento: si la venta se deshace, la alerta también.
 */
const crearAlertaStock = async (conn, { idLibro, titulo, stock, minimo }) => {
  const mensaje = stock === 0
    ? `«${titulo}» se agotó (mínimo ${minimo}).`
    : `Quedan ${stock} unidad(es) de «${titulo}» (mínimo ${minimo}).`;
  const [r] = await conn.query(
    "INSERT INTO notificaciones (tipo, id_libro, mensaje) VALUES ('stock_bajo', ?, ?)",
    [idLibro, mensaje]
  );
  avisarPorCorreo(r.insertId, mensaje);
};

/**
 * RF10 (opcional) · Correo al encargado. No bloquea la venta: se manda unos segundos después
 * y solo si la notificación sigue existiendo (si la transacción se deshizo, no existe y no se manda).
 */
const avisarPorCorreo = (idNotificacion, mensaje) => {
  const para = process.env.ALERTAS_CORREO;
  if (!para) return;
  setTimeout(async () => {
    try {
      const [[existe]] = await pool.query('SELECT 1 AS ok FROM notificaciones WHERE id_notificacion = ?', [idNotificacion]);
      if (!existe) return;
      const { enviarCorreo } = await import('../services/correo.js');
      await enviarCorreo({
        para,
        asunto: 'Librería Andrés · Stock bajo',
        texto: `${mensaje}\n\nRevisa el inventario en el panel de administración.`,
        html: `<p>${mensaje.replace(/</g, '&lt;')}</p><p>Revisa el inventario en el panel de administración.</p>`
      });
    } catch (error) {
      console.error('RF10 · No se pudo enviar el correo de stock bajo:', error.message);
    }
  }, 3000);
};

/** RF10 · Notificaciones más recientes y cuántas faltan por leer. */
export const getNotificaciones = async (limite = 30) => {
  const [rows] = await pool.query(
    `SELECT n.id_notificacion, n.tipo, n.id_libro, n.mensaje, n.leida, n.fecha,
            CAST(COALESCE(i.stock_actual, 0) AS SIGNED) AS stock_actual
     FROM notificaciones n
     LEFT JOIN inventarios i ON i.id_libro = n.id_libro AND i.id_libreria = ?
     ORDER BY n.fecha DESC, n.id_notificacion DESC LIMIT ?`,
    [ID_LIBRERIA, limite]
  );
  const [[{ sinLeer }]] = await pool.query('SELECT COUNT(*) AS sinLeer FROM notificaciones WHERE leida = 0');
  return { notificaciones: rows, sinLeer: Number(sinLeer) };
};

/** RF10 · Marca como leídas todas (o solo una si se pasa el id). */
export const marcarLeidas = async (idNotificacion = null) => {
  if (idNotificacion) {
    await pool.query('UPDATE notificaciones SET leida = 1 WHERE id_notificacion = ?', [idNotificacion]);
  } else {
    await pool.query('UPDATE notificaciones SET leida = 1 WHERE leida = 0');
  }
};

/**
 * RF14 · Inventario completo: cada libro con su cantidad actual, el stock mínimo
 * y cuántas unidades se han vendido (sin contar pedidos devueltos).
 * @returns {Promise<Array<Object>>}
 */
export const getInventario = async () => {
  const defecto = await getMinimoDefecto();
  const [rows] = await pool.query(
    `SELECT l.id_libro, l.titulo, l.autor, l.ISBN, l.genero, l.portada, l.precio, l.disponibilidad,
            -- CAST: que lleguen como número y no como texto al frontend
            CAST(COALESCE(i.stock_actual, 0) AS SIGNED) AS stock,
            -- RF11: mínimo efectivo (el propio del libro o, si no tiene, el de por defecto)
            CAST(COALESCE(i.stock_minimo_personalizado, ?) AS SIGNED) AS stock_minimo,
            i.stock_minimo_personalizado AS minimo_propio,
            CAST(COALESCE((
              SELECT SUM(pl.cantidad) FROM pedido_libro pl
              JOIN pedidos p ON p.id_pedido = pl.id_pedido
              WHERE pl.id_libro = l.id_libro AND p.estado = 'Activo'
            ), 0) AS SIGNED) AS vendidos
     FROM libros l
     LEFT JOIN inventarios i ON i.id_libro = l.id_libro AND i.id_libreria = ?
     ORDER BY l.titulo`,
    [defecto, ID_LIBRERIA]
  );
  return rows;
};

/**
 * RF14 · Últimos movimientos del stock (historial), del más reciente al más antiguo.
 * @param {number} [limite=25]
 */
export const getMovimientos = async (limite = 25) => {
  const [rows] = await pool.query(
    `SELECT m.id_movimiento, m.fecha_movimiento, m.tipo_movimiento, m.cantidad,
            m.stock_anterior, m.stock_nuevo, m.id_pedido,
            l.titulo, u.nombre AS usuario_nombre
     FROM movimientos m
     JOIN inventarios i ON i.id_inventario = m.id_inventario
     JOIN libros l ON l.id_libro = i.id_libro
     LEFT JOIN usuarios u ON u.id = m.id_usuario
     ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC
     LIMIT ?`,
    [limite]
  );
  return rows;
};
