import pool from '../../config/db.js';
import { getFactura } from '../../models/facturas.model.js';
import { ErrorInventario } from '../../models/inventario.model.js';
import { calcularCufe, textoQr, fechaHoraDian, dosDecimales } from './cufe.js';
import * as proveedorSimulado from './proveedorSimulado.js';
import * as proveedorApi from './proveedorApi.js';

/**
 * @file services/facturacion/index.js
 * @description RF5 · Orquesta la facturación electrónica:
 *   1. Lee los datos del emisor (Configuración → Facturación electrónica).
 *   2. Arma el documento de la factura (emisor, cliente, líneas, totales).
 *   3. Lo envía al proveedor (simulado o real) y guarda la respuesta:
 *        Enviada  -> salió hacia el servicio y aún no hay respuesta
 *        Aceptada -> válida: se guardan CUFE y QR
 *        Rechazada-> se guarda el motivo; se puede corregir y reenviar
 *   4. Deja cada intento en facturas_eventos_dian (historial).
 */

/** Documento que la DIAN usa para "consumidor final" cuando el cliente no da cédula/NIT. */
export const CONSUMIDOR_FINAL = '222222222222';

/** Claves de la configuración del emisor en la tabla `configuraciones`. */
const CLAVES = ['fe_proveedor', 'fe_ambiente', 'fe_nit_emisor', 'fe_razon_social', 'fe_resolucion', 'fe_prefijo', 'fe_clave_tecnica'];

/** Lee la configuración del emisor como objeto { fe_nit_emisor: '...', ... }. */
export const getConfigFE = async () => {
  const [rows] = await pool.query(
    'SELECT nombre_parametro, valor_parametro FROM configuraciones WHERE nombre_parametro IN (?)',
    [CLAVES]
  );
  const cfg = Object.fromEntries(CLAVES.map(c => [c, '']));
  rows.forEach(r => { cfg[r.nombre_parametro] = r.valor_parametro; });
  return cfg;
};

/**
 * Guarda la configuración del emisor (solo las claves conocidas).
 * @param {Object} datos
 * @param {number} idUsuario - Quién la cambió (configuraciones.configurado_por)
 */
export const guardarConfigFE = async (datos, idUsuario) => {
  for (const clave of CLAVES) {
    if (datos[clave] === undefined) continue;
    await pool.query(
      `INSERT INTO configuraciones (nombre_parametro, valor_parametro, configurado_por) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE valor_parametro = VALUES(valor_parametro), configurado_por = VALUES(configurado_por)`,
      [clave, String(datos[clave]).trim(), idUsuario]
    );
  }
};

/** Proveedor según la configuración ("api" = real; cualquier otro valor = simulado). */
const elegirProveedor = (cfg) => (cfg.fe_proveedor === 'api' ? proveedorApi : proveedorSimulado);

/** Arma el documento electrónico a partir de la factura y la configuración del emisor. */
const armarDocumento = (factura, cfg) => {
  const { fecha, hora } = fechaHoraDian(factura.fecha_registro || factura.fecha_emision);
  const subtotal = Number(factura.subtotal ?? factura.total);
  const envio = Number(factura.costo_envio || 0);
  return {
    numeroFe: `${cfg.fe_prefijo || ''}${factura.id_factura}`,
    fecha,
    hora,
    ambiente: cfg.fe_ambiente === '1' ? '1' : '2',
    emisor: {
      nit: String(cfg.fe_nit_emisor || '').replace(/\D/g, ''),
      razonSocial: cfg.fe_razon_social,
      resolucion: cfg.fe_resolucion,
      claveTecnica: cfg.fe_clave_tecnica
    },
    adquiriente: {
      documento: factura.documento_adquiriente || CONSUMIDOR_FINAL,
      nombre: factura.cliente,
      correo: factura.cliente_email
    },
    lineas: factura.lineas.map(l => ({ titulo: l.titulo, cantidad: l.cantidad, subtotal: Number(l.subtotal) })),
    totales: {
      subtotal,
      envio,
      valorBruto: subtotal + envio,          // ValFac: antes de impuestos
      iva: Number(factura.impuestos || 0),
      total: Number(factura.total)
    },
    pago: factura.metodo_pago
  };
};

/** Guarda un evento en el historial de la factura. */
const registrarEvento = (idFactura, estado, mensaje, idUsuario) =>
  pool.query(
    'INSERT INTO facturas_eventos_dian (id_factura, estado, mensaje, id_usuario) VALUES (?, ?, ?, ?)',
    [idFactura, estado, mensaje ? String(mensaje).slice(0, 500) : null, idUsuario || null]
  );

/**
 * RF5 · Envía UNA factura al servicio de validación y guarda el resultado.
 * @param {number} idFactura
 * @param {number|null} [idUsuario] - Quién la envía (null = automático al comprar)
 * @returns {Promise<{estado:string, motivo?:string, cufe?:string}>}
 */
