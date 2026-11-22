import express from 'express';
import {
  MOTIVOS_CASO, ESTADOS_CASO, ErrorCaso, crearCaso, getCaso, agregarMensaje,
  cambiarEstado, buscarCasos, getCasosDeCliente
} from '../models/casos.model.js';
import { getPermisosDeRol } from '../models/roles.model.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';
import { enviarCorreo } from '../services/correo.js';
import pool from '../config/db.js';

/**
 * @file casos.routes.js
 * @description RF28 + RF30 · Atención al cliente.
 *  Cliente:
 *   GET  /api/casos/motivos              -> lista de motivos para el formulario
 *   GET  /api/casos/mios?pedido=17       -> mis casos (con historial), opcional de un pedido
 *   POST /api/casos {id_pedido?, motivo, mensaje} -> "Contactar" (crea el caso)
 *  Cliente dueño o soporte:
 *   GET  /api/casos/:id                  -> un caso con su historial
 *   POST /api/casos/:id/mensajes {mensaje} -> responder
 *  Soporte (módulo "soporte"):
 *   GET  /api/casos?estado=&cliente=     -> todos los casos, filtrados (soporte:ver)
 *   PUT  /api/casos/:id/estado {estado}  -> Abierto / En proceso / Cerrado (soporte:editar)
 */
const router = express.Router();

const responderError = (res, error) => {
  if (error instanceof ErrorCaso) return res.status(error.status).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: error.message });
};

/** ¿El usuario es personal con permiso en el módulo soporte? (lee el rol actual de la BD) */
const permisoSoporte = async (idUsuario, accion = 'ver') => {
  const [[u]] = await pool.query('SELECT rol FROM usuarios WHERE id = ?', [idUsuario]);
  if (!u) return false;
  if (u.rol === 'admin') return true;
  const p = (await getPermisosDeRol(u.rol)).find(x => x.modulo === 'soporte');
  return !!(p && p[accion]);
};

/** Valida el texto de un mensaje. */
const leerMensaje = (body) => {
  const mensaje = String(body?.mensaje || '').trim();
  if (mensaje.length < 3) throw new ErrorCaso('Escribe tu mensaje (mínimo 3 caracteres)');
  if (mensaje.length > 1000) throw new ErrorCaso('El mensaje puede tener máximo 1000 caracteres');
  return mensaje;
};

router.get('/motivos', (req, res) => res.json({ motivos: MOTIVOS_CASO, estados: ESTADOS_CASO }));

router.get('/mios', verificarToken, async (req, res) => {
  try {
    const idPedido = req.query.pedido ? Number(req.query.pedido) : null;
    res.json({ casos: await getCasosDeCliente(req.usuario.id, idPedido) });
  } catch (error) {
    responderError(res, error);
  }
});

router.post('/', verificarToken, async (req, res) => {
  try {
    const motivo = String(req.body?.motivo || '');
    if (!MOTIVOS_CASO.includes(motivo)) throw new ErrorCaso('Elige un motivo de la lista');
    const mensaje = leerMensaje(req.body);
    const idPedido = req.body?.id_pedido ? Number(req.body.id_pedido) : null;
    const r = await crearCaso({ idUsuario: req.usuario.id, idPedido, motivo, mensaje });
    res.status(201).json({
      ...r,
      message: r.nuevo
        ? `Recibimos tu mensaje. Tu caso es el N.º ${String(r.idCaso).padStart(4, '0')}; te responderemos aquí mismo.`
        : 'Tu mensaje se agregó a la conversación que ya tenías abierta sobre este pedido.'
    });
  } catch (error) {
    responderError(res, error);
  }
});

router.get('/', verificarToken, requerirPermiso('soporte', 'ver'), async (req, res) => {
  try {
    const estado = ESTADOS_CASO.includes(req.query.estado) ? req.query.estado : '';
    const cliente = String(req.query.cliente || '').trim().slice(0, 80);
    res.json(await buscarCasos({ estado, cliente }));
  } catch (error) {
    responderError(res, error);
  }
});

router.get('/:id', verificarToken, async (req, res) => {
  try {
    const caso = await getCaso(Number(req.params.id));
    if (!caso) throw new ErrorCaso('El caso no existe', 404);
    if (caso.id_usuario !== req.usuario.id && !(await permisoSoporte(req.usuario.id, 'ver'))) {
      throw new ErrorCaso('No tienes acceso a este caso', 403);
    }
    res.json({ caso });
  } catch (error) {
    responderError(res, error);
  }
});

router.post('/:id/mensajes', verificarToken, async (req, res) => {
  try {
    const idCaso = Number(req.params.id);
    const caso = await getCaso(idCaso);
    if (!caso) throw new ErrorCaso('El caso no existe', 404);
    const esDueno = caso.id_usuario === req.usuario.id;
    const esSoporte = !esDueno && (await permisoSoporte(req.usuario.id, 'editar'));
    if (!esDueno && !esSoporte) throw new ErrorCaso('No puedes escribir en este caso', 403);
    const mensaje = leerMensaje(req.body);
    await agregarMensaje({ idCaso, idUsuario: req.usuario.id, esPersonal: esSoporte, mensaje });

    // RF28: cuando responde soporte, también le llega un correo al cliente (en segundo plano)
    if (esSoporte) {
      enviarCorreo({
        para: caso.cliente_email,
        asunto: `Respuesta a tu caso N.º ${String(idCaso).padStart(4, '0')} · Librería Adrián`,
        texto: `Hola ${caso.cliente}, te respondimos:\n\n${mensaje}\n\nPuedes contestar desde "Mis compras".`,
        html: `<p>Hola ${caso.cliente},</p><p>Te respondimos sobre tu caso${caso.id_pedido ? ` del pedido N.º ${String(caso.id_pedido).padStart(4, '0')}` : ''}:</p>
               <blockquote style="border-left:3px solid #1c2b4a;padding-left:10px">${mensaje.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</blockquote>
               <p>Puedes contestar desde «Mis compras».</p>`
      }).catch(e => console.error('RF28 · No se pudo enviar el correo de respuesta:', e.message));
    }
    res.status(201).json({ caso: await getCaso(idCaso), message: 'Mensaje enviado' });
  } catch (error) {
    responderError(res, error);
  }
});

router.put('/:id/estado', verificarToken, requerirPermiso('soporte', 'editar'), async (req, res) => {
  try {
    const estado = req.body?.estado;
    if (!ESTADOS_CASO.includes(estado)) throw new ErrorCaso('Estado inválido');
    await cambiarEstado({ idCaso: Number(req.params.id), estado, idUsuario: req.usuario.id });
    res.json({ caso: await getCaso(Number(req.params.id)), message: `Caso marcado como "${estado}"` });
  } catch (error) {
    responderError(res, error);
  }
});

export default router;
