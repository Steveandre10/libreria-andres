import jwt from 'jsonwebtoken';
import config from '../config/environments/index.js';
import pool from '../config/db.js';
import { getPermisosDeRol } from '../models/roles.model.js';

/**
 * Middleware para verificar si el usuario envía un token JWT válido
 */
export const verificarToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.JWT_SECRET);
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }

  // RF16: si el administrador eliminó o desactivó la cuenta, su sesión deja de servir
  // de inmediato (sin esperar a que venza el token de 24 h). 401 hace que la página cierre la sesión.
  try {
    const [rows] = await pool.query('SELECT activo FROM usuarios WHERE id = ?', [decoded.id]);
    if (!rows.length) return res.status(401).json({ error: 'La cuenta ya no existe' });
    if (rows[0].activo === 0) return res.status(401).json({ error: 'Esta cuenta está desactivada' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  req.usuario = decoded;
  next();
};

/**
 * RF18 · Deja pasar solo si el rol del usuario tiene permiso en el módulo.
 * Lee el rol desde la BD, no desde el token, para que un cambio de rol
 * aplique de inmediato sin esperar a que el token expire (24 h).
 * @param {string} modulo - resumen | libros | usuarios | resenas | roles
 * @param {'ver'|'editar'} accion
 */
export const requerirPermiso = (modulo, accion = 'ver') => async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT rol FROM usuarios WHERE id = ?', [req.usuario.id]);
    const rol = rows[0]?.rol;
    if (!rol) return res.status(401).json({ error: 'La cuenta ya no existe' });

    req.usuario.rol = rol;               // los controladores ven el rol actualizado
    if (rol === 'admin') return next();

    const permiso = (await getPermisosDeRol(rol)).find(p => p.modulo === modulo);
    if (permiso && permiso[accion]) return next();

    return res.status(403).json({
      error: `Acceso denegado: tu rol no tiene permiso para ${accion} en "${modulo}"`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * RF25 · Token OPCIONAL: si viene un token válido deja `req.usuario`; si no, sigue como visitante.
 * Sirve para rutas públicas que se personalizan cuando hay sesión (recomendaciones).
 */
export const tokenOpcional = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (token) {
    try {
      req.usuario = jwt.verify(token, config.JWT_SECRET);
    } catch {
      // token vencido o inválido: se atiende como visitante
    }
  }
  next();
};
