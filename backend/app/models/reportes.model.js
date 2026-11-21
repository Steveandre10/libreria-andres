import pool from '../config/db.js';
import { ID_LIBRERIA, getMinimoDefecto } from './inventario.model.js';

/**
 * @file reportes.model.js
 * @description Consultas de solo lectura para los reportes del panel:
 *   RF8  · movimientos de stock (entradas, ventas, devoluciones) por libro
 *   RF6  · transacciones de un usuario (compras, devoluciones, notas)
 *   RF20 · estadísticas (ventas por periodo, ingresos, estado del inventario)
 *   RF19 · KPIs en tiempo real (ventas del día, más vendidos, pendientes, tickets)
 *
 * Las fechas llegan como 'AAAA-MM-DD'. Para incluir TODO el día "hasta" se compara con
 * `< hasta + 1 día`, así un movimiento a las 23:59 del último día también entra.
 */

/** Redondea a 2 decimales (evita 39.989999 al sumar decimales en JS). */
const r2 = (n) => Math.round(Number(n) * 100) / 100;

/** Arma el filtro de fechas sobre una columna DATETIME. */
const rangoFechas = (columna, desde, hasta) => {
  const where = [];
  const params = [];
  if (desde) { where.push(`${columna} >= ?`); params.push(desde); }
  if (hasta) { where.push(`${columna} < DATE_ADD(?, INTERVAL 1 DAY)`); params.push(hasta); }
  return { where, params };
};

/* ---------------------------------------------------------------
   RF8 · MOVIMIENTOS DE STOCK
   --------------------------------------------------------------- */

/**
 * RF8 · Resumen por libro + detalle de cada movimiento.
 *   entradas     = Alta + ajustes que SUBEN el stock (llegó mercancía)
 *   ventas       = tipo 'Venta'
 *   devoluciones = tipo 'Devolución' (unidades que volvieron al stock)
 *   salidas_ajuste = ajustes que BAJAN el stock (pérdida, conteo, daño)
 * @param {{desde?:string, hasta?:string, idLibro?:number|null}} filtros
 */
export const reporteMovimientos = async ({ desde, hasta, idLibro }) => {
  const { where, params } = rangoFechas('m.fecha_movimiento', desde, hasta);
  if (idLibro) { where.push('i.id_libro = ?'); params.push(idLibro); }
  const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [resumen] = await pool.query(
    `SELECT l.id_libro, l.titulo, l.autor,
            CAST(SUM(CASE WHEN m.tipo_movimiento = 'Alta'
                       OR (m.tipo_movimiento = 'Ajuste' AND m.stock_nuevo > m.stock_anterior) THEN m.cantidad ELSE 0 END) AS SIGNED) AS entradas,
            CAST(SUM(CASE WHEN m.tipo_movimiento = 'Venta' THEN m.cantidad ELSE 0 END) AS SIGNED) AS ventas,
            CAST(SUM(CASE WHEN m.tipo_movimiento = 'Devolución' THEN m.cantidad ELSE 0 END) AS SIGNED) AS devoluciones,
            CAST(SUM(CASE WHEN m.tipo_movimiento = 'Ajuste' AND m.stock_nuevo < m.stock_anterior THEN m.cantidad ELSE 0 END) AS SIGNED) AS salidas_ajuste,
            CAST(COUNT(*) AS SIGNED) AS movimientos,
            CAST(COALESCE(MAX(i.stock_actual), 0) AS SIGNED) AS stock_actual
     FROM movimientos m
     JOIN inventarios i ON i.id_inventario = m.id_inventario
     JOIN libros l ON l.id_libro = i.id_libro
     ${filtro}
     GROUP BY l.id_libro, l.titulo, l.autor
     ORDER BY l.titulo`,
    params
  );

  const [detalle] = await pool.query(
    `SELECT m.id_movimiento, m.fecha_movimiento, m.tipo_movimiento, m.cantidad,
            m.stock_anterior, m.stock_nuevo, m.id_pedido, l.id_libro, l.titulo, u.nombre AS usuario_nombre
     FROM movimientos m
     JOIN inventarios i ON i.id_inventario = m.id_inventario
     JOIN libros l ON l.id_libro = i.id_libro
     LEFT JOIN usuarios u ON u.id = m.id_usuario
     ${filtro}
     ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC
     LIMIT 1000`,
    params
  );

  const totales = resumen.reduce((t, r) => ({
    entradas: t.entradas + r.entradas, ventas: t.ventas + r.ventas,
    devoluciones: t.devoluciones + r.devoluciones, salidas_ajuste: t.salidas_ajuste + r.salidas_ajuste
  }), { entradas: 0, ventas: 0, devoluciones: 0, salidas_ajuste: 0 });

  return { resumen, detalle, totales };
};

