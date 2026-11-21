import express from 'express';
import {
  reporteMovimientos, listaLibros, listaUsuarios, reporteUsuario, estadisticas, kpis
} from '../models/reportes.model.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';

/**
 * @file reportes.routes.js
 * @description Reportes del panel (todo es de solo lectura):
 *   GET /api/reportes/movimientos?desde=&hasta=&libro=  -> RF8  (permiso inventario:ver)
 *   GET /api/reportes/usuarios                          -> RF6  lista para el selector (facturas:ver)
 *   GET /api/reportes/usuario/:id?desde=&hasta=         -> RF6  transacciones de un usuario (facturas:ver)
 *   GET /api/reportes/estadisticas?desde=&hasta=&agrupar=dia|mes -> RF20 (reportes:editar)
 *   GET /api/reportes/kpis                              -> RF19 solo el rol admin
 * La exportación a Excel (CSV) y PDF (imprimir) se hace en el navegador con estos mismos datos.
 */
const router = express.Router();

/** ¿La fecha tiene formato AAAA-MM-DD y es una fecha real? */
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());

/** Lee y valida ?desde y ?hasta. Devuelve un mensaje de error o los valores. */
const leerFechas = (query) => {
  const desde = String(query.desde || '');
  const hasta = String(query.hasta || '');
  if (desde && !esFecha(desde)) return { error: 'La fecha "desde" no es válida (AAAA-MM-DD)' };
  if (hasta && !esFecha(hasta)) return { error: 'La fecha "hasta" no es válida (AAAA-MM-DD)' };
  if (desde && hasta && desde > hasta) return { error: 'La fecha "desde" no puede ser posterior a "hasta"' };
  return { desde, hasta };
};

const fallo = (res, error) => {
  console.error(error);
  res.status(500).json({ error: error.message });
};

/** RF8 · Movimientos de stock por libro. */
router.get('/movimientos', verificarToken, requerirPermiso('inventario', 'ver'), async (req, res) => {
  try {
    const f = leerFechas(req.query);
    if (f.error) return res.status(400).json({ error: f.error });
    const idLibro = req.query.libro ? Number(req.query.libro) : null;
    if (req.query.libro && !Number.isInteger(idLibro)) return res.status(400).json({ error: 'Libro inválido' });
    const [datos, libros] = await Promise.all([reporteMovimientos({ ...f, idLibro }), listaLibros()]);
    res.json({ ...datos, libros, filtros: { ...f, libro: idLibro } });
  } catch (error) {
    fallo(res, error);
  }
});

/** RF6 · Lista de usuarios para elegir. */
router.get('/usuarios', verificarToken, requerirPermiso('facturas', 'ver'), async (req, res) => {
  try {
    res.json(await listaUsuarios());
  } catch (error) {
    fallo(res, error);
  }
});

/** RF6 · Compras, devoluciones y notas de un usuario. */
router.get('/usuario/:id', verificarToken, requerirPermiso('facturas', 'ver'), async (req, res) => {
  try {
    const f = leerFechas(req.query);
    if (f.error) return res.status(400).json({ error: f.error });
    const idUsuario = Number(req.params.id);
    if (!Number.isInteger(idUsuario)) return res.status(400).json({ error: 'Usuario inválido' });
    const datos = await reporteUsuario({ idUsuario, ...f });
    if (!datos) return res.status(404).json({ error: 'El usuario no existe' });
    res.json({ ...datos, filtros: f });
  } catch (error) {
    fallo(res, error);
  }
});

/** RF20 · Estadísticas generales (ventas, ingresos, inventario). */
router.get('/estadisticas', verificarToken, requerirPermiso('reportes', 'editar'), async (req, res) => {
  try {
    const f = leerFechas(req.query);
    if (f.error) return res.status(400).json({ error: f.error });
    const agrupar = req.query.agrupar === 'mes' ? 'mes' : 'dia';
    res.json({ ...(await estadisticas({ ...f, agrupar })), filtros: { ...f, agrupar } });
  } catch (error) {
    fallo(res, error);
  }
});

/**
 * RF19 · KPIs del tablero. El requisito dice "solo rol administrador", así que aquí
 * no basta un permiso: se exige rol 'admin' (requerirPermiso deja req.usuario.rol actualizado desde la BD).
 */
router.get('/kpis', verificarToken, requerirPermiso('reportes', 'editar'), async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'El tablero de indicadores es solo para el administrador' });
    }
    res.json(await kpis());
  } catch (error) {
    fallo(res, error);
  }
});

export default router;
