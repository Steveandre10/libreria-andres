import express from 'express';
import pool from '../config/db.js';
import { ID_LIBRERIA } from '../models/inventario.model.js';
import { verificarToken } from '../middlewares/auth.middleware.js';

/**
 * @file favoritos.routes.js
 * @description RF24 · Lista de deseos. Cada usuario ve y cambia SOLO la suya (el id sale del token).
 *   GET    /api/favoritos            -> mis favoritos con los datos del libro (precio, stock…)
 *   POST   /api/favoritos  {id_libro} -> agregar (si ya estaba, no pasa nada)
 *   DELETE /api/favoritos/:idLibro   -> quitar
 */
const router = express.Router();

router.get('/', verificarToken, async (req, res) => {
  try {
    const [libros] = await pool.query(
      `SELECT l.id_libro, l.titulo, l.autor, l.genero, l.precio, l.portada, l.disponibilidad,
              l.promedio_reseña, f.fecha AS agregado,
              CAST(COALESCE(i.stock_actual, 0) AS SIGNED) AS stock
       FROM favoritos f
       JOIN libros l ON l.id_libro = f.id_libro
       LEFT JOIN inventarios i ON i.id_libro = l.id_libro AND i.id_libreria = ?
       WHERE f.id_usuario = ?
       ORDER BY f.fecha DESC`,
      [ID_LIBRERIA, req.usuario.id]
    );
    res.json({ favoritos: libros });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', verificarToken, async (req, res) => {
  try {
    const idLibro = Number(req.body?.id_libro);
    if (!Number.isInteger(idLibro)) return res.status(400).json({ error: 'Libro inválido' });
    const [[libro]] = await pool.query('SELECT titulo FROM libros WHERE id_libro = ?', [idLibro]);
    if (!libro) return res.status(404).json({ error: 'El libro no existe' });
    // INSERT IGNORE: si ya estaba en favoritos no da error (la llave primaria evita duplicados)
    await pool.query('INSERT IGNORE INTO favoritos (id_usuario, id_libro) VALUES (?, ?)', [req.usuario.id, idLibro]);
    res.status(201).json({ message: `«${libro.titulo}» quedó en tu lista de deseos` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:idLibro', verificarToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM favoritos WHERE id_usuario = ? AND id_libro = ?', [req.usuario.id, Number(req.params.idLibro)]);
    res.json({ message: 'Libro quitado de tu lista de deseos' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
