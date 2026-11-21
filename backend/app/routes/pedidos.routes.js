import express from 'express';
import {
  registrarPedido, cotizarCarrito, misPedidos, listarPedidos, registrarDevolucion,
  solicitarDevolucion, listarSolicitudes, responderDevolucion, actualizarEstadoPedido
} from '../controllers/pedidos.controller.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';

const router = express.Router();

// RF14 · Cualquier usuario con sesión puede comprar, ver SUS pedidos y pedir una devolución
router.post('/cotizar', verificarToken, cotizarCarrito);   // RF23: totales y stock del carrito, sin comprar
router.post('/', verificarToken, registrarPedido);
router.get('/mios', verificarToken, misPedidos);
router.post('/:id/solicitud-devolucion', verificarToken, solicitarDevolucion);

// RF14 · El personal de inventario consulta ventas y solicitudes, y las responde
router.get('/', verificarToken, requerirPermiso('inventario', 'ver'), listarPedidos);
router.get('/solicitudes', verificarToken, requerirPermiso('inventario', 'ver'), listarSolicitudes);
router.post('/solicitudes/:id/responder', verificarToken, requerirPermiso('inventario', 'editar'), responderDevolucion);
router.put('/:id/estado', verificarToken, requerirPermiso('inventario', 'editar'), actualizarEstadoPedido);   // RF27
router.post('/:id/devolucion', verificarToken, requerirPermiso('inventario', 'editar'), registrarDevolucion);

export default router;
