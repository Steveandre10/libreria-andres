import pool from '../config/db.js';
import { ErrorInventario } from './inventario.model.js';

/**
 * @file tienda.model.js
 * @description RF17 · Opciones básicas de la tienda que el administrador ajusta sin tocar código:
 * métodos de pago (activar/desactivar) y tipos de envío (nombre, tiempo y costo).
 * El carrito las lee de aquí, así que cualquier cambio se ve en la siguiente compra.
 */

/* ------------------------------ MÉTODOS DE PAGO ------------------------------ */

/**
 * Lista los métodos de pago. Con `soloActivos` devuelve solo los que el cliente puede usar.
 * @param {{soloActivos?: boolean}} [opciones]
 */
export const getMetodosPago = async ({ soloActivos = false } = {}) => {
  const [rows] = await pool.query(
    `SELECT id_metodo_pago, nombre_metodo, descripcion, (estado = 'Disponible') AS activo
     FROM metodos_pago ${soloActivos ? "WHERE estado = 'Disponible'" : ''}
     ORDER BY id_metodo_pago`
  );
  return rows.map(r => ({ ...r, activo: !!r.activo }));
};

/** Activa o desactiva un método de pago. */
export const setMetodoPagoActivo = async (id, activo) => {
  const [r] = await pool.query(
    'UPDATE metodos_pago SET estado = ? WHERE id_metodo_pago = ?',
    [activo ? 'Disponible' : 'No activo', id]
  );
  if (!r.affectedRows) throw new ErrorInventario('El método de pago no existe.', 404);
};

/* ------------------------------ TIPOS DE ENVÍO ------------------------------ */

/**
 * Lista los tipos de envío (del más barato al más caro). Con `soloActivos`, solo los visibles en el carrito.
 * @param {{soloActivos?: boolean}} [opciones]
 */
export const getTiposEnvio = async ({ soloActivos = false } = {}) => {
  const [rows] = await pool.query(
    `SELECT id_tipo_envio, nombre, descripcion, tiempo_estimado, CAST(costo AS DECIMAL(10,2)) AS costo, activo
     FROM tipos_envio ${soloActivos ? 'WHERE activo = 1' : ''}
     ORDER BY costo, id_tipo_envio`
  );
  return rows.map(r => ({ ...r, costo: Number(r.costo), activo: !!r.activo }));
};

/** Crea un tipo de envío. */
export const crearTipoEnvio = async ({ nombre, descripcion, tiempo_estimado, costo, activo = true }, idUsuario) => {
  const [r] = await pool.query(
    `INSERT INTO tipos_envio (nombre, descripcion, tiempo_estimado, costo, activo, actualizado_por)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [nombre, descripcion || null, tiempo_estimado || null, costo, activo ? 1 : 0, idUsuario]
  );
  return r.insertId;
};

/** Cambia un tipo de envío (todos sus datos). */
export const actualizarTipoEnvio = async (id, { nombre, descripcion, tiempo_estimado, costo, activo }, idUsuario) => {
  const [r] = await pool.query(
    `UPDATE tipos_envio
     SET nombre = ?, descripcion = ?, tiempo_estimado = ?, costo = ?, activo = ?, actualizado_por = ?
     WHERE id_tipo_envio = ?`,
    [nombre, descripcion || null, tiempo_estimado || null, costo, activo ? 1 : 0, idUsuario, id]
  );
  if (!r.affectedRows) throw new ErrorInventario('El tipo de envío no existe.', 404);
};

/** Activa o desactiva un tipo de envío (interruptor rápido de la tabla). */
export const setTipoEnvioActivo = async (id, activo, idUsuario) => {
  const [r] = await pool.query(
    'UPDATE tipos_envio SET activo = ?, actualizado_por = ? WHERE id_tipo_envio = ?',
    [activo ? 1 : 0, idUsuario, id]
  );
  if (!r.affectedRows) throw new ErrorInventario('El tipo de envío no existe.', 404);
};

/**
 * Elimina un tipo de envío. Si ya se usó en pedidos, la BD no lo permite (es historial):
 * en ese caso se pide desactivarlo.
 */
export const eliminarTipoEnvio = async (id) => {
  try {
    const [r] = await pool.query('DELETE FROM tipos_envio WHERE id_tipo_envio = ?', [id]);
    if (!r.affectedRows) throw new ErrorInventario('El tipo de envío no existe.', 404);
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      throw new ErrorInventario('Este envío ya se usó en pedidos. Desactívalo en vez de eliminarlo.');
    }
    throw error;
  }
};

/* ----------------------- VALIDACIÓN AL COMPRAR (RF17) ----------------------- */

/**
 * Devuelve el método de pago SOLO si está activo; si no, lanza un error claro.
 * La usa la compra: aunque el carrito del cliente esté abierto desde antes,
 * no se puede pagar con un método que el admin acaba de desactivar.
 */
export const exigirMetodoActivo = async (conn, id) => {
  const [[m]] = await conn.query(
    `SELECT id_metodo_pago, nombre_metodo FROM metodos_pago WHERE id_metodo_pago = ? AND estado = 'Disponible'`,
    [id]
  );
  if (!m) throw new ErrorInventario('Ese método de pago ya no está disponible. Elige otro.');
  return m;
};

/** Igual que el anterior, para el tipo de envío. Devuelve su costo actual. */
export const exigirEnvioActivo = async (conn, id) => {
  const [[e]] = await conn.query(
    'SELECT id_tipo_envio, nombre, costo FROM tipos_envio WHERE id_tipo_envio = ? AND activo = 1',
    [id]
  );
  if (!e) throw new ErrorInventario('Ese tipo de envío ya no está disponible. Elige otro.');
  return { ...e, costo: Number(e.costo) };
};
