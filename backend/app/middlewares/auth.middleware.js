import jwt from 'jsonwebtoken';
import config from '../config/environments/index.js';
import pool from '../config/db.js';
import { getPermisosDeRol } from '../models/roles.model.js';

/**
 * Middleware para verificar si el usuario envía un token JWT válido
 */
export const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
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