/** Lista corta de libros para el selector del filtro. */
export const listaLibros = async () => {
  const [rows] = await pool.query('SELECT id_libro, titulo FROM libros ORDER BY titulo');
  return rows;
};

/* ---------------------------------------------------------------
   RF6 · TRANSACCIONES POR USUARIO
   --------------------------------------------------------------- */

/** Usuarios (clientes y personal) para el selector, con cuántos pedidos tienen. */
export const listaUsuarios = async () => {
  const [rows] = await pool.query(
    `SELECT u.id, u.nombre, u.email, u.rol,
            CAST((SELECT COUNT(*) FROM pedidos p WHERE p.id = u.id) AS SIGNED) AS pedidos
     FROM usuarios u ORDER BY u.nombre`
  );
  return rows;
};

/**
 * RF6 · Todo lo que hizo un usuario en el rango: compras (con su factura),
 * solicitudes de devolución y notas crédito/débito.
 */
export const reporteUsuario = async ({ idUsuario, desde, hasta }) => {
  const [[usuario]] = await pool.query(
    'SELECT id, nombre, email, cedula, rol, fecha_registro FROM usuarios WHERE id = ?', [idUsuario]
  );
  if (!usuario) return null;

  const fp = rangoFechas('p.fecha_registro', desde, hasta);
  const [compras] = await pool.query(
    `SELECT p.id_pedido, p.fecha_registro, p.estado, p.estado_envio,
            f.id_factura, f.numero_fe, f.estado_dian,
            CAST(COALESCE(f.total, 0) AS DECIMAL(12,2)) AS total,
            CAST((SELECT COALESCE(SUM(pl.cantidad), 0) FROM pedido_libro pl WHERE pl.id_pedido = p.id_pedido) AS SIGNED) AS unidades,
            (SELECT GROUP_CONCAT(l.titulo ORDER BY l.titulo SEPARATOR ', ')
               FROM pedido_libro pl JOIN libros l ON l.id_libro = pl.id_libro WHERE pl.id_pedido = p.id_pedido) AS libros
     FROM pedidos p
     LEFT JOIN facturas f ON f.id_pedido = p.id_pedido
     WHERE p.id = ? ${fp.where.length ? 'AND ' + fp.where.join(' AND ') : ''}
     ORDER BY p.fecha_registro DESC`,
    [idUsuario, ...fp.params]
  );

  const fs = rangoFechas('s.fecha_solicitud', desde, hasta);
  const [devoluciones] = await pool.query(
    `SELECT s.id_solicitud, s.id_pedido, s.motivo, s.detalle, s.estado, s.respuesta,
            s.estado_libro, s.fecha_solicitud, s.fecha_respuesta
     FROM solicitudes_devolucion s
     WHERE s.id_usuario = ? ${fs.where.length ? 'AND ' + fs.where.join(' AND ') : ''}
     ORDER BY s.fecha_solicitud DESC`,
    [idUsuario, ...fs.params]
  );

  const fn = rangoFechas('n.fecha_registro', desde, hasta);
  const [notas] = await pool.query(
    `SELECT n.id_nota, n.tipo, n.motivo, n.fecha_registro, f.id_pedido, f.id_factura,
            CAST(n.total AS DECIMAL(12,2)) AS total
     FROM notas_contables n
     JOIN facturas f ON f.id_factura = n.id_factura
     JOIN pedidos p ON p.id_pedido = f.id_pedido
     WHERE p.id = ? ${fn.where.length ? 'AND ' + fn.where.join(' AND ') : ''}
     ORDER BY n.fecha_registro DESC`,
    [idUsuario, ...fn.params]
  );

  const comprado = compras.reduce((s, c) => s + Number(c.total), 0);
  const devuelto = notas.filter(n => n.tipo === 'Crédito').reduce((s, n) => s + Number(n.total), 0);
  return {
    usuario, compras, devoluciones, notas,
    totales: {
      compras: compras.length, comprado: r2(comprado), devuelto: r2(devuelto), neto: r2(comprado - devuelto),
      devoluciones: devoluciones.length, notas: notas.length
    }
  };
};

