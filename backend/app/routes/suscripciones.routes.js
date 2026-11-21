import express from 'express';
import pool from '../config/db.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';
import { enviarPromocion } from '../services/avisos.js';

/**
 * @file suscripciones.routes.js
 * @description RF26 · Notificaciones que el cliente decide recibir.
 *   GET  /api/suscripciones                 -> mis preferencias + libros que espero
 *   PUT  /api/suscripciones {promociones, novedades, reposicion} -> guardar preferencias
 *   POST /api/suscripciones/avisos/:idLibro -> "Avisarme cuando llegue"
 *   DELETE /api/suscripciones/avisos/:idLibro -> ya no avisarme
 *   POST /api/suscripciones/promocion {asunto, mensaje} -> el admin envía una promo (configuracion:editar)
 */
const router = express.Router();
const TIPOS = ['promociones', 'novedades', 'reposicion'];

/** Preferencias del usuario; si nunca las guardó: promos y novedades apagadas, reposición encendida. */
const leerPreferencias = async (idUsuario) => {
  const [[p]] = await pool.query('SELECT promociones, novedades, reposicion FROM preferencias_notificacion WHERE id_usuario = ?', [idUsuario]);
  return { promociones: !!p?.promociones, novedades: !!p?.novedades, reposicion: p ? !!p.reposicion : true };
};

router.get('/', verificarToken, async (req, res) => {
  try {
    const [esperando] = await pool.query(
      `SELECT a.id_libro, l.titulo, a.fecha, a.fecha_aviso FROM avisos_stock a JOIN libros l ON l.id_libro = a.id_libro
       WHERE a.id_usuario = ? ORDER BY a.fecha DESC`, [req.usuario.id]
    );
    res.json({ preferencias: await leerPreferencias(req.usuario.id), avisos: esperando });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/', verificarToken, async (req, res) => {
  try {
    const actual = await leerPreferencias(req.usuario.id);
    const nuevo = {};
    for (const t of TIPOS) nuevo[t] = typeof req.body?.[t] === 'boolean' ? req.body[t] : actual[t];
    await pool.query(
      `INSERT INTO preferencias_notificacion (id_usuario, promociones, novedades, reposicion) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE promociones = VALUES(promociones), novedades = VALUES(novedades), reposicion = VALUES(reposicion)`,
      [req.usuario.id, nuevo.promociones, nuevo.novedades, nuevo.reposicion]
    );
    res.json({ preferencias: nuevo, message: 'Preferencias de notificación guardadas' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/avisos/:idLibro', verificarToken, async (req, res) => {
  try {
    const idLibro = Number(req.params.idLibro);
    const [[libro]] = await pool.query(
      `SELECT l.titulo, COALESCE(i.stock_actual, 0) AS stock FROM libros l
       LEFT JOIN inventarios i ON i.id_libro = l.id_libro WHERE l.id_libro = ?`, [idLibro]
    );
    if (!libro) return res.status(404).json({ error: 'El libro no existe' });
    if (libro.stock > 0) return res.status(409).json({ error: `«${libro.titulo}» ya está disponible` });
    // Si ya lo pidió antes (y se le avisó), vuelve a quedar esperando
    await pool.query(
      `INSERT INTO avisos_stock (id_usuario, id_libro) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE fecha = NOW(), fecha_aviso = NULL`, [req.usuario.id, idLibro]
    );
    // Pedir el aviso enciende la preferencia de reposición
    await pool.query(
      `INSERT INTO preferencias_notificacion (id_usuario, reposicion) VALUES (?, 1) ON DUPLICATE KEY UPDATE reposicion = 1`,
      [req.usuario.id]
    );
    res.status(201).json({ message: `Te avisaremos por correo cuando llegue «${libro.titulo}»` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/avisos/:idLibro', verificarToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM avisos_stock WHERE id_usuario = ? AND id_libro = ?', [req.usuario.id, Number(req.params.idLibro)]);
    res.json({ message: 'Ya no te avisaremos de este libro' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/promocion', verificarToken, requerirPermiso('configuracion', 'editar'), async (req, res) => {
  try {
    const asunto = String(req.body?.asunto || '').trim();
    const mensaje = String(req.body?.mensaje || '').trim();
    if (asunto.length < 3 || asunto.length > 120) return res.status(400).json({ error: 'El asunto debe tener entre 3 y 120 caracteres' });
    if (mensaje.length < 5 || mensaje.length > 2000) return res.status(400).json({ error: 'El mensaje debe tener entre 5 y 2000 caracteres' });
    const total = await enviarPromocion(asunto, mensaje);
    res.json({ enviados: total, message: total ? `Enviando la promoción a ${total} suscriptor(es)` : 'Todavía nadie está suscrito a promociones' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
