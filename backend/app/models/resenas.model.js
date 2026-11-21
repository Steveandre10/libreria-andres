import pool from '../config/db.js';
import { actualizarPromedioResena } from './libros.model.js';

/**
 * @file resenas.model.js
 * @description Reseñas de los libros.
 *   RF29 · Solo reseña quien compró el libro; 1 a 5 estrellas y comentario opcional.
 *   RF21 · Toda reseña nueva queda "Pendiente"; el administrador la aprueba, la rechaza o la elimina.
 *          En la ficha del libro (y en el promedio de estrellas) solo cuentan las "Aprobadas".
 */

/** Error de negocio con estado HTTP (400, 403, 404, 409…). */
export class ErrorResena extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

/** Reseñas APROBADAS de un libro (lo que ve cualquiera en la ficha). */
export const getResenasByLibro = async (idLibro) => {
  const [rows] = await pool.query(
    `SELECT r.id_reseña, r.reseña, r.fecha, r.calificacion, r.id AS id_usuario, r.id_libro,
            COALESCE(u.nombre, 'Lector apasionado') AS usuario_nombre
     FROM reseñas r
     LEFT JOIN usuarios u ON r.id = u.id
     WHERE r.id_libro = ? AND r.estado = 'Aprobada'
     ORDER BY r.fecha DESC, r.id_reseña DESC`,
    [idLibro]
  );
  return rows;
};

/**
 * RF21 · Todas las reseñas para la moderación (filtro opcional por estado).
 * @param {'Pendiente'|'Aprobada'|'Rechazada'|''} [estado]
 */
export const getAllResenas = async (estado = '') => {
  const [rows] = await pool.query(
    `SELECT r.id_reseña, r.reseña, r.fecha, r.calificacion, r.estado, r.motivo_moderacion, r.fecha_moderacion,
            r.id AS id_usuario, r.id_libro,
            COALESCE(u.nombre, 'Lector apasionado') AS usuario_nombre,
            l.titulo AS libro_titulo, m.nombre AS moderador
     FROM reseñas r
     LEFT JOIN usuarios u ON r.id = u.id
     LEFT JOIN libros l ON r.id_libro = l.id_libro
     LEFT JOIN usuarios m ON m.id = r.id_moderador
     ${estado ? 'WHERE r.estado = ?' : ''}
     ORDER BY (r.estado = 'Pendiente') DESC, r.fecha DESC, r.id_reseña DESC`,
    estado ? [estado] : []
  );
  return rows;
};

/** RF29 · ¿Este usuario compró el libro? (un pedido suyo que no se haya devuelto). */
export const comproElLibro = async (idUsuario, idLibro) => {
  const [[fila]] = await pool.query(
    `SELECT 1 AS si FROM pedidos p JOIN pedido_libro pl ON pl.id_pedido = p.id_pedido
     WHERE p.id = ? AND pl.id_libro = ? AND p.estado <> 'Devuelto' LIMIT 1`,
    [idUsuario, idLibro]
  );
  return !!fila;
};

/** RF29 · La reseña que ya dejó este usuario en el libro (si la hay), para mostrarle su estado. */
export const getMiResena = async (idUsuario, idLibro) => {
  const [[r]] = await pool.query(
    `SELECT id_reseña, reseña, calificacion, estado, motivo_moderacion, fecha
     FROM reseñas WHERE id = ? AND id_libro = ? ORDER BY id_reseña DESC LIMIT 1`,
    [idUsuario, idLibro]
  );
  return r || null;
};

/**
 * RF29 · Crea la reseña en estado Pendiente.
 *  - Solo si compró el libro.
 *  - Una por libro: si ya tiene una pendiente o aprobada, no deja otra (si se la rechazaron, puede escribir de nuevo).
 */
export const crearResena = async ({ idUsuario, idLibro, calificacion, comentario }) => {
  const [[libro]] = await pool.query('SELECT titulo FROM libros WHERE id_libro = ?', [idLibro]);
  if (!libro) throw new ErrorResena('El libro no existe', 404);
  if (!(await comproElLibro(idUsuario, idLibro))) {
    throw new ErrorResena('Solo puedes reseñar libros que hayas comprado.', 403);
  }
  const anterior = await getMiResena(idUsuario, idLibro);
  if (anterior && anterior.estado !== 'Rechazada') {
    throw new ErrorResena(anterior.estado === 'Pendiente'
      ? 'Ya enviaste una reseña de este libro y está esperando aprobación.'
      : 'Ya reseñaste este libro.', 409);
  }
  const [result] = await pool.query(
    `INSERT INTO reseñas (reseña, fecha, calificacion, id, id_libro, estado) VALUES (?, CURDATE(), ?, ?, ?, 'Pendiente')`,
    [comentario || null, calificacion, idUsuario, idLibro]
  );
  return { id_reseña: result.insertId, estado: 'Pendiente', titulo: libro.titulo };
};

/**
 * RF21 · Aprobar o rechazar. Recalcula el promedio del libro (solo cuentan aprobadas).
 * @param {{idResena:number, decision:'aprobar'|'rechazar', motivo?:string, idModerador:number}} datos
 */
export const moderarResena = async ({ idResena, decision, motivo, idModerador }) => {
  const [[r]] = await pool.query('SELECT id_libro, estado FROM reseñas WHERE id_reseña = ?', [idResena]);
  if (!r) throw new ErrorResena('La reseña no existe', 404);
  const estado = decision === 'aprobar' ? 'Aprobada' : 'Rechazada';
  await pool.query(
    `UPDATE reseñas SET estado = ?, motivo_moderacion = ?, id_moderador = ?, fecha_moderacion = NOW() WHERE id_reseña = ?`,
    [estado, motivo || null, idModerador, idResena]
  );
  await actualizarPromedioResena(r.id_libro);
  return { estado, idLibro: r.id_libro };
};

/** RF21 · Elimina la reseña y recalcula el promedio del libro. */
export const eliminarResena = async (idResena) => {
  const [[r]] = await pool.query('SELECT id_libro FROM reseñas WHERE id_reseña = ?', [idResena]);
  if (!r) throw new ErrorResena('La reseña no existe', 404);
  await pool.query('DELETE FROM reseñas WHERE id_reseña = ?', [idResena]);
  await actualizarPromedioResena(r.id_libro);
};
