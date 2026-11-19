import pool from '../config/db.js';

/**
 * Obtiene todos los libros disponibles en la base de datos con filtros opcionales.
 * 
 * @async
 * @function getAllLibros
 * @param {Object} [filtros={}] - Filtros de búsqueda (search, genero, disponibilidad).
 * @returns {Promise<Array<Object>>} Lista de libros.
 */
export const getAllLibros = async (filtros = {}) => {
  let query = 'SELECT * FROM libros WHERE 1=1';
  const params = [];

  if (filtros.search) {
    query += ' AND (titulo LIKE ? OR autor LIKE ? OR ISBN LIKE ? OR genero LIKE ?)';
    const searchTerm = `%${filtros.search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (filtros.genero && filtros.genero !== 'Todos') {
    query += ' AND genero = ?';
    params.push(filtros.genero);
  }

  if (filtros.disponibilidad) {
    query += ' AND disponibilidad = ?';
    params.push(filtros.disponibilidad);
  }

  query += ' ORDER BY id_libro DESC';

  const [rows] = await pool.query(query, params);
  return rows;
};

/**
 * Obtiene un libro específico por su ID.
 * 
 * @async
 * @function getLibroById
 * @param {number|string} id - ID del libro.
 * @returns {Promise<Object|null>} El libro encontrado o null.
 */
export const getLibroById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM libros WHERE id_libro = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
};

/**
 * Crea un nuevo libro en la base de datos (Operación para Admin / Dueño de tienda).
 * 
 * @async
 * @function crearLibro
 * @param {Object} libro - Datos del libro.
 * @returns {Promise<Object>} Datos del libro creado con su id asignado.
 */
export const crearLibro = async (libro) => {
  const {
    titulo,
    ISBN = null,
    genero = 'General',
    autor = 'Anónimo',
    precio = 19.99,
    portada = null,
    descripcion = null,
    disponibilidad = 'Disponible',
    id_libreria = null
  } = libro;

  const [result] = await pool.query(
    `INSERT INTO libros 
      (titulo, ISBN, genero, autor, precio, portada, descripcion, disponibilidad, id_libreria) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [titulo, ISBN, genero, autor, precio, portada, descripcion, disponibilidad, id_libreria]
  );

  return {
    id_libro: result.insertId,
    titulo,
    ISBN,
    genero,
    autor,
    precio,
    portada,
    descripcion,
    disponibilidad,
    id_libreria
  };
};

/**
 * Actualiza la información de un libro existente.
 * 
 * @async
 * @function actualizarLibro
 * @param {number|string} id - ID del libro a actualizar.
 * @param {Object} libro - Nuevos datos.
 * @returns {Promise<void>}
 */
export const actualizarLibro = async (id, libro) => {
  const {
    titulo,
    ISBN,
    genero,
    autor,
    precio,
    portada,
    descripcion,
    disponibilidad,
    id_libreria
  } = libro;

  await pool.query(
    `UPDATE libros SET
      titulo = COALESCE(?, titulo),
      ISBN = COALESCE(?, ISBN),
      genero = COALESCE(?, genero),
      autor = COALESCE(?, autor),
      precio = COALESCE(?, precio),
      portada = COALESCE(?, portada),
      descripcion = COALESCE(?, descripcion),
      disponibilidad = COALESCE(?, disponibilidad),
      id_libreria = COALESCE(?, id_libreria)
     WHERE id_libro = ?`,
    [titulo, ISBN, genero, autor, precio, portada, descripcion, disponibilidad, id_libreria, id]
  );
};

/**
 * Elimina un libro de la base de datos por su ID.
 * 
 * @async
 * @function eliminarLibro
 * @param {number|string} id - ID del libro a eliminar.
 * @returns {Promise<void>}
 */
export const eliminarLibro = async (id) => {
  await pool.query('DELETE FROM libros WHERE id_libro = ?', [id]);
};

/**
 * Actualiza el promedio de reseña de un libro.
 * 
 * @async
 * @function actualizarPromedioResena
 * @param {number|string} idLibro - ID del libro.
 * @returns {Promise<number>} Nuevo promedio calculado.
 */
export const actualizarPromedioResena = async (idLibro) => {
  const [rows] = await pool.query(
    'SELECT ROUND(AVG(calificacion), 2) as promedio FROM reseñas WHERE id_libro = ?',
    [idLibro]
  );
  const promedio = rows[0]?.promedio || 5.00;
  await pool.query('UPDATE libros SET promedio_reseña = ? WHERE id_libro = ?', [promedio, idLibro]);
  return promedio;
};
