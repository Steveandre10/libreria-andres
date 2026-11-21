import express from 'express';
import pool from '../config/db.js';
import { getNota } from '../models/notas.model.js';
import { getPermisosDeRol } from '../models/roles.model.js';
import { verificarToken } from '../middlewares/auth.middleware.js';

/**
 * @file notas.routes.js
 * @description RF4 · GET /api/notas/:id -> una nota crédito/débito completa.
 * La ve el cliente dueño de la compra o el personal con permiso del módulo "facturas".
 */
const router = express.Router();

router.get('/:id', verificarToken, async (req, res) => {
  try {
    const nota = await getNota(Number(req.params.id));
    let permitido = nota && nota.id_cliente === req.usuario.id;
    if (nota && !permitido) {
      const [[u]] = await pool.query('SELECT rol FROM usuarios WHERE id = ?', [req.usuario.id]);
      permitido = (await getPermisosDeRol(u?.rol)).some(p => p.modulo === 'facturas' && p.ver);
    }
    // 404 también si es ajena: no revelamos que existe
    if (!permitido) return res.status(404).json({ error: 'La nota no existe.' });
    res.json({ nota });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