/* ---------------------------------------------------------------
   RF20 · ESTADÍSTICAS
   --------------------------------------------------------------- */

/**
 * RF20 · Ventas por periodo, ingresos facturados, libros más vendidos y estado del inventario.
 * Solo cuentan los pedidos "Activo" (los devueltos/cancelados no son venta).
 * @param {{desde?:string, hasta?:string, agrupar?:'dia'|'mes'}} filtros
 */
export const estadisticas = async ({ desde, hasta, agrupar = 'dia' }) => {
  const formato = agrupar === 'mes' ? '%Y-%m' : '%Y-%m-%d';
  const fp = rangoFechas('p.fecha_registro', desde, hasta);
  const filtroPedidos = ['p.estado = \'Activo\'', ...fp.where].join(' AND ');

  const [porPeriodo] = await pool.query(
    `SELECT DATE_FORMAT(p.fecha_registro, '${formato}') AS periodo,
            CAST(COUNT(DISTINCT p.id_pedido) AS SIGNED) AS pedidos,
            CAST(COALESCE(SUM(f.total), 0) AS DECIMAL(12,2)) AS ingresos
     FROM pedidos p LEFT JOIN facturas f ON f.id_pedido = p.id_pedido
     WHERE ${filtroPedidos}
     GROUP BY periodo ORDER BY periodo`,
    fp.params
  );

  // Ingresos facturados: todo lo facturado en el rango, y lo que se devolvió con notas crédito
  const ff = rangoFechas('f.fecha_registro', desde, hasta);
  const [[facturado]] = await pool.query(
    `SELECT CAST(COUNT(*) AS SIGNED) AS facturas,
            CAST(COALESCE(SUM(f.subtotal), 0) AS DECIMAL(12,2)) AS subtotal,
            CAST(COALESCE(SUM(f.impuestos), 0) AS DECIMAL(12,2)) AS impuestos,
            CAST(COALESCE(SUM(f.costo_envio), 0) AS DECIMAL(12,2)) AS envios,
            CAST(COALESCE(SUM(f.total), 0) AS DECIMAL(12,2)) AS total
     FROM facturas f ${ff.where.length ? 'WHERE ' + ff.where.join(' AND ') : ''}`,
    ff.params
  );
  const fn = rangoFechas('n.fecha_registro', desde, hasta);
  const [[notas]] = await pool.query(
    `SELECT CAST(COALESCE(SUM(CASE WHEN n.tipo = 'Crédito' THEN n.total ELSE 0 END), 0) AS DECIMAL(12,2)) AS credito
     FROM notas_contables n ${fn.where.length ? 'WHERE ' + fn.where.join(' AND ') : ''}`,
    fn.params
  );

  const [masVendidos] = await pool.query(
    `SELECT l.id_libro, l.titulo, l.autor,
            CAST(SUM(pl.cantidad) AS SIGNED) AS unidades,
            CAST(SUM(pl.cantidad * pl.precio_unitario) AS DECIMAL(12,2)) AS ingresos
     FROM pedido_libro pl
     JOIN pedidos p ON p.id_pedido = pl.id_pedido
     JOIN libros l ON l.id_libro = pl.id_libro
     WHERE ${filtroPedidos}
     GROUP BY l.id_libro, l.titulo, l.autor
     ORDER BY unidades DESC, ingresos DESC LIMIT 10`,
    fp.params
  );

  const inventario = await estadoInventario();
  return {
    porPeriodo, masVendidos, inventario,
    ingresos: { ...facturado, credito: notas.credito, neto: r2(Number(facturado.total) - Number(notas.credito)) }
  };
};

