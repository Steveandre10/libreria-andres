import pool from '../config/db.js';

/**
 * @file casos.model.js
 * @description RF28 + RF30 · Atención al cliente.
 *   - El cliente pulsa "Contactar" en un pedido (RF28) -> se crea un CASO con número, cliente,
 *     motivo y estado, más su primer mensaje.
 *   - Cada respuesta (del cliente o de soporte) queda en `casos_mensajes`: ese es el historial.
 *   - Estados: Abierto -> En proceso (cuando soporte responde) -> Cerrado.
 *     Si el cliente escribe en un caso cerrado, se vuelve a abrir.
 */

export const MOTIVOS_CASO = ['Estado de mi pedido', 'Problema con el pago', 'Factura', 'Devolución o cambio', 'Libro dañado o incompleto', 'Otra consulta'];
export const ESTADOS_CASO = ['Abierto', 'En proceso', 'Cerrado'];

export class ErrorCaso extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

/** Datos del caso (sin mensajes). */
const SELECT_CASO = `
  SELECT c.id_caso, c.id_usuario, c.id_pedido, c.motivo, c.estado, c.id_asignado,
         c.fecha_creacion, c.fecha_actualizacion, c.fecha_cierre,
         u.nombre AS cliente, u.email AS cliente_email, a.nombre AS asignado,
         (SELECT COUNT(*) FROM casos_mensajes m WHERE m.id_caso = c.id_caso) AS mensajes,
         (SELECT m.mensaje FROM casos_mensajes m WHERE m.id_caso = c.id_caso ORDER BY m.id_mensaje DESC LIMIT 1) AS ultimo_mensaje,
         (SELECT m.es_personal FROM casos_mensajes m WHERE m.id_caso = c.id_caso ORDER BY m.id_mensaje DESC LIMIT 1) AS ultimo_es_personal
  FROM casos c
  JOIN usuarios u ON u.id = c.id_usuario
  LEFT JOIN usuarios a ON a.id = c.id_asignado`;

/** Mensajes de un caso, del más antiguo al más reciente. */
const getMensajes = async (idCaso) => {
  const [rows] = await pool.query(
    `SELECT m.id_mensaje, m.mensaje, m.es_personal, m.fecha, u.nombre AS autor
     FROM casos_mensajes m LEFT JOIN usuarios u ON u.id = m.id_usuario
     WHERE m.id_caso = ? ORDER BY m.id_mensaje ASC`, [idCaso]
  );
  return rows.map(m => ({ ...m, es_personal: !!m.es_personal }));
};

/** Un caso con todo su historial. */
export const getCaso = async (idCaso) => {
  const [[caso]] = await pool.query(`${SELECT_CASO} WHERE c.id_caso = ?`, [idCaso]);
  if (!caso) return null;
  return { ...caso, historial: await getMensajes(idCaso) };
};

/**
 * RF28 · El cliente abre un caso (normalmente desde el detalle de su pedido).
 * Si ya hay un caso SIN cerrar sobre ese mismo pedido, el mensaje se agrega ahí (no se duplica).
 */
