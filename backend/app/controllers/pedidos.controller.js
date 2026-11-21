import {
  crearPedido, devolverPedido, getPedidos, cotizar, cambiarEstadoPedido, SIGUIENTES_ESTADOS,
  crearSolicitud, getSolicitudes, responderSolicitud, MOTIVOS_DEVOLUCION
} from '../models/pedidos.model.js';
import { ErrorInventario } from '../models/inventario.model.js';
import { enviarFacturaSinFallar } from '../services/facturacion/index.js';   // RF5

/** Respuesta común de errores: los de negocio (sin stock, ya devuelto) con su estado; el resto 500. */
const responderError = (res, error) => {
  if (error instanceof ErrorInventario) return res.status(error.status).json({ error: error.message });
  res.status(500).json({ error: error.message });
};

/**
 * RF23 · Valida y ordena los libros del carrito: junta repetidos (mismo libro dos veces)
 * y exige cantidades enteras de 1 en adelante (máximo 99 por libro).
 * @returns {Array<{id_libro:number, cantidad:number}>}
 * @throws {ErrorInventario} 400 si el carrito está vacío o tiene una cantidad inválida.
 */
const normalizarItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) throw new ErrorInventario('El carrito está vacío.', 400);
  const porLibro = new Map();
  for (const it of items) {
    const id = Number(it.id_libro);
    const cantidad = Number(it.cantidad);
    if (!Number.isInteger(id) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) {
      throw new ErrorInventario('Hay una cantidad no válida en el carrito.', 400);
    }
    porLibro.set(id, (porLibro.get(id) || 0) + cantidad);
  }
  return [...porLibro].map(([id_libro, cantidad]) => ({ id_libro, cantidad }));
};

/**
 * POST /api/pedidos/cotizar · RF23/RF17: precios, stock, subtotal, impuestos, envío y total
 * del carrito según la base de datos, sin comprar nada. Body: { items: [{ id_libro, cantidad }], envio?: id_tipo_envio }
 */
export const cotizarCarrito = async (req, res) => {
  try {
    const idEnvio = Number(req.body.envio) || null;
    res.json(await cotizar(normalizarItems(req.body.items), idEnvio));
  } catch (error) {
    responderError(res, error);
  }
};

/**
 * POST /api/pedidos · RF14/RF23/RF17: el cliente confirma y paga su carrito.
 * Body: { items: [{ id_libro, cantidad }], entrega: { nombre, direccion, telefono },
 *         metodo: id_metodo_pago, envio: id_tipo_envio }
 */
export const registrarPedido = async (req, res) => {
  try {
    const { entrega = {} } = req.body;
    const items = normalizarItems(req.body.items);
    if (!entrega.nombre || !entrega.direccion || !entrega.telefono) {
      return res.status(400).json({ error: 'Faltan los datos de entrega (nombre, dirección y teléfono).' });
    }
    // RF17: ahora llegan los id de la BD; el modelo comprueba que sigan activos
    const idMetodoPago = Number(req.body.metodo);
    const idEnvio = Number(req.body.envio);
    if (!Number.isInteger(idMetodoPago) || idMetodoPago < 1) return res.status(400).json({ error: 'Elige una forma de pago.' });
    if (!Number.isInteger(idEnvio) || idEnvio < 1) return res.status(400).json({ error: 'Elige un tipo de envío.' });

    const resultado = await crearPedido({
      idUsuario: req.usuario.id,
      items,
      entrega: {
        nombre: String(entrega.nombre).trim().slice(0, 100),
        direccion: String(entrega.direccion).trim().slice(0, 150),
        telefono: String(entrega.telefono).trim().slice(0, 20)
      },
      idMetodoPago,
      idEnvio,
      // RF5: cédula/NIT opcional (solo dígitos); vacío = consumidor final
      documento: String(req.body.documento || '').replace(/\D/g, '').slice(0, 15) || null
    });

    // RF5: la factura se envía al servicio de validación apenas termina la compra.
    // Si el servicio falla, la compra igual queda registrada y la factura se puede reenviar.
    const dian = await enviarFacturaSinFallar(resultado.id_factura);
    res.status(201).json({ message: 'Pedido registrado', pedido: { ...resultado, estado_dian: dian.estado, motivo_dian: dian.motivo || null } });
  } catch (error) {
    responderError(res, error);
  }
};

/** GET /api/pedidos/mios · Pedidos del cliente que inició sesión (página "Mis compras"). */
export const misPedidos = async (req, res) => {
  try {
    res.json({ pedidos: await getPedidos({ idUsuario: req.usuario.id }) });
  } catch (error) {
    responderError(res, error);
  }
};

/** GET /api/pedidos · Ventas recientes de toda la tienda (personal con permiso de inventario). */
export const listarPedidos = async (req, res) => {
  try {
    res.json({ pedidos: await getPedidos({ limite: 30 }) });
  } catch (error) {
    responderError(res, error);
  }
};