export const enviarFactura = async (idFactura, idUsuario = null) => {
  const factura = await getFactura(idFactura);
  if (!factura) throw new ErrorInventario('La factura no existe.', 404);
  if (factura.estado_dian === 'Aceptada') throw new ErrorInventario('Esta factura ya fue aceptada; no se reenvía.');
  if (factura.estado_pedido === 'Devuelto') {
    throw new ErrorInventario('El pedido fue devuelto: la factura está anulada y no se envía (requeriría una nota crédito).');
  }

  const cfg = await getConfigFE();
  const doc = armarDocumento(factura, cfg);
  const proveedor = elegirProveedor(cfg);

  // 1) Marcar como enviada (si el servicio no responde, queda así y se puede reenviar)
  await pool.query(
    `UPDATE facturas SET estado_dian = 'Enviada', numero_fe = ?, intentos_envio = intentos_envio + 1,
       fecha_envio_dian = NOW(), proveedor_fe = ?, ambiente_dian = ?
     WHERE id_factura = ?`,
    [doc.numeroFe, proveedor.nombre, doc.ambiente === '1' ? 'Producción' : 'Pruebas', idFactura]
  );
  await registrarEvento(idFactura, 'Enviada', `Enviada a ${proveedor.nombre} como ${doc.numeroFe}.`, idUsuario);

  // 2) Validar con el proveedor
  const respuesta = await proveedor.validar(doc);

  if (respuesta.sinRespuesta) {
    await pool.query('UPDATE facturas SET motivo_rechazo = ? WHERE id_factura = ?', [respuesta.motivo, idFactura]);
    await registrarEvento(idFactura, 'Enviada', `Sin respuesta: ${respuesta.motivo}`, idUsuario);
    return { estado: 'Enviada', motivo: respuesta.motivo };
  }

  if (!respuesta.aceptada) {
    await pool.query(
      `UPDATE facturas SET estado_dian = 'Rechazada', motivo_rechazo = ?, fecha_validacion_dian = NOW() WHERE id_factura = ?`,
      [respuesta.motivo, idFactura]
    );
    await registrarEvento(idFactura, 'Rechazada', respuesta.motivo, idUsuario);
    return { estado: 'Rechazada', motivo: respuesta.motivo };
  }

  // 3) Aceptada: CUFE (el que dé el proveedor real, o calculado con la fórmula de la DIAN) y QR
  const datosCufe = {
    numeroFe: doc.numeroFe, fecha: doc.fecha, hora: doc.hora,
    valorBruto: doc.totales.valorBruto, iva: doc.totales.iva, total: doc.totales.total,
    nitEmisor: doc.emisor.nit, docAdquiriente: doc.adquiriente.documento,
    claveTecnica: doc.emisor.claveTecnica, ambiente: doc.ambiente
  };
  const cufe = respuesta.cufe || calcularCufe(datosCufe);
  const qr = textoQr(datosCufe, cufe);
  await pool.query(
    `UPDATE facturas SET estado_dian = 'Aceptada', motivo_rechazo = NULL, cufe = ?, qr_dian = ?,
       documento_adquiriente = ?, fecha_validacion_dian = NOW()
     WHERE id_factura = ?`,
    [cufe, qr, doc.adquiriente.documento, idFactura]
  );
  await registrarEvento(idFactura, 'Aceptada', `Validada. Total ${dosDecimales(doc.totales.total)}. Ref. ${respuesta.referencia || '—'}.`, idUsuario);
  return { estado: 'Aceptada', cufe };
};

/**
 * Igual que enviarFactura, pero NUNCA lanza error: se usa justo después de comprar,
 * para que un problema con el servicio de facturación no tumbe la compra del cliente.
 */
export const enviarFacturaSinFallar = async (idFactura) => {
  try {
    return await enviarFactura(idFactura, null);
  } catch (error) {
    await registrarEvento(idFactura, 'Pendiente', `No se pudo enviar automáticamente: ${error.message}`, null).catch(() => {});
    return { estado: 'Pendiente', motivo: error.message };
  }
};

/** Historial de envíos de una factura (del más reciente al más antiguo). */
export const getEventos = async (idFactura) => {
  const [rows] = await pool.query(
    `SELECT e.estado, e.mensaje, e.fecha, u.nombre AS usuario
     FROM facturas_eventos_dian e LEFT JOIN usuarios u ON u.id = e.id_usuario
     WHERE e.id_factura = ? ORDER BY e.id_evento DESC`,
    [idFactura]
  );
  return rows;
};

/**
 * Corrige el documento (cédula/NIT) del cliente en una factura NO aceptada.
 * Vacío = consumidor final.
 */
export const corregirDocumento = async (idFactura, documento) => {
  const limpio = String(documento || '').replace(/\D/g, '');
  const [r] = await pool.query(
    `UPDATE facturas SET documento_adquiriente = ? WHERE id_factura = ? AND estado_dian <> 'Aceptada'`,
    [limpio || null, idFactura]
  );
  if (!r.affectedRows) throw new ErrorInventario('La factura no existe o ya fue aceptada (no se puede cambiar).');
  return limpio || CONSUMIDOR_FINAL;
};
