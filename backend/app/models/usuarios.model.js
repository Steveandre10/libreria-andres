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
 * @param {string} usuario.password - Contraseña (hasheada con bcrypt).
 * @param {string} [usuario.rol='usuario'] - Rol del usuario ('usuario' o 'admin').
 * @returns {Promise<Object>} Datos del usuario registrado con su insertId asignado.
 */
export const crearUsuario = async (usuario) => {
  // RF16: también guarda cédula y dirección (antes el formulario las pedía pero se perdían)
  const { nombre, email, password, rol = 'usuario', cedula = null, direccion = null } = usuario;
  const [result] = await pool.query(
    'INSERT INTO usuarios (nombre, email, password, rol, cedula, direccion) VALUES (?, ?, ?, ?, ?, ?)',
    [nombre, email, password, rol, cedula || null, direccion || null]
  );
  return { id: result.insertId, nombre, email, rol };
};

/**
 * RF16 · Actualiza los datos de una cuenta. Solo toca los campos que llegan.
 * @param {number|string} id
 * @param {{nombre?:string, email?:string, cedula?:string|null, direccion?:string|null, password?:string, rol?:string, activo?:boolean}} campos
 *   `password` debe llegar ya cifrada con bcrypt.
 */
export const actualizarUsuario = async (id, campos) => {
  const permitidos = ['nombre', 'email', 'cedula', 'direccion', 'password', 'rol', 'activo'];
  const sets = [];
  const valores = [];
  for (const campo of permitidos) {
    if (campos[campo] !== undefined) {
      sets.push(`${campo} = ?`);          // el nombre de columna sale de la lista fija, nunca del usuario
      valores.push(campo === 'activo' ? (campos.activo ? 1 : 0) : campos[campo]);
    }
  }
  if (!sets.length) return;
  await pool.query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`, [...valores, id]);
};

/** RF16 · Desactiva una cuenta (no puede iniciar sesión, pero su historial se conserva). */
export const desactivarUsuario = async (id) => {
  await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [id]);
};

/**
 * Actualiza la contraseña hasheada de un usuario.
 * 
 * @async
 * @function updatePasswordModel
 * @param {number|string} id - ID del usuario.
 * @param {string} newHash - Nueva contraseña hasheada con bcrypt.
 * @returns {Promise<void>}
 */
export const updatePasswordModel = async (id, newHash) => {
  await pool.query('UPDATE usuarios SET password = ? WHERE id = ?', [newHash, id]);
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

/**
 * Cambia el rol de un usuario existente ('usuario' o 'admin').
 * 
 * @async
 * @function cambiarRolUsuario
 * @param {number|string} id - ID del usuario.
 * @param {string} nuevoRol - 'usuario' o 'admin'.
 * @returns {Promise<void>}
 */
export const cambiarRolUsuario = async (id, nuevoRol) => {
  await pool.query('UPDATE usuarios SET rol = ? WHERE id = ?', [nuevoRol, id]);
};
