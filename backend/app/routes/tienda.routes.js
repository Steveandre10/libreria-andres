import express from 'express';
import {
  getMetodosPago, setMetodoPagoActivo,
  getTiposEnvio, crearTipoEnvio, actualizarTipoEnvio, setTipoEnvioActivo, eliminarTipoEnvio
} from '../models/tienda.model.js';
import { ErrorInventario } from '../models/inventario.model.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';

/**
 * @file tienda.routes.js
 * @description RF17 · Opciones básicas de la tienda (métodos de pago y tipos de envío).
 *   GET    /api/tienda/opciones              -> lo que el CLIENTE puede elegir en el carrito (solo activos)
 *   GET    /api/tienda/configuracion         -> todo, para el panel (módulo "configuracion")
 *   PUT    /api/tienda/metodos-pago/:id      -> { activo }
 *   POST   /api/tienda/envios                -> crea un tipo de envío
 *   PUT    /api/tienda/envios/:id            -> cambia sus datos, o solo { activo }
 *   DELETE /api/tienda/envios/:id
 */
const router = express.Router();

const responderError = (res, error) => {
  if (error instanceof ErrorInventario) return res.status(error.status).json({ error: error.message });
  res.status(500).json({ error: error.message });
};

/** Valida los datos de un tipo de envío que llegan del formulario del panel. */
const leerEnvio = (body) => {
  const nombre = String(body.nombre || '').trim().slice(0, 60);
  const costo = Number(body.costo);
  if (!nombre) throw new ErrorInventario('El tipo de envío necesita un nombre.', 400);
  if (!Number.isFinite(costo) || costo < 0) throw new ErrorInventario('El costo debe ser un número de 0 en adelante.', 400);
  return {
    nombre,
    descripcion: String(body.descripcion || '').trim().slice(0, 150),
    tiempo_estimado: String(body.tiempo_estimado || '').trim().slice(0, 40),
    costo: Math.round(costo * 100) / 100,
    activo: body.activo !== false
  };
};

// Cliente con sesión: opciones activas para el carrito
router.get('/opciones', verificarToken, async (req, res) => {
  try {
    const [metodos_pago, envios] = await Promise.all([
      getMetodosPago({ soloActivos: true }),
      getTiposEnvio({ soloActivos: true })
    ]);
    res.json({ metodos_pago, envios });
  } catch (error) {
    responderError(res, error);
  }
});

// Panel: todas las opciones (activas e inactivas)
router.get('/configuracion', verificarToken, requerirPermiso('configuracion', 'ver'), async (req, res) => {
  try {
    const [metodos_pago, envios] = await Promise.all([getMetodosPago(), getTiposEnvio()]);
    res.json({ metodos_pago, envios });
  } catch (error) {
    responderError(res, error);
  }
});

router.put('/metodos-pago/:id', verificarToken, requerirPermiso('configuracion', 'editar'), async (req, res) => {
  try {
    if (typeof req.body.activo !== 'boolean') return res.status(400).json({ error: 'Indica si el método queda activo o no.' });
    await setMetodoPagoActivo(Number(req.params.id), req.body.activo);
    res.json({ message: req.body.activo ? 'Método de pago activado.' : 'Método de pago desactivado.' });
  } catch (error) {
    responderError(res, error);
  }
});

router.post('/envios', verificarToken, requerirPermiso('configuracion', 'editar'), async (req, res) => {
  try {
    const id = await crearTipoEnvio(leerEnvio(req.body), req.usuario.id);
    res.status(201).json({ message: 'Tipo de envío creado.', id_tipo_envio: id });
  } catch (error) {
    responderError(res, error);
  }
});

router.put('/envios/:id', verificarToken, requerirPermiso('configuracion', 'editar'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    // Si solo llega { activo }, es el interruptor rápido de la tabla
    if (Object.keys(req.body).length === 1 && typeof req.body.activo === 'boolean') {
      await setTipoEnvioActivo(id, req.body.activo, req.usuario.id);
      return res.json({ message: req.body.activo ? 'Envío activado.' : 'Envío desactivado.' });
    }
    await actualizarTipoEnvio(id, leerEnvio(req.body), req.usuario.id);
    res.json({ message: 'Tipo de envío actualizado.' });
  } catch (error) {
    responderError(res, error);
  }
});

router.delete('/envios/:id', verificarToken, requerirPermiso('configuracion', 'editar'), async (req, res) => {
  try {
    await eliminarTipoEnvio(Number(req.params.id));
    res.json({ message: 'Tipo de envío eliminado.' });
  } catch (error) {
    responderError(res, error);
  }
});

export default router;
