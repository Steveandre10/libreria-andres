import pool from '../config/db.js';

/** RF13 · Librería dueña del inventario (la fila id 1 de la tabla librerias). */
const ID_LIBRERIA = 1;

/** RF13 · La disponibilidad sale del stock: con unidades = Disponible, sin unidades = Agotado. */
const estadoPorStock = (stock) => (stock > 0 ? 'Disponible' : 'Agotado');

/**
 * RF13 · Toda consulta de libros trae también su stock desde inventarios.
 * LEFT JOIN: si un libro aún no tiene fila de inventario, igual aparece (con stock 0).
 */
const SELECT_LIBRO = `
  SELECT l.*, COALESCE(i.stock_actual, 0) AS stock
  FROM libros l
  LEFT JOIN inventarios i ON i.id_libro = l.id_libro AND i.id_libreria = ${ID_LIBRERIA}`;

/**
 * Obtiene todos los libros con su stock, con filtros opcionales.
 * @param {Object} [filtros={}] - search, genero, disponibilidad.
 * @returns {Promise<Array<Object>>}
 */
export const getAllLibros = async (filtros = {}) => {
  let query = `${SELECT_LIBRO} WHERE 1=1`;
  const params = [];

  if (filtros.search) {
    query += ' AND (l.titulo LIKE ? OR l.autor LIKE ? OR l.ISBN LIKE ? OR l.genero LIKE ?)';
    const termino = `%${filtros.search}%`;
    params.push(termino, termino, termino, termino);
  }
  if (filtros.genero && filtros.genero !== 'Todos') {
    query += ' AND l.genero = ?';
    params.push(filtros.genero);
  }
  if (filtros.disponibilidad) {
    query += ' AND l.disponibilidad = ?';
    params.push(filtros.disponibilidad);
  }

  query += ' ORDER BY l.id_libro DESC';
  const [rows] = await pool.query(query, params);
  return rows;
};

/** Obtiene un libro (con su stock) por su ID, o null si no existe. */
export const getLibroById = async (id) => {
  const [rows] = await pool.query(`${SELECT_LIBRO} WHERE l.id_libro = ?`, [id]);
  return rows[0] || null;
};

/**
 * RF13 · Registra un libro y su fila de inventario en UNA transacción:
 * o se guardan los dos, o ninguno.
 * @param {Object} libro - Datos del libro, incluido stock (cantidad inicial).
 */
export const crearLibro = async (libro) => {
  const {
    titulo, ISBN = null, genero = 'General', autor = 'Anónimo',
    precio = 19.99, portada = null, descripcion = null, stock = 0
  } = libro;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO libros (titulo, ISBN, genero, autor, precio, portada, descripcion, disponibilidad, id_libreria)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [titulo, ISBN, genero, autor, precio, portada, descripcion, estadoPorStock(stock), ID_LIBRERIA]
    );
    await conn.query(
      'INSERT INTO inventarios (stock_actual, stock_minimo, id_libreria, id_libro) VALUES (?, 0, ?, ?)',
      [stock, ID_LIBRERIA, result.insertId]
    );
    await conn.commit();
    return {
      id_libro: result.insertId, titulo, ISBN, genero, autor, precio,
      portada, descripcion, stock, disponibilidad: estadoPorStock(stock)
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

/**
 * RF13 · Actualiza los datos del libro y, si viene, su stock.
 * La disponibilidad se recalcula sola a partir del stock.
 */
export const actualizarLibro = async (id, libro) => {
  const { titulo, ISBN, genero, autor, precio, portada, descripcion, stock } = libro;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE libros SET
        titulo = COALESCE(?, titulo),
        ISBN = COALESCE(?, ISBN),
        genero = COALESCE(?, genero),
        autor = COALESCE(?, autor),
        precio = COALESCE(?, precio),
        portada = COALESCE(?, portada),
        descripcion = COALESCE(?, descripcion)
       WHERE id_libro = ?`,
      [titulo, ISBN, genero, autor, precio, portada, descripcion, id]
    );

    if (stock !== undefined) {
      // Si el libro no tenía fila de inventario la crea; si la tenía, cambia la cantidad
      await conn.query(
        `INSERT INTO inventarios (stock_actual, stock_minimo, id_libreria, id_libro)
         VALUES (?, 0, ?, ?)
         ON DUPLICATE KEY UPDATE stock_actual = VALUES(stock_actual)`,
        [stock, ID_LIBRERIA, id]
      );
      await conn.query('UPDATE libros SET disponibilidad = ? WHERE id_libro = ?', [estadoPorStock(stock), id]);
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

/**
 * Elimina un libro. Antes borra lo que depende de él (inventario y reseñas),
 * porque sus llaves foráneas impedirían borrarlo.
 */
export const eliminarLibro = async (id) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM inventarios WHERE id_libro = ?', [id]);
    await conn.query('DELETE FROM reseñas WHERE id_libro = ?', [id]);
    await conn.query('DELETE FROM libros WHERE id_libro = ?', [id]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};
export const actualizarPromedioResena = async (idLibro) => {
  const [rows] = await pool.query(
    'SELECT ROUND(AVG(calificacion), 2) as promedio FROM reseñas WHERE id_libro = ?',
    [idLibro]
  );
  const promedio = rows[0]?.promedio || 5.00;
  await pool.query('UPDATE libros SET promedio_reseña = ? WHERE id_libro = ?', [promedio, idLibro]);
  return promedio;
};
