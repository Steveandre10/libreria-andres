import {
  crearPedido, devolverPedido, getPedidos, METODOS_PAGO,
  crearSolicitud, getSolicitudes, responderSolicitud, MOTIVOS_DEVOLUCION
} from '../models/pedidos.model.js';
import { ErrorInventario } from '../models/inventario.model.js';

/** Respuesta común de errores: los de negocio (sin stock, ya devuelto) con su estado; el resto 500. */
const responderError = (res, error) => {
  if (error instanceof ErrorInventario) return res.status(error.status).json({ error: error.message });
  res.status(500).json({ error: error.message });
};

/**
 * POST /api/pedidos · RF14: el cliente confirma su carrito.
 * Body: { items: [{ id_libro, cantidad }], entrega: { nombre, direccion, telefono }, metodo: 'tarjeta'|'nequi'|'efectivo' }
 */
export const registrarPedido = async (req, res) => {
  try {
    const { items, entrega = {}, metodo } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío.' });
    }
    // Junta repetidos (mismo libro dos veces) y valida cantidades enteras positivas
    const porLibro = new Map();
    for (const it of items) {
      const id = Number(it.id_libro);
      const cantidad = Number(it.cantidad);
      if (!Number.isInteger(id) || !Number.isInteger(cantidad) || cantidad < 1) {
        return res.status(400).json({ error: 'Hay una cantidad no válida en el carrito.' });
      }
      porLibro.set(id, (porLibro.get(id) || 0) + cantidad);
    }
    if (!entrega.nombre || !entrega.direccion || !entrega.telefono) {
      return res.status(400).json({ error: 'Faltan los datos de entrega (nombre, dirección y teléfono).' });
    }
    const idMetodoPago = METODOS_PAGO[metodo];
    if (!idMetodoPago) return res.status(400).json({ error: 'Elige una forma de pago válida.' });

    const resultado = await crearPedido({
      idUsuario: req.usuario.id,
      items: [...porLibro].map(([id_libro, cantidad]) => ({ id_libro, cantidad })),
      entrega: {
        nombre: String(entrega.nombre).trim().slice(0, 100),
        direccion: String(entrega.direccion).trim().slice(0, 150),
        telefono: String(entrega.telefono).trim().slice(0, 20)
      },
      idMetodoPago
    });
    res.status(201).json({ message: 'Pedido registrado', pedido: resultado });
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

/** POST /api/pedidos/:id/devolucion · RF14: devuelve el pedido y repone el stock. */
export const registrarDevolucion = async (req, res) => {
  try {
    await devolverPedido(Number(req.params.id), req.usuario.id);
    res.json({ message: 'Devolución registrada. El stock ya fue repuesto.' });
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
    await responderSolicitud({
      idSolicitud: Number(req.params.id),
      aprobar: decision === 'aprobar',
      respuesta,
      idRevisor: req.usuario.id
    });
    res.json({
      message: decision === 'aprobar'
        ? 'Devolución aprobada. El stock ya se repuso.'
        : 'Solicitud rechazada. El cliente verá tu respuesta.'
    });
  } catch (error) {
    responderError(res, error);
  }
};
