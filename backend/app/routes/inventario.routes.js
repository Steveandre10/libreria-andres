import express from 'express';
import {
  getInventario, getMovimientos, ErrorInventario,
  getNotificaciones, marcarLeidas, getMinimoDefecto, setMinimoDefecto, setMinimoDeLibro
} from '../models/inventario.model.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';
import { getConteos, getConteo, iniciarConteo, registrarCantidad, ajustarConteo, cerrarConteo } from '../models/conteos.model.js';   // RF12

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

/* ---------------------------------------------------------------
   RF12 · CONTEO CÍCLICO (ver conteos.model.js)
   GET  /api/inventario/conteos                     -> conteos recientes
   POST /api/inventario/conteos {nota?, genero?}    -> iniciar (foto del stock)
   GET  /api/inventario/conteos/:id                 -> detalle con diferencias
   PUT  /api/inventario/conteos/:id/libros/:idLibro {cantidad} -> registrar lo contado
   POST /api/inventario/conteos/:id/ajustar {lineas:[{id_libro, motivo}]} -> corregir stock
   POST /api/inventario/conteos/:id/cerrar          -> cerrar
   --------------------------------------------------------------- */
router.get('/conteos', verificarToken, requerirPermiso('inventario', 'ver'), async (req, res) => {
  try {
    res.json({ conteos: await getConteos() });
  } catch (error) {
    responderError(res, error);
  }
});

router.post('/conteos', verificarToken, requerirPermiso('inventario', 'editar'), async (req, res) => {
  try {
    const nota = String(req.body?.nota || '').trim().slice(0, 200);
    const genero = String(req.body?.genero || '').trim();
    const r = await iniciarConteo({ idUsuario: req.usuario.id, nota, genero });
    res.status(201).json({ ...r, message: `Conteo iniciado con ${r.libros} libro(s)` });
  } catch (error) {
    responderError(res, error);
  }
});

router.get('/conteos/:id', verificarToken, requerirPermiso('inventario', 'ver'), async (req, res) => {
  try {
    const datos = await getConteo(Number(req.params.id));
    if (!datos) return res.status(404).json({ error: 'El conteo no existe' });
    res.json(datos);
  } catch (error) {
    responderError(res, error);
  }
});

router.put('/conteos/:id/libros/:idLibro', verificarToken, requerirPermiso('inventario', 'editar'), async (req, res) => {
  try {
    const v = req.body?.cantidad;
    const cantidad = v === null || v === '' ? null : Number(v);
    if (cantidad !== null && !minimoValido(cantidad)) return res.status(400).json({ error: 'La cantidad contada debe ser un entero entre 0 y 9999' });
    await registrarCantidad({ idConteo: Number(req.params.id), idLibro: Number(req.params.idLibro), cantidad });
    res.json({ message: 'Cantidad guardada' });
  } catch (error) {
    responderError(res, error);
  }
});

router.post('/conteos/:id/ajustar', verificarToken, requerirPermiso('inventario', 'editar'), async (req, res) => {
  try {
    const lineas = Array.isArray(req.body?.lineas) ? req.body.lineas : [];
    if (!lineas.length) return res.status(400).json({ error: 'Elige al menos un libro para ajustar' });
    for (const l of lineas) {
      l.id_libro = Number(l.id_libro);
      l.motivo = String(l.motivo || '').trim().slice(0, 150);
      if (!Number.isInteger(l.id_libro)) return res.status(400).json({ error: 'Libro inválido' });
      if (l.motivo.length < 3) return res.status(400).json({ error: 'Cada ajuste necesita un motivo (mínimo 3 caracteres)' });
    }
    const r = await ajustarConteo({ idConteo: Number(req.params.id), lineas, idUsuario: req.usuario.id });
    res.json({ ...r, message: r.ajustados ? `Stock ajustado en ${r.ajustados} libro(s)` : 'No había diferencias por ajustar' });
  } catch (error) {
    responderError(res, error);
  }
});

router.post('/conteos/:id/cerrar', verificarToken, requerirPermiso('inventario', 'editar'), async (req, res) => {
  try {
    await cerrarConteo(Number(req.params.id));
    res.json({ message: 'Conteo cerrado' });
  } catch (error) {
    responderError(res, error);
  }
});

export default router;
