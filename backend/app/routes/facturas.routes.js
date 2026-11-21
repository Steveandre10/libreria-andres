import express from 'express';
import pool from '../config/db.js';
import { buscarFacturas, getFactura } from '../models/facturas.model.js';
import { getPermisosDeRol } from '../models/roles.model.js';
import { ErrorInventario } from '../models/inventario.model.js';
import {
  enviarFactura, getEventos, corregirDocumento, getConfigFE, guardarConfigFE, CONSUMIDOR_FINAL
} from '../services/facturacion/index.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';
import { enviarCorreo, esCorreoValido } from '../services/correo.js';   // RF2

/**
 * @file facturas.routes.js
 * @description RF7 + RF5 · Facturas y facturación electrónica.
 *   GET  /api/facturas?pedido=&desde=&hasta=&estado_dian=   -> búsqueda (módulo "facturas")
 *   GET  /api/facturas/electronica/configuracion           -> datos del emisor (módulo "configuracion")
 *   PUT  /api/facturas/electronica/configuracion           -> guardar datos del emisor
 *   GET  /api/facturas/:id                                 -> una factura (dueño o personal con permiso)
 *   POST /api/facturas/:id/enviar                          -> RF5: enviar / reenviar al servicio de validación
 *   PUT  /api/facturas/:id/documento                       -> RF5: corregir la cédula/NIT del cliente
 *   POST /api/facturas/:id/enviar-correo                   -> RF2: enviar la factura a otro correo
 */
const router = express.Router();

const responderError = (res, error) => {
  if (error instanceof ErrorInventario) return res.status(error.status).json({ error: error.message });
  res.status(500).json({ error: error.message });
};

/** ¿La fecha tiene formato AAAA-MM-DD y es una fecha real? */
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());
const ESTADOS_DIAN = ['Pendiente', 'Enviada', 'Aceptada', 'Rechazada'];

router.get('/', verificarToken, requerirPermiso('facturas', 'ver'), async (req, res) => {
  try {
    const { desde = '', hasta = '', estado_dian = '' } = req.query;
    // Acepta "17", "0017" o "N.º 0017": se queda solo con los dígitos
    const pedidoTexto = String(req.query.pedido || '').replace(/\D/g, '');
    const pedido = pedidoTexto ? Number(pedidoTexto) : null;

    if (desde && !esFecha(desde)) return res.status(400).json({ error: 'La fecha inicial no es válida.' });
    if (hasta && !esFecha(hasta)) return res.status(400).json({ error: 'La fecha final no es válida.' });
    if (desde && hasta && desde > hasta) {
      return res.status(400).json({ error: 'La fecha inicial no puede ser posterior a la final.' });
    }
    const estadoDian = ESTADOS_DIAN.includes(estado_dian) ? estado_dian : null;

    res.json({ facturas: await buscarFacturas({ pedido, desde, hasta, estadoDian }) });
  } catch (error) {
    responderError(res, error);
  }
});

/* ------------------- RF5 · Configuración del emisor ------------------- */
router.get('/electronica/configuracion', verificarToken, requerirPermiso('configuracion', 'ver'), async (req, res) => {
  try {
    const cfg = await getConfigFE();
    // La clave técnica es sensible: se muestra enmascarada
    res.json({ configuracion: { ...cfg, fe_clave_tecnica_mascara: cfg.fe_clave_tecnica ? `••••${cfg.fe_clave_tecnica.slice(-4)}` : '' } });
  } catch (error) {
    responderError(res, error);
  }
});

