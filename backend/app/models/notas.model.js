import pool from '../config/db.js';

/**
 * @file notas.model.js
 * @description RF4 · Notas contables (crédito y débito) asociadas a una factura.
 *  - Nota CRÉDITO: corrige una factura a favor del cliente (devolución: se le debe su dinero).
 *  - Nota DÉBITO: corrige una factura a cargo del cliente (cobro adicional). La tabla la admite;
 *    las devoluciones generan siempre nota crédito.
 * Política de la tienda: en una devolución se reintegran los libros y su IVA; el envío no se reintegra.
 */

const redondear = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * RF4 · Crea la nota crédito de un pedido devuelto. Se llama DENTRO de la transacción
 * de la devolución, así que se crea sola, sin que nadie la haga a mano.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{idPedido:number, idSolicitud?:number|null, motivo:string, idUsuario:number}} datos
 * @returns {Promise<number>} id de la nota creada
 */
export const crearNotaCredito = async (conn, { idPedido, idSolicitud = null, motivo, idUsuario }) => {
  const [[factura]] = await conn.query(
    'SELECT id_factura, subtotal, impuestos, total FROM facturas WHERE id_pedido = ?',
    [idPedido]
  );
  if (!factura) return null;   // pedido sin factura (no debería pasar)

  const [lineas] = await conn.query(
    'SELECT id_libro, cantidad, subtotal FROM detalle_factura WHERE id_factura = ?',
    [factura.id_factura]
  );
  const subtotal = redondear(lineas.reduce((s, l) => s + Number(l.subtotal), 0));
  const impuestos = redondear(factura.impuestos);

  const [r] = await conn.query(
    `INSERT INTO notas_contables (tipo, id_factura, id_solicitud, motivo, subtotal, impuestos, total, id_usuario)
     VALUES ('Crédito', ?, ?, ?, ?, ?, ?, ?)`,
    [factura.id_factura, idSolicitud, String(motivo || 'Devolución').slice(0, 300), subtotal, impuestos, redondear(subtotal + impuestos), idUsuario]
  );
  for (const l of lineas) {
    await conn.query(
      'INSERT INTO notas_contables_detalle (id_nota, id_libro, cantidad, subtotal) VALUES (?, ?, ?, ?)',
      [r.insertId, l.id_libro, l.cantidad, l.subtotal]
    );
  }
  return r.insertId;
};

/**
 * RF4 · Una nota completa (para verla o descargarla) con su factura original y su cliente.
 * @param {number} id
 */
export const getNota = async (id) => {
  const [[nota]] = await pool.query(
    `SELECT n.*, f.id_pedido, f.numero_fe, f.fecha_registro AS fecha_factura, f.total AS total_factura,
            f.documento_adquiriente, p.id AS id_cliente, u.nombre AS cliente, u.email AS cliente_email,
            r.nombre AS aprobada_por, s.motivo AS motivo_cliente, s.estado_libro
     FROM notas_contables n
     JOIN facturas f ON f.id_factura = n.id_factura
     JOIN pedidos p  ON p.id_pedido = f.id_pedido
     LEFT JOIN usuarios u ON u.id = p.id
     LEFT JOIN usuarios r ON r.id = n.id_usuario
     LEFT JOIN solicitudes_devolucion s ON s.id_solicitud = n.id_solicitud
     WHERE n.id_nota = ?`,
    [id]
  );
  if (!nota) return null;
  const [lineas] = await pool.query(
    `SELECT d.cantidad, d.subtotal, l.titulo, l.ISBN
     FROM notas_contables_detalle d LEFT JOIN libros l ON l.id_libro = d.id_libro
     WHERE d.id_nota = ? ORDER BY d.id_detalle`,
    [id]
  );
  return { ...nota, lineas };
};