/** RF9 · Estado en que llegó el libro devuelto (solo "Bueno" vuelve al stock). */
const leerEstadoLibro = (valor) => (valor === 'Dañado' ? 'Dañado' : 'Bueno');

/** Mensaje de confirmación de una devolución (stock + nota crédito). */
const mensajeDevolucion = (r) =>
  `Devolución registrada. ${r.repusoStock ? 'Los libros volvieron al stock.' : 'El libro llegó dañado: no vuelve al stock.'}` +
  `${r.idNota ? ` Se generó la nota crédito NC-${String(r.idNota).padStart(4, '0')}.` : ''}`;

/** POST /api/pedidos/:id/devolucion · RF9: devolución directa. Body: { estado_libro: 'Bueno'|'Dañado' } */
export const registrarDevolucion = async (req, res) => {
  try {
    const r = await devolverPedido(Number(req.params.id), req.usuario.id, { estadoLibro: leerEstadoLibro(req.body.estado_libro) });
    res.json({ message: mensajeDevolucion(r), ...r });
  } catch (error) {
    responderError(res, error);
  }
};

/* ---------------------------------------------------------------
   SOLICITUDES DE DEVOLUCIÓN (RF14)
   --------------------------------------------------------------- */

/**
 * POST /api/pedidos/:id/solicitud-devolucion · El cliente pide devolver SU pedido.
 * Body: { motivo: uno de MOTIVOS_DEVOLUCION, detalle?: texto (obligatorio si es "Otro motivo") }
 */
export const solicitarDevolucion = async (req, res) => {
  try {
    const motivo = String(req.body.motivo || '');
    const detalle = String(req.body.detalle || '').trim().slice(0, 300);
    if (!MOTIVOS_DEVOLUCION.includes(motivo)) {
      return res.status(400).json({ error: 'Elige el motivo de la devolución.' });
    }
    if (motivo === 'Otro motivo' && !detalle) {
      return res.status(400).json({ error: 'Cuéntanos el motivo de la devolución.' });
    }
    await crearSolicitud({ idPedido: Number(req.params.id), idUsuario: req.usuario.id, motivo, detalle });
    res.status(201).json({ message: 'Recibimos tu solicitud. Te avisaremos cuando la revisemos.' });
  } catch (error) {
    responderError(res, error);
  }
};

/** GET /api/pedidos/solicitudes · Solicitudes para el panel (pendientes primero). */
export const listarSolicitudes = async (req, res) => {
  try {
    res.json({ solicitudes: await getSolicitudes() });
  } catch (error) {
    responderError(res, error);
  }
};

/**
 * POST /api/pedidos/solicitudes/:id/responder · El personal aprueba o rechaza.
 * Body: { decision: 'aprobar' | 'rechazar', respuesta?: texto (obligatorio al rechazar) }
 */
export const responderDevolucion = async (req, res) => {
  try {
    const { decision } = req.body;
    const respuesta = String(req.body.respuesta || '').trim().slice(0, 300);
    if (!['aprobar', 'rechazar'].includes(decision)) {
      return res.status(400).json({ error: 'La decisión debe ser aprobar o rechazar.' });
    }
    if (decision === 'rechazar' && !respuesta) {
      return res.status(400).json({ error: 'Escribe al cliente por qué se rechaza la devolución.' });
    }
    const r = await responderSolicitud({
      idSolicitud: Number(req.params.id),
      aprobar: decision === 'aprobar',
      respuesta,
      idRevisor: req.usuario.id,
      estadoLibro: leerEstadoLibro(req.body.estado_libro)   // RF9
    });
    res.json({
      message: decision === 'aprobar' ? mensajeDevolucion(r) : 'Solicitud rechazada. El cliente verá tu respuesta.',
      ...r
    });
  } catch (error) {
    responderError(res, error);
  }
};

/**
 * PUT /api/pedidos/:id/estado · RF27: el encargado actualiza el estado del pedido.
 * Body: { estado: 'Pagado'|'Enviado'|'Entregado'|'Cancelado', nota?: texto (ej. número de guía) }
 */
export const actualizarEstadoPedido = async (req, res) => {
  try {
    const { estado } = req.body;
    if (!Object.keys(SIGUIENTES_ESTADOS).includes(estado)) return res.status(400).json({ error: 'Estado no válido.' });
    await cambiarEstadoPedido({ idPedido: Number(req.params.id), estado, nota: req.body.nota, idUsuario: req.usuario.id });
    res.json({ message: `El pedido ahora está "${estado}".${estado === 'Cancelado' ? ' Se repuso el stock y se generó la nota crédito.' : ''}` });
  } catch (error) {
    responderError(res, error);
  }
};
