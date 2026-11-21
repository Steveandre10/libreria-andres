import pool from '../config/db.js';

/** RF18 · Módulos de la administración que se pueden proteger con permisos. */
export const MODULOS = ['resumen', 'libros', 'inventario', 'facturas', 'reportes', 'soporte', 'usuarios', 'resenas', 'roles', 'auditoria', 'configuracion']; // RF14: + inventario · RF17: + configuracion · RF7: + facturas

/** Convierte una fila de rol_permisos en { modulo, ver, editar }. */
const aPermiso = (p) => ({ modulo: p.modulo, ver: !!p.puede_ver, editar: !!p.puede_editar });

/**
 * RF18 · Lista todos los roles con sus permisos y cuántos usuarios tiene cada uno.
 * @returns {Promise<Array<Object>>}
 */
export const getRoles = async () => {
  const [roles] = await pool.query(
    `SELECT r.clave, r.nombre, r.descripcion, r.es_base,
            (SELECT COUNT(*) FROM usuarios u WHERE u.rol = r.clave) AS total_usuarios
     FROM roles r
     ORDER BY r.es_base DESC, r.nombre`
  );
  const [permisos] = await pool.query('SELECT * FROM rol_permisos');
  return roles.map(r => ({
    ...r,
    permisos: permisos.filter(p => p.clave_rol === r.clave).map(aPermiso)
  }));
};

/** RF18 · Busca un rol por su clave. Devuelve null si no existe. */
export const getRolPorClave = async (clave) => {
  const [rows] = await pool.query('SELECT * FROM roles WHERE clave = ?', [clave]);
  return rows[0] || null;
};

/**
 * RF18 · Permisos de un rol. El administrador siempre tiene todo.
 * @param {string} clave - Clave del rol.
 * @returns {Promise<Array<{modulo:string, ver:boolean, editar:boolean}>>}
 */
export const getPermisosDeRol = async (clave) => {
  if (clave === 'admin') return MODULOS.map(m => ({ modulo: m, ver: true, editar: true }));
  const [rows] = await pool.query('SELECT * FROM rol_permisos WHERE clave_rol = ?', [clave]);
  return rows.map(aPermiso);
};

/** RF18 · Inserta un rol nuevo (no base). */
export const crearRol = async ({ clave, nombre, descripcion }) => {
  await pool.query('INSERT INTO roles (clave, nombre, descripcion) VALUES (?, ?, ?)',
    [clave, nombre, descripcion || null]);
};

/** RF18 · Cambia el nombre y la descripción de un rol. */
export const actualizarDatosRol = async (clave, { nombre, descripcion }) => {
  await pool.query('UPDATE roles SET nombre = ?, descripcion = ? WHERE clave = ?',
    [nombre, descripcion || null, clave]);
};

/**
 * RF18 · Reemplaza los permisos de un rol. Usa una transacción: o se guardan
 * todos, o ninguno. Editar implica poder ver.
 */
export const guardarPermisos = async (clave, permisos = []) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM rol_permisos WHERE clave_rol = ?', [clave]);
    for (const p of permisos) {
      if (!MODULOS.includes(p.modulo)) continue;   // ignora módulos inventados
      const editar = !!p.editar;
      const ver = !!p.ver || editar;               // si edita, también ve
      if (!ver) continue;                          // sin permisos no se guarda fila
      await conn.query(
        'INSERT INTO rol_permisos (clave_rol, modulo, puede_ver, puede_editar) VALUES (?, ?, ?, ?)',
        [clave, p.modulo, ver, editar]
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

/** RF18 · Elimina un rol (sus permisos se borran solos por ON DELETE CASCADE). */
export const eliminarRol = async (clave) => {
  await pool.query('DELETE FROM roles WHERE clave = ?', [clave]);
};