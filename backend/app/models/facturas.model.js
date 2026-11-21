import pool from '../config/db.js';

/**
 * @file facturas.model.js
 * @description RF7 · Búsqueda y detalle de facturas.
 * Cada compra genera UNA factura (RF14/RF23): facturas → detalle_factura, ligada a su pedido.
 */

/** Columnas comunes del listado y del detalle. */
const SELECT_FACTURA = `
  SELECT f.id_factura, f.id_pedido, f.fecha_emision, f.fecha_registro,
         f.subtotal, f.impuestos, f.costo_envio, f.total,
         -- RF5: estado ante la DIAN
         f.documento_adquiriente, f.numero_fe, f.estado_dian, f.motivo_rechazo, f.cufe, f.qr_dian,
         f.ambiente_dian, f.proveedor_fe, f.intentos_envio, f.fecha_envio_dian, f.fecha_validacion_dian,
         (SELECT n.id_nota FROM notas_contables n WHERE n.id_factura = f.id_factura AND n.tipo = 'Crédito') AS id_nota, -- RF4
         p.estado AS estado_pedido, p.id AS id_cliente,
         p.nombre_destinatario, p.direccion_entrega, p.telefono_contacto,
         u.nombre AS cliente, u.email AS cliente_email,
         mp.nombre_metodo AS metodo_pago, te.nombre AS tipo_envio
  FROM facturas f
  JOIN pedidos p          ON p.id_pedido = f.id_pedido
  LEFT JOIN usuarios u    ON u.id = p.id
  LEFT JOIN metodos_pago mp ON mp.id_metodo_pago = f.id_metodo_pago
  LEFT JOIN tipos_envio te  ON te.id_tipo_envio = p.id_tipo_envio`;

/**
 * RF7 · Busca facturas. Todos los filtros son opcionales y se combinan:
 * @param {Object} filtros
 * @param {number} [filtros.pedido] - Número de pedido EXACTO.
 * @param {string} [filtros.desde]  - Fecha inicial 'AAAA-MM-DD' (incluida).
 * @param {string} [filtros.hasta]  - Fecha final 'AAAA-MM-DD' (incluida).
 * @param {string} [filtros.estadoDian] - RF5: Pendiente | Enviada | Aceptada | Rechazada
 * @param {number} [filtros.limite=100]
 * @returns {Promise<Array<Object>>} Facturas de la más reciente a la más antigua.
 */
export const buscarFacturas = async ({ pedido, desde, hasta, estadoDian, limite = 100 } = {}) => {
  let query = `${SELECT_FACTURA} WHERE 1=1`;
  const params = [];

  if (pedido) {
    query += ' AND f.id_pedido = ?';
    params.push(pedido);
  }
  if (desde) {
    query += ' AND f.fecha_emision >= ?';
    params.push(desde);
  }
  if (hasta) {
    query += ' AND f.fecha_emision <= ?';
    params.push(hasta);
  }
  if (estadoDian) {
    query += ' AND f.estado_dian = ?';
    params.push(estadoDian);
  }
  query += ' ORDER BY f.id_factura DESC LIMIT ?';
  params.push(limite);

  const [rows] = await pool.query(query, params);
  return rows;
};

/**
 * RF7 · Una factura completa con sus líneas (para abrirla o descargarla).
 * @param {number} id - id_factura
 * @returns {Promise<Object|null>}
 */
export const getFactura = async (id) => {
  const [[factura]] = await pool.query(`${SELECT_FACTURA} WHERE f.id_factura = ?`, [id]);
  if (!factura) return null;
  const [lineas] = await pool.query(
    `SELECT d.id_libro, d.cantidad, d.subtotal, l.titulo, l.autor, l.ISBN
     FROM detalle_factura d LEFT JOIN libros l ON l.id_libro = d.id_libro
     WHERE d.id_factura = ? ORDER BY d.id_detalle`,
    [id]
  );
  return { ...factura, lineas };
};
