import express from 'express';
import {
  getInventario, getMovimientos, ErrorInventario,
  getNotificaciones, marcarLeidas, getMinimoDefecto, setMinimoDefecto, setMinimoDeLibro
} from '../models/inventario.model.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';

const router = express.Router();

/** Responde los errores de negocio (ErrorInventario) con su estado; el resto como 500. */
const responderError = (res, error) => {
  if (error instanceof ErrorInventario) return res.status(error.status).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: error.message });
};

/** RF11 · Valida un mínimo: entero de 0 a 9999. */
const minimoValido = (v) => Number.isInteger(v) && v >= 0 && v <= 9999;

/**
 * GET /api/inventario · RF14: foto actual del inventario.
 * Devuelve todos los libros con su cantidad, los últimos movimientos y la hora del servidor.
 * El panel la pide cada pocos segundos para mostrar el stock "en tiempo real".
 * RF10/RF11: también trae el mínimo por defecto y cuántas notificaciones hay sin leer.
 */
router.get('/', verificarToken, requerirPermiso('inventario', 'ver'), async (req, res) => {
  try {
    const [libros, movimientos, minimoDefecto, notif] = await Promise.all([
      getInventario(), getMovimientos(25), getMinimoDefecto(), getNotificaciones(30)
    ]);
    res.json({
      libros, movimientos, minimoDefecto,
      notificaciones: notif.notificaciones, sinLeer: notif.sinLeer,
      actualizado: new Date().toISOString()
    });
  } catch (error) {
    responderError(res, error);
  }
});

/** GET /api/inventario/notificaciones · RF10: avisos de stock bajo (más recientes primero). */
router.get('/notificaciones', verificarToken, requerirPermiso('inventario', 'ver'), async (req, res) => {
  try {
    res.json(await getNotificaciones(Math.min(Number(req.query.limite) || 30, 200)));
  } catch (error) {
    responderError(res, error);
  }
});

/** PUT /api/inventario/notificaciones/leer · RF10: marca como leídas (todas, o una con { id }). */
router.put('/notificaciones/leer', verificarToken, requerirPermiso('inventario', 'ver'), async (req, res) => {
  try {
    const id = req.body?.id ? Number(req.body.id) : null;
    await marcarLeidas(id);
    res.json({ message: id ? 'Notificación leída' : 'Todas las notificaciones quedaron leídas' });
  } catch (error) {
    responderError(res, error);
  }
});

/**
 * PUT /api/inventario/minimo/:idLibro · RF11: stock mínimo propio de un libro.
 * Body: { minimo: 3 }  ->  ese libro avisa al llegar a 3
 *       { minimo: null } -> vuelve a usar el mínimo por defecto
 */
router.put('/minimo/:idLibro', verificarToken, requerirPermiso('inventario', 'editar'), async (req, res) => {
  try {
    const idLibro = Number(req.params.idLibro);
    const minimo = req.body?.minimo === null || req.body?.minimo === '' ? null : Number(req.body?.minimo);
    if (!Number.isInteger(idLibro)) return res.status(400).json({ error: 'Libro inválido' });
    if (minimo !== null && !minimoValido(minimo)) {
      return res.status(400).json({ error: 'El stock mínimo debe ser un número entero entre 0 y 9999' });
    }
    const r = await setMinimoDeLibro(idLibro, minimo);
    res.json({
      ...r,
      message: minimo === null ? `Ahora usa el mínimo por defecto (${r.minimo})` : `Stock mínimo actualizado a ${r.minimo}`
    });
  } catch (error) {
    responderError(res, error);
  }
});

/** GET/PUT /api/inventario/minimo-defecto · RF11: mínimo para los libros sin uno propio. */
router.get('/minimo-defecto', verificarToken, requerirPermiso('inventario', 'ver'), async (req, res) => {
  try {
    res.json({ minimo: await getMinimoDefecto() });
  } catch (error) {
    responderError(res, error);
  }
});

router.put('/minimo-defecto', verificarToken, requerirPermiso('inventario', 'editar'), async (req, res) => {
  try {
    const minimo = Number(req.body?.minimo);
    if (!minimoValido(minimo)) {
      return res.status(400).json({ error: 'El stock mínimo debe ser un número entero entre 0 y 9999' });
    }
    await setMinimoDefecto(minimo, req.usuario?.id ?? null);
    res.json({ minimo, message: `Mínimo por defecto actualizado a ${minimo}` });
  } catch (error) {
    responderError(res, error);
  }
});

export default router;