router.put('/electronica/configuracion', verificarToken, requerirPermiso('configuracion', 'editar'), async (req, res) => {
  try {
    const b = req.body;
    const nit = String(b.fe_nit_emisor || '').replace(/\D/g, '');
    if (nit && !/^\d{9,10}$/.test(nit)) return res.status(400).json({ error: 'El NIT debe tener 9 o 10 dígitos (sin dígito de verificación).' });
    if (b.fe_ambiente && !['1', '2'].includes(String(b.fe_ambiente))) return res.status(400).json({ error: 'Ambiente no válido.' });
    if (b.fe_proveedor && !['simulador', 'api'].includes(b.fe_proveedor)) return res.status(400).json({ error: 'Proveedor no válido.' });

    const datos = {
      fe_proveedor: b.fe_proveedor,
      fe_ambiente: b.fe_ambiente,
      fe_nit_emisor: nit,
      fe_razon_social: b.fe_razon_social,
      fe_resolucion: b.fe_resolucion,
      fe_prefijo: b.fe_prefijo !== undefined ? String(b.fe_prefijo).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) : undefined
    };
    // La clave técnica solo se cambia si escriben una nueva
    if (b.fe_clave_tecnica) datos.fe_clave_tecnica = b.fe_clave_tecnica;
    await guardarConfigFE(datos, req.usuario.id);
    res.json({ message: 'Datos de facturación electrónica guardados.' });
  } catch (error) {
    responderError(res, error);
  }
});

/* ------------------------- Una factura ------------------------- */

/** ¿El usuario puede ver/editar facturas de otros? (rol leído de la BD) */
const permisoFacturas = async (idUsuario, accion = 'ver') => {
  const [[usuario]] = await pool.query('SELECT rol FROM usuarios WHERE id = ?', [idUsuario]);
  const permisos = await getPermisosDeRol(usuario?.rol);
  return permisos.some(p => p.modulo === 'facturas' && p[accion]);
};

router.get('/:id', verificarToken, async (req, res) => {
  try {
    const factura = await getFactura(Number(req.params.id));
    if (!factura) return res.status(404).json({ error: 'La factura no existe.' });

    // El dueño de la compra siempre puede ver su factura; el resto necesita el permiso "facturas"
    const esPersonal = await permisoFacturas(req.usuario.id);
    if (factura.id_cliente !== req.usuario.id && !esPersonal) {
      // 404 y no 403: no revelamos que existe una factura de otra persona
      return res.status(404).json({ error: 'La factura no existe.' });
    }
    // RF5: el personal también ve el historial de envíos a la DIAN
    const eventos = esPersonal ? await getEventos(factura.id_factura) : [];
    res.json({ factura: { ...factura, consumidor_final: !factura.documento_adquiriente || factura.documento_adquiriente === CONSUMIDOR_FINAL }, eventos });
  } catch (error) {
    responderError(res, error);
  }
});

/** RF5 · Enviar o reenviar una factura al servicio de validación. */
router.post('/:id/enviar', verificarToken, requerirPermiso('facturas', 'editar'), async (req, res) => {
  try {
    const resultado = await enviarFactura(Number(req.params.id), req.usuario.id);
    const mensajes = {
      Aceptada: 'Factura validada y aceptada.',
      Rechazada: 'El servicio rechazó la factura. Revisa el motivo, corrígelo y reenvía.',
      Enviada: 'Enviada, pero el servicio no respondió. Puedes reenviarla en unos minutos.'
    };
    res.json({ message: mensajes[resultado.estado], ...resultado });
  } catch (error) {
    responderError(res, error);
  }
});

/** RF5 · Corregir la cédula/NIT del cliente antes de reenviar (vacío = consumidor final). */
router.put('/:id/documento', verificarToken, requerirPermiso('facturas', 'editar'), async (req, res) => {
  try {
    const documento = await corregirDocumento(Number(req.params.id), req.body.documento);
    res.json({ message: 'Documento del cliente actualizado. Ya puedes reenviar la factura.', documento });
  } catch (error) {
    responderError(res, error);
  }
});


/* ------------------- RF2 · Enviar la factura a otro correo ------------------- */

/** Máximo de correos por factura en una hora (evita que se use para enviar spam). */
const MAX_CORREOS_POR_HORA = 5;
const enviosRecientes = new Map();   // id_factura -> [fechas de envío]

