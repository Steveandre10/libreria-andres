import express from 'express';
import pool from '../config/db.js';
import { buscarFacturas, getFactura } from '../models/facturas.model.js';
import { getPermisosDeRol } from '../models/roles.model.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';

/**
 * @file facturas.routes.js
 * @description RF7 · Facturas.
 *   GET /api/facturas?pedido=17&desde=2026-11-01&hasta=2026-11-30  -> búsqueda (módulo "facturas")
 *   GET /api/facturas/:id                                          -> una factura completa
 *       (la ve el personal con permiso o el cliente DUEÑO de esa compra)
 */
const router = express.Router();

/** ¿La fecha tiene formato AAAA-MM-DD y es una fecha real? */
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());

router.get('/', verificarToken, requerirPermiso('facturas', 'ver'), async (req, res) => {
  try {
    const { desde = '', hasta = '' } = req.query;
    // Acepta "17", "0017" o "N.º 0017": se queda solo con los dígitos
    const pedidoTexto = String(req.query.pedido || '').replace(/\D/g, '');
    const pedido = pedidoTexto ? Number(pedidoTexto) : null;

    if (desde && !esFecha(desde)) return res.status(400).json({ error: 'La fecha inicial no es válida.' });
    if (hasta && !esFecha(hasta)) return res.status(400).json({ error: 'La fecha final no es válida.' });
    if (desde && hasta && desde > hasta) {
      return res.status(400).json({ error: 'La fecha inicial no puede ser posterior a la final.' });
    }

    res.json({ facturas: await buscarFacturas({ pedido, desde, hasta }) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', verificarToken, async (req, res) => {
  try {
    const factura = await getFactura(Number(req.params.id));
    if (!factura) return res.status(404).json({ error: 'La factura no existe.' });

    // El dueño de la compra siempre puede ver su factura; el resto necesita el permiso "facturas"
    if (factura.id_cliente !== req.usuario.id) {
      const [[usuario]] = await pool.query('SELECT rol FROM usuarios WHERE id = ?', [req.usuario.id]);
      const permisos = await getPermisosDeRol(usuario?.rol);
      if (!permisos.some(p => p.modulo === 'facturas' && p.ver)) {
        // 404 y no 403: no revelamos que existe una factura de otra persona
        return res.status(404).json({ error: 'La factura no existe.' });
      }
    }
    res.json({ factura });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
