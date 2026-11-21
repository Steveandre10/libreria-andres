import express from 'express';
import pool from '../config/db.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';

/**
 * @file auditoria.routes.js
 * @description RF15 · Consultar los logs (módulo "auditoria", solo el administrador por defecto).
 *   GET /api/auditoria?usuario=&accion=&modulo=&resultado=&desde=&hasta=&pagina=1
 *     -> { logs, total, pagina, porPagina, acciones, modulos, resumen }
 *   usuario: id exacto (selector) o texto (busca en el nombre/correo guardado).
 *   resumen: "reporte de uso" del rango (cuántos inicios de sesión, ventas, fallidos…).
 */
const router = express.Router();
const POR_PAGINA = 100;
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);

router.get('/', verificarToken, requerirPermiso('auditoria', 'ver'), async (req, res) => {
  try {
    const { usuario = '', accion = '', modulo = '', resultado = '', desde = '', hasta = '' } = req.query;
    if ((desde && !esFecha(desde)) || (hasta && !esFecha(hasta))) return res.status(400).json({ error: 'Fecha inválida (AAAA-MM-DD)' });
    if (desde && hasta && desde > hasta) return res.status(400).json({ error: 'La fecha "desde" no puede ser posterior a "hasta"' });
    const pagina = Math.max(1, Number(req.query.pagina) || 1);

    const where = [];
    const params = [];
    if (/^\d+$/.test(usuario)) { where.push('l.id_usuario = ?'); params.push(Number(usuario)); }
    else if (usuario) { where.push('l.usuario_nombre LIKE ?'); params.push(`%${usuario}%`); }
    if (accion) { where.push('l.accion = ?'); params.push(accion); }
    if (modulo) { where.push('l.modulo = ?'); params.push(modulo); }
    if (resultado) { where.push('l.resultado = ?'); params.push(resultado); }
    if (desde) { where.push('l.fecha >= ?'); params.push(desde); }
    if (hasta) { where.push('l.fecha < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(hasta); }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [logs] = await pool.query(
      `SELECT l.id_log, l.id_usuario, l.usuario_nombre, l.accion, l.modulo, l.descripcion, l.resultado, l.ip, l.fecha
       FROM logs_actividad l ${filtro} ORDER BY l.fecha DESC, l.id_log DESC LIMIT ? OFFSET ?`,
      [...params, POR_PAGINA, (pagina - 1) * POR_PAGINA]
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM logs_actividad l ${filtro}`, params);
    // Reporte de uso del mismo filtro: conteo por acción y resultado
    const [porAccion] = await pool.query(
      `SELECT l.accion, l.resultado, COUNT(*) AS n FROM logs_actividad l ${filtro} GROUP BY l.accion, l.resultado`, params
    );
    const [acciones] = await pool.query('SELECT DISTINCT accion FROM logs_actividad ORDER BY accion');
    const [modulos] = await pool.query('SELECT DISTINCT modulo FROM logs_actividad ORDER BY modulo');
    const [usuarios] = await pool.query(
      `SELECT DISTINCT l.id_usuario AS id, COALESCE(u.nombre, l.usuario_nombre) AS nombre
       FROM logs_actividad l LEFT JOIN usuarios u ON u.id = l.id_usuario WHERE l.id_usuario IS NOT NULL ORDER BY nombre`
    );

    const cuenta = (acc, res = null) => porAccion.filter(x => x.accion === acc && (!res || x.resultado === res)).reduce((s, x) => s + Number(x.n), 0);
    res.json({
      logs, total: Number(total), pagina, porPagina: POR_PAGINA,
      acciones: acciones.map(a => a.accion), modulos: modulos.map(m => m.modulo), usuarios,
      resumen: {
        total: Number(total),
        inicios: cuenta('Inicio de sesión', 'OK'),
        iniciosFallidos: cuenta('Inicio de sesión', 'Fallido'),
        ventas: cuenta('Venta', 'OK'),
        cambios: ['Crear', 'Editar', 'Eliminar', 'Ajuste', 'Moderar'].reduce((s, a) => s + cuenta(a, 'OK'), 0),
        fallidos: porAccion.filter(x => x.resultado === 'Fallido').reduce((s, x) => s + Number(x.n), 0)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