/** RF20/RF19 · Cuántos libros están bien, bajos o agotados, y cuánto vale el stock. */
export const estadoInventario = async () => {
  const defecto = await getMinimoDefecto();
  const [[r]] = await pool.query(
    `SELECT CAST(SUM(CASE WHEN stock > minimo THEN 1 ELSE 0 END) AS SIGNED) AS normal,
            CAST(SUM(CASE WHEN stock > 0 AND stock <= minimo THEN 1 ELSE 0 END) AS SIGNED) AS bajo,
            CAST(SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) AS SIGNED) AS agotado,
            CAST(COALESCE(SUM(stock), 0) AS SIGNED) AS unidades,
            CAST(COALESCE(SUM(stock * precio), 0) AS DECIMAL(14,2)) AS valor
     FROM (
       SELECT l.precio, COALESCE(i.stock_actual, 0) AS stock,
              COALESCE(i.stock_minimo_personalizado, ?) AS minimo
       FROM libros l LEFT JOIN inventarios i ON i.id_libro = l.id_libro AND i.id_libreria = ?
     ) t`,
    [defecto, ID_LIBRERIA]
  );
  return {
    normal: r.normal || 0, bajo: r.bajo || 0, agotado: r.agotado || 0,
    unidades: r.unidades || 0, valor: Number(r.valor) || 0
  };
};

/* ---------------------------------------------------------------
   RF19 · KPIs EN TIEMPO REAL
   --------------------------------------------------------------- */

/**
 * RF19 · Indicadores del tablero del administrador.
 *   ventasHoy      -> pedidos activos de hoy y su total facturado
 *   masVendidos    -> top 5 de los últimos 30 días
 *   pendientes     -> pedidos activos que aún no salen (estado de envío Pendiente o Pagado)
 *   tickets        -> solicitudes de devolución sin responder + facturas rechazadas por la DIAN
 */
export const kpis = async () => {
  const [[hoy]] = await pool.query(
    `SELECT CAST(COUNT(DISTINCT p.id_pedido) AS SIGNED) AS pedidos,
            CAST(COALESCE(SUM(f.total), 0) AS DECIMAL(12,2)) AS total
     FROM pedidos p LEFT JOIN facturas f ON f.id_pedido = p.id_pedido
     WHERE p.estado = 'Activo' AND p.fecha_registro >= CURDATE()`
  );
  const [[ayer]] = await pool.query(
    `SELECT CAST(COALESCE(SUM(f.total), 0) AS DECIMAL(12,2)) AS total
     FROM pedidos p LEFT JOIN facturas f ON f.id_pedido = p.id_pedido
     WHERE p.estado = 'Activo' AND p.fecha_registro >= CURDATE() - INTERVAL 1 DAY AND p.fecha_registro < CURDATE()`
  );
  const [masVendidos] = await pool.query(
    `SELECT l.id_libro, l.titulo, CAST(SUM(pl.cantidad) AS SIGNED) AS unidades
     FROM pedido_libro pl
     JOIN pedidos p ON p.id_pedido = pl.id_pedido
     JOIN libros l ON l.id_libro = pl.id_libro
     WHERE p.estado = 'Activo' AND p.fecha_registro >= CURDATE() - INTERVAL 30 DAY
     GROUP BY l.id_libro, l.titulo ORDER BY unidades DESC LIMIT 5`
  );
  const [pendientes] = await pool.query(
    `SELECT p.id_pedido, p.estado_envio, p.fecha_registro, u.nombre AS cliente
     FROM pedidos p LEFT JOIN usuarios u ON u.id = p.id
     WHERE p.estado = 'Activo' AND p.estado_envio IN ('Pendiente', 'Pagado')
     ORDER BY p.fecha_registro ASC`
  );
  const [[sol]] = await pool.query(
    "SELECT CAST(COUNT(*) AS SIGNED) AS n FROM solicitudes_devolucion WHERE estado = 'Pendiente'"
  );
  const [[rech]] = await pool.query(
    "SELECT CAST(COUNT(*) AS SIGNED) AS n FROM facturas WHERE estado_dian = 'Rechazada'"
  );
  const [[notif]] = await pool.query(
    'SELECT CAST(COUNT(*) AS SIGNED) AS n FROM notificaciones WHERE leida = 0'
  );
  const inventario = await estadoInventario();

  return {
    ventasHoy: { pedidos: hoy.pedidos, total: Number(hoy.total), ayer: Number(ayer.total) },
    masVendidos,
    pendientes: { total: pendientes.length, lista: pendientes.slice(0, 8) },
    tickets: { total: sol.n + rech.n, devoluciones: sol.n, facturasRechazadas: rech.n },
    stockBajo: inventario.bajo + inventario.agotado,
    notificacionesSinLeer: notif.n,
    actualizado: new Date().toISOString()
  };
};
