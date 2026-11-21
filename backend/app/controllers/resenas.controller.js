import {
  getResenasByLibro, getAllResenas, crearResena as crearResenaModel,
  moderarResena as moderarResenaModel, eliminarResena as eliminarResenaModel,
  comproElLibro, getMiResena, ErrorResena
} from '../models/resenas.model.js';

/**
 * @file resenas.controller.js
 * @description RF29 (dejar reseñas) + RF21 (moderarlas). Ver resenas.model.js.
 */

const responderError = (res, error) => {
  if (error instanceof ErrorResena) return res.status(error.status).json({ error: error.message });
  res.status(500).json({ error: error.message });
};

const ESTADOS = ['Pendiente', 'Aprobada', 'Rechazada'];

/** GET /api/libros/:idLibro/resenas -> solo las APROBADAS (público). */
export const listarResenasLibro = async (req, res) => {
  try {
    res.json({ resenas: await getResenasByLibro(req.params.idLibro) });
  } catch (error) {
    responderError(res, error);
  }
};

/** GET /api/resenas?estado=Pendiente -> moderación (requiere resenas:ver). */
export const listarResenas = async (req, res) => {
  try {
    const estado = ESTADOS.includes(req.query.estado) ? req.query.estado : '';
    res.json({ resenas: await getAllResenas(estado) });
  } catch (error) {
    responderError(res, error);
  }
};

/** GET /api/libros/:idLibro/resenas/mia -> ¿puedo reseñar? y mi reseña (si existe). */
export const miResena = async (req, res) => {
  try {
    const idLibro = Number(req.params.idLibro);
    const [compro, resena] = await Promise.all([comproElLibro(req.usuario.id, idLibro), getMiResena(req.usuario.id, idLibro)]);
    res.json({ compro, resena });
  } catch (error) {
    responderError(res, error);
  }
};

/**
 * POST /api/libros/:idLibro/resenas · RF29 (requiere sesión).
 * Body: { calificacion: 1..5, reseña?: "comentario opcional" }
 * El usuario sale del token (antes venía del navegador y cualquiera podía hacerse pasar por otro).
 */
export const crearResena = async (req, res) => {
  try {
    const idLibro = Number(req.params.idLibro);
    const calificacion = Number(req.body?.calificacion);
    const comentario = String(req.body?.reseña ?? req.body?.comentario ?? '').trim();
    if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
      return res.status(400).json({ error: 'La calificación debe ser de 1 a 5 estrellas' });
    }
    if (comentario.length > 500) return res.status(400).json({ error: 'El comentario puede tener máximo 500 caracteres' });
    const r = await crearResenaModel({ idUsuario: req.usuario.id, idLibro, calificacion, comentario });
    res.status(201).json({ resena: r, message: 'Gracias. Tu reseña quedó pendiente: se publicará cuando el administrador la apruebe.' });
  } catch (error) {
    responderError(res, error);
  }
};

/** PUT /api/resenas/:id/moderar · RF21. Body: { decision: 'aprobar'|'rechazar', motivo? } */
export const moderarResena = async (req, res) => {
  try {
    const { decision } = req.body || {};
    if (!['aprobar', 'rechazar'].includes(decision)) return res.status(400).json({ error: 'La decisión debe ser "aprobar" o "rechazar"' });
    const motivo = String(req.body?.motivo || '').trim().slice(0, 300);
    const r = await moderarResenaModel({ idResena: Number(req.params.id), decision, motivo, idModerador: req.usuario.id });
    res.json({ ...r, message: r.estado === 'Aprobada' ? 'Reseña aprobada: ya se ve en la ficha del libro' : 'Reseña rechazada' });
  } catch (error) {
    responderError(res, error);
  }
};

/** DELETE /api/resenas/:id · RF21. */
export const eliminarResena = async (req, res) => {
  try {
    await eliminarResenaModel(Number(req.params.id));
    res.json({ message: 'Reseña eliminada correctamente' });
  } catch (error) {
    responderError(res, error);
  }
};
