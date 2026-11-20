import express from 'express';
import { getInventario, getMovimientos } from '../models/inventario.model.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';

const router = express.Router();

/**
 * GET /api/inventario · RF14: foto actual del inventario.
 * Devuelve todos los libros con su cantidad, los últimos movimientos y la hora del servidor.
 * El panel la pide cada pocos segundos para mostrar el stock "en tiempo real".
 */
router.get('/', verificarToken, requerirPermiso('inventario', 'ver'), async (req, res) => {
  try {
    const [libros, movimientos] = await Promise.all([getInventario(), getMovimientos(25)]);
    res.json({ libros, movimientos, actualizado: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