export const crearCaso = async ({ idUsuario, idPedido, motivo, mensaje }) => {
  if (idPedido) {
    const [[p]] = await pool.query('SELECT id FROM pedidos WHERE id_pedido = ?', [idPedido]);
    if (!p) throw new ErrorCaso('El pedido no existe', 404);
    if (p.id !== idUsuario) throw new ErrorCaso('Ese pedido no es tuyo', 403);
    const [[abierto]] = await pool.query(
      "SELECT id_caso FROM casos WHERE id_pedido = ? AND id_usuario = ? AND estado <> 'Cerrado' ORDER BY id_caso DESC LIMIT 1",
      [idPedido, idUsuario]
    );
    if (abierto) {
      await agregarMensaje({ idCaso: abierto.id_caso, idUsuario, esPersonal: false, mensaje });
      return { idCaso: abierto.id_caso, nuevo: false };
    }
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('INSERT INTO casos (id_usuario, id_pedido, motivo) VALUES (?, ?, ?)', [idUsuario, idPedido || null, motivo]);
    await conn.query('INSERT INTO casos_mensajes (id_caso, id_usuario, es_personal, mensaje) VALUES (?, ?, 0, ?)', [r.insertId, idUsuario, mensaje]);
    await conn.commit();
    return { idCaso: r.insertId, nuevo: true };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

/**
 * Agrega un mensaje al historial y ajusta el estado:
 *   - responde soporte  -> "En proceso" (y queda asignado a quien respondió si no tenía a nadie)
 *   - escribe el cliente en un caso cerrado -> vuelve a "Abierto"
 */
export const agregarMensaje = async ({ idCaso, idUsuario, esPersonal, mensaje }) => {
  const [[caso]] = await pool.query('SELECT estado, id_asignado FROM casos WHERE id_caso = ?', [idCaso]);
  if (!caso) throw new ErrorCaso('El caso no existe', 404);
  await pool.query('INSERT INTO casos_mensajes (id_caso, id_usuario, es_personal, mensaje) VALUES (?, ?, ?, ?)', [idCaso, idUsuario, esPersonal ? 1 : 0, mensaje]);
  if (esPersonal && caso.estado === 'Abierto') {
    await pool.query("UPDATE casos SET estado = 'En proceso', id_asignado = COALESCE(id_asignado, ?) WHERE id_caso = ?", [idUsuario, idCaso]);
  } else if (!esPersonal && caso.estado === 'Cerrado') {
    await pool.query("UPDATE casos SET estado = 'Abierto', fecha_cierre = NULL WHERE id_caso = ?", [idCaso]);
  } else {
    await pool.query('UPDATE casos SET fecha_actualizacion = NOW() WHERE id_caso = ?', [idCaso]);
  }
};

/** RF30 · Soporte cambia el estado (y opcionalmente se asigna el caso). */
export const cambiarEstado = async ({ idCaso, estado, idUsuario }) => {
  const [[caso]] = await pool.query('SELECT estado FROM casos WHERE id_caso = ?', [idCaso]);
  if (!caso) throw new ErrorCaso('El caso no existe', 404);
  if (caso.estado === estado) throw new ErrorCaso(`El caso ya está "${estado}"`, 409);
  await pool.query(
    `UPDATE casos SET estado = ?, fecha_cierre = ${estado === 'Cerrado' ? 'NOW()' : 'NULL'},
            id_asignado = COALESCE(id_asignado, ?) WHERE id_caso = ?`,
    [estado, idUsuario, idCaso]
  );
};

/** RF30 · Lista para soporte, filtrable por estado y por cliente (nombre, correo o número de caso/pedido). */
export const buscarCasos = async ({ estado, cliente }) => {
  const where = [];
  const params = [];
  if (estado) { where.push('c.estado = ?'); params.push(estado); }
  if (cliente) {
    const numero = Number(String(cliente).replace(/\D/g, ''));
    where.push(`(u.nombre LIKE ? OR u.email LIKE ?${numero ? ' OR c.id_caso = ? OR c.id_pedido = ?' : ''})`);
    params.push(`%${cliente}%`, `%${cliente}%`);
    if (numero) params.push(numero, numero);
  }
  const [rows] = await pool.query(
    `${SELECT_CASO} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY FIELD(c.estado, 'Abierto', 'En proceso', 'Cerrado'), c.fecha_actualizacion DESC LIMIT 300`,
    params
  );
  const [conteo] = await pool.query('SELECT estado, COUNT(*) AS n FROM casos GROUP BY estado');
  const totales = Object.fromEntries(ESTADOS_CASO.map(e => [e, 0]));
  conteo.forEach(c => { totales[c.estado] = Number(c.n); });
  return { casos: rows, totales };
};

/** RF28 · Los casos de un cliente (con historial), opcionalmente de un pedido. */
export const getCasosDeCliente = async (idUsuario, idPedido = null) => {
  const [rows] = await pool.query(
    `${SELECT_CASO} WHERE c.id_usuario = ? ${idPedido ? 'AND c.id_pedido = ?' : ''} ORDER BY c.id_caso DESC`,
    idPedido ? [idUsuario, idPedido] : [idUsuario]
  );
  return Promise.all(rows.map(async c => ({ ...c, historial: await getMensajes(c.id_caso) })));
};
