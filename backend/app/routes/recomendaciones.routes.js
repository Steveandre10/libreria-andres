import express from 'express';
import pool from '../config/db.js';
import { ID_LIBRERIA } from '../models/inventario.model.js';
import { verificarToken, tokenOpcional } from '../middlewares/auth.middleware.js';

/**
 * @file recomendaciones.routes.js
 * @description RF25 · "Recomendados para ti".
 *
 * Cómo se calcula (sin magia, para poder explicarlo):
 *  1. Se mira el historial del usuario: libros que COMPRÓ (pesan 3) y libros que ABRIÓ en la ficha
 *     (pesan 1 por cada vez, máximo 3).
 *  2. Con eso se suma un puntaje para cada GÉNERO y cada AUTOR.
 *  3. Cada libro del catálogo recibe: puntaje de su género + puntaje de su autor × 1,5 (el autor es más específico).
 *  4. Se quitan los libros que ya compró, se priorizan los disponibles y se devuelven los 8 mejores.
 *  5. Si es un usuario nuevo (sin historial) o un visitante: se muestran los más vendidos.
 *
 *   GET  /api/recomendaciones          -> { tipo: 'personal'|'populares', libros: [...] }
 *   POST /api/recomendaciones/vista {id_libro} -> guarda que abrió la ficha (historial de navegación)
 */
const router = express.Router();
const LIMITE = 8;

const SELECT_LIBRO = `
  SELECT l.id_libro, l.titulo, l.autor, l.genero, l.precio, l.portada, l.disponibilidad, l.promedio_reseña,
         CAST(COALESCE(i.stock_actual, 0) AS SIGNED) AS stock
  FROM libros l LEFT JOIN inventarios i ON i.id_libro = l.id_libro AND i.id_libreria = ${ID_LIBRERIA}`;

/** Más vendidos (pedidos no devueltos); excluye los ids indicados. */
const masVendidos = async (excluir = [], limite = LIMITE) => {
  const [rows] = await pool.query(
    `${SELECT_LIBRO}
     LEFT JOIN (
       SELECT pl.id_libro, SUM(pl.cantidad) AS vendidos FROM pedido_libro pl
       JOIN pedidos p ON p.id_pedido = pl.id_pedido WHERE p.estado <> 'Devuelto' GROUP BY pl.id_libro
     ) v ON v.id_libro = l.id_libro
     ${excluir.length ? 'WHERE l.id_libro NOT IN (?)' : ''}
     ORDER BY (COALESCE(i.stock_actual, 0) > 0) DESC, COALESCE(v.vendidos, 0) DESC, l.promedio_reseña DESC
     LIMIT ?`,
    excluir.length ? [excluir, limite] : [limite]
  );
  return rows.map(l => ({ ...l, razon: 'De los más vendidos' }));
};

router.get('/', tokenOpcional, async (req, res) => {
  try {
    const idUsuario = req.usuario?.id;
    if (!idUsuario) return res.json({ tipo: 'populares', libros: await masVendidos() });

    const [comprados] = await pool.query(
      `SELECT DISTINCT l.id_libro, l.genero, l.autor FROM pedidos p
       JOIN pedido_libro pl ON pl.id_pedido = p.id_pedido JOIN libros l ON l.id_libro = pl.id_libro
       WHERE p.id = ? AND p.estado <> 'Devuelto'`, [idUsuario]
    );
    const [vistos] = await pool.query(
      `SELECT l.id_libro, l.genero, l.autor, v.veces FROM libros_vistos v JOIN libros l ON l.id_libro = v.id_libro
       WHERE v.id_usuario = ?`, [idUsuario]
    );
    const idsComprados = comprados.map(c => c.id_libro);

    // Usuario nuevo: los más vendidos (sin los que ya compró, por si acaso)
    if (!comprados.length && !vistos.length) {
      return res.json({ tipo: 'populares', libros: await masVendidos(idsComprados) });
    }

    // Pasos 1 y 2: puntaje por género y por autor
    const generos = new Map();
    const autores = new Map();
    const sumar = (mapa, clave, puntos) => { if (clave) mapa.set(clave, (mapa.get(clave) || 0) + puntos); };
    comprados.forEach(c => { sumar(generos, c.genero, 3); sumar(autores, c.autor, 3); });
    vistos.forEach(v => { const p = Math.min(v.veces, 3); sumar(generos, v.genero, p); sumar(autores, v.autor, p); });

    // Paso 3 y 4: puntuar el catálogo sin lo comprado
    const [catalogo] = await pool.query(
      `${SELECT_LIBRO} ${idsComprados.length ? 'WHERE l.id_libro NOT IN (?)' : ''}`,
      idsComprados.length ? [idsComprados] : []
    );
    const puntuados = catalogo.map(l => {
      const pg = generos.get(l.genero) || 0;
      const pa = (autores.get(l.autor) || 0) * 1.5;
      const razon = pa >= pg && pa > 0 ? `Porque te interesa ${l.autor}` : (pg > 0 ? `Porque te gusta ${l.genero}` : '');
      return { ...l, puntaje: pg + pa, razon };
    }).filter(l => l.puntaje > 0)
      .sort((a, b) => (b.stock > 0) - (a.stock > 0) || b.puntaje - a.puntaje || b.promedio_reseña - a.promedio_reseña)
      .slice(0, LIMITE);

    // Si quedaron pocos, se completa con los más vendidos
    if (puntuados.length < LIMITE) {
      const relleno = await masVendidos([...idsComprados, ...puntuados.map(l => l.id_libro)], LIMITE - puntuados.length);
      puntuados.push(...relleno);
    }
    res.json({ tipo: 'personal', libros: puntuados.map(({ puntaje, ...l }) => l) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/vista', verificarToken, async (req, res) => {
  try {
    const idLibro = Number(req.body?.id_libro);
    if (!Number.isInteger(idLibro)) return res.status(400).json({ error: 'Libro inválido' });
    await pool.query(
      `INSERT INTO libros_vistos (id_usuario, id_libro) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE veces = veces + 1, ultima_vista = NOW()`, [req.usuario.id, idLibro]
    );
    res.status(204).end();
  } catch (error) {
    // si el libro no existe (FK) no es grave para el cliente
    res.status(error.code === 'ER_NO_REFERENCED_ROW_2' ? 404 : 500).json({ error: error.message });
  }
});

export default router;
