import jwt from 'jsonwebtoken';
import config from '../config/environments/index.js';

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
 * Middleware para requerir rol de Administrador o Dueño
 */
export const requerirAdmin = (req, res, next) => {
  if (!req.usuario || req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido: Se requieren permisos de Administrador o Dueño' });
  }
  next();
};