/** Escapa texto para meterlo en el HTML del correo. */
const h = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dinero = (v) => '$' + Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Arma el HTML del correo con el contenido de la factura. */
const htmlFactura = (f) => {
  const numero = f.numero_fe || `N.º ${String(f.id_factura).padStart(4, '0')}`;
  const filas = f.lineas.map(l => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e7eaef">${h(l.titulo || 'Libro')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e7eaef;text-align:right">${l.cantidad}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e7eaef;text-align:right">${dinero(l.subtotal)}</td>
    </tr>`).join('');
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1b2233">
    <h2 style="margin:0;color:#1c2b4a">Librería Andrés</h2>
    <p style="margin:2px 0 16px;color:#636c7e">Factura de venta ${h(numero)} · Pedido N.º ${String(f.id_pedido).padStart(4, '0')}</p>
    <p>Te compartieron esta factura de <b>${h(f.cliente || 'un cliente')}</b>, emitida el
       ${new Date(f.fecha_registro || f.fecha_emision).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
      <thead><tr style="background:#f1f3f6">
        <th style="padding:6px 8px;text-align:left">Libro</th><th style="padding:6px 8px;text-align:right">Cant.</th><th style="padding:6px 8px;text-align:right">Subtotal</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <table style="margin-left:auto;font-size:14px">
      <tr><td style="padding:2px 10px">Subtotal</td><td style="text-align:right">${dinero(f.subtotal ?? f.total)}</td></tr>
      <tr><td style="padding:2px 10px">IVA (libros excluidos)</td><td style="text-align:right">${dinero(f.impuestos)}</td></tr>
      <tr><td style="padding:2px 10px">Envío</td><td style="text-align:right">${Number(f.costo_envio) ? dinero(f.costo_envio) : 'Gratis'}</td></tr>
      <tr><td style="padding:6px 10px"><b>Total</b></td><td style="text-align:right"><b>${dinero(f.total)}</b></td></tr>
    </table>
    <p style="font-size:13px">Forma de pago: ${h(f.metodo_pago || '—')} · Envío: ${h(f.tipo_envio || '—')}</p>
    ${f.estado_dian === 'Aceptada'
      ? `<p style="font-size:12px;color:#26623f">Factura electrónica validada. CUFE: <span style="font-family:monospace;word-break:break-all">${h(f.cufe)}</span></p>`
      : ''}
    <p style="font-size:12px;color:#636c7e;margin-top:24px">Los libros están excluidos de IVA en Colombia (Ley 98 de 1993). Correo enviado desde Librería Andrés.</p>
  </div>`;
};

router.post('/:id/enviar-correo', verificarToken, async (req, res) => {
  try {
    const correo = String(req.body.correo || '').trim().toLowerCase();
    if (!esCorreoValido(correo)) return res.status(400).json({ error: 'Escribe un correo válido (por ejemplo nombre@correo.com).' });

    const factura = await getFactura(Number(req.params.id));
    // Solo el dueño de la compra o el personal con permiso pueden reenviarla
    if (!factura || (factura.id_cliente !== req.usuario.id && !(await permisoFacturas(req.usuario.id)))) {
      return res.status(404).json({ error: 'La factura no existe.' });
    }

    // Límite de envíos por hora para esta factura
    const ahora = Date.now();
    const recientes = (enviosRecientes.get(factura.id_factura) || []).filter(t => ahora - t < 3600000);
    if (recientes.length >= MAX_CORREOS_POR_HORA) {
      return res.status(429).json({ error: 'Ya enviaste esta factura varias veces. Espera un rato antes de volver a intentarlo.' });
    }

    const numero = factura.numero_fe || `N.º ${String(factura.id_factura).padStart(4, '0')}`;
    const resultado = await enviarCorreo({
      para: correo,
      asunto: `Factura ${numero} · Librería Andrés`,
      html: htmlFactura(factura),
      texto: `Factura ${numero} de Librería Andrés. Total: ${dinero(factura.total)}.`
    });
    enviosRecientes.set(factura.id_factura, [...recientes, ahora]);

    // Queda en el historial de la factura (el que ve el personal)
    await pool.query(
      'INSERT INTO facturas_eventos_dian (id_factura, estado, mensaje, id_usuario) VALUES (?, ?, ?, ?)',
      [factura.id_factura, 'Correo', `Enviada por correo a ${correo}.`, req.usuario.id]
    );

    res.json({
      message: `Listo, enviamos la factura a ${correo}.`,
      modo: resultado.modo,
      vista_previa: resultado.vistaPrevia   // solo en modo pruebas
    });
  } catch (error) {
    res.status(502).json({ error: `No se pudo enviar el correo: ${error.message}` });
  }
});

export default router;
