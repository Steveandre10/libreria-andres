import pool from '../config/db.js';

/**
 * Obtiene todos los usuarios registrados en la base de datos.
 * 
 * @async
 * @function getAllUsuarios
 * @returns {Promise<Array<Object>>} Lista de objetos de usuario.
 */
export const getAllUsuarios = async () => {
  const [rows] = await pool.query('SELECT * FROM usuarios');
  return rows;
};

/**
 * Obtiene un usuario específico por su ID.
 * 
 * @async
 * @function getUsuarioById
 * @param {number|string} id - El identificador único del usuario.
 * @returns {Promise<Array<Object>>} Array con el usuario encontrado o vacío si no existe.
 */
export const getUsuarioById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [id]);
  return rows;
};

/**
 * Busca un usuario por su dirección de correo electrónico.
 * 
 * @async
 * @function getUsuarioByEmail
 * @param {string} email - Correo electrónico del usuario.
 * @returns {Promise<Array<Object>>} Array con el usuario que tiene ese email o vacío.
 */
export const getUsuarioByEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
  return rows;
};

/**
 * Inserta un nuevo usuario en la base de datos.
 * 
 * @async
 * @function crearUsuario
 * @param {Object} usuario - Datos del nuevo usuario.
 * @param {string} usuario.nombre - Nombre del usuario.
 * @param {string} usuario.email - Correo electrónico único del usuario.
 * @param {string} usuario.password - Contraseña (texto plano).
 * @returns {Promise<Object>} Datos del usuario registrado con su insertId asignado.
 */
export const crearUsuario = async (usuario) => {
  const { nombre, email, password } = usuario;
  const [result] = await pool.query(
    'INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)',
    [nombre, email, password]
  );
  return { id: result.insertId, nombre, email };
};

/**
 * Elimina un usuario de la base de datos a partir de su ID.
 * 
 * @async
 * @function eliminarUsuario
 * @param {number|string} id - ID del usuario a eliminar.
 * @returns {Promise<void>}
 */
export const eliminarUsuario = async (id) => {
  await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
};
