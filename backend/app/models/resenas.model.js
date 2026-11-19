import pool from '../config/db.js';
import { actualizarPromedioResena } from './libros.model.js';

/**
 * Obtiene todas las reseñas asociadas a un libro específico, incluyendo el nombre del usuario.
 * 
 * @async
 * @function getResenasByLibro
 * @param {number|string} idLibro - ID del libro.
 * @returns {Promise<Array<Object>>} Lista de reseñas.
 */
export const getResenasByLibro = async (idLibro) => {
  const [rows] = await pool.query(
    `SELECT 
      r.id_reseña,
      r.reseña,
      r.fecha,
      r.calificacion,
      r.id as id_usuario,
      r.id_libro,
      COALESCE(u.nombre, 'Lector apasionado') as usuario_nombre
     FROM reseñas r
     LEFT JOIN usuarios u ON r.id = u.id
     WHERE r.id_libro = ?
     ORDER BY r.fecha DESC, r.id_reseña DESC`,
    [idLibro]
  );
  return rows;
};

/**
 * Obtiene todas las reseñas de la tienda (vista del dueño), con el nombre del lector y el título del libro.
 *
 * @async
 * @function getAllResenas
 * @returns {Promise<Array<Object>>} Lista de reseñas, de la más reciente a la más antigua.
 */
export const getAllResenas = async () => {
  const [rows] = await pool.query(
    `SELECT
      r.id_reseña,
      r.reseña,
      r.fecha,
      r.calificacion,
      r.id as id_usuario,
      r.id_libro,
      COALESCE(u.nombre, 'Lector apasionado') as usuario_nombre,
      l.titulo as libro_titulo
     FROM reseñas r
     LEFT JOIN usuarios u ON r.id = u.id
     LEFT JOIN libros l ON r.id_libro = l.id_libro
     ORDER BY r.fecha DESC, r.id_reseña DESC`
  );
  return rows;
};

/**
 * Inserta una nueva reseña en la base de datos y recalcula el promedio del libro.
 * 
 * @async
 * @function crearResena
 * @param {Object} datos - Objeto con reseña, calificacion, id_usuario, id_libro.
 * @returns {Promise<Object>} Reseña creada con insertId.
 */
export const crearResena = async (datos) => {
  const { reseña, calificacion = 5.0, id_usuario = null, id_libro } = datos;

  const [result] = await pool.query(
    `INSERT INTO reseñas (reseña, fecha, calificacion, id, id_libro)
     VALUES (?, CURDATE(), ?, ?, ?)`,
    [reseña, parseFloat(calificacion), id_usuario, id_libro]
  );

  // Recalcular y actualizar promedio en la tabla libros
  const nuevoPromedio = await actualizarPromedioResena(id_libro);

  return {
    id_reseña: result.insertId,
    reseña,
    fecha: new Date().toISOString().split('T')[0],
    calificacion: parseFloat(calificacion),
    id_usuario,
    id_libro,
    nuevo_promedio_libro: nuevoPromedio
  };
};

/**
 * Elimina una reseña por su ID.
 * 
 * @async
 * @function eliminarResena
 * @param {number|string} idResena - ID de la reseña.
 * @param {number|string} idLibro - ID del libro al que pertenecía.
 * @returns {Promise<void>}
 */
export const eliminarResena = async (idResena, idLibro) => {
  await pool.query('DELETE FROM reseñas WHERE id_reseña = ?', [idResena]);
  if (idLibro) {
    await actualizarPromedioResena(idLibro);
  }
};
