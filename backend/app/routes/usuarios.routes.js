import express from 'express';

import {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  eliminarUsuario,
  loginUsuario,
  actualizarRolUsuario,
  actualizarUsuario
} from '../controllers/usuarios.controller.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';

/**
 * Enrutador Express para gestionar los endpoints relacionados con la entidad Usuarios.
 * @type {import('express').Router}
 */
const router = express.Router();

/**
 * GET /api/usuarios/
 * Lista todos los usuarios (Solo para Administradores / Dueños).
 */
router.get('/', verificarToken, requerirPermiso('usuarios', 'ver'), listarUsuarios);

/**
 * GET /api/usuarios/:id
 * Obtiene la información de un usuario específico por su ID.
 * RF16: ya no es pública. Cada quien ve su propia cuenta (Mi perfil); ver la de otro exige permiso de "usuarios".
 */
const propiaOPermiso = (req, res, next) => (Number(req.params.id) === req.usuario.id
  ? next()
  : requerirPermiso('usuarios', 'ver')(req, res, next));
router.get('/:id', verificarToken, propiaOPermiso, obtenerUsuario);

/**
 * POST /api/usuarios/
 * Registra un usuario (cliente o creado por admin).
 */
router.post('/', crearUsuario);

/**
 * POST /api/usuarios/login
 * Permite el inicio de sesión y retorna un token JWT de autenticación con el rol.
 */
router.post('/login', loginUsuario);

/**
 * PUT /api/usuarios/:id/rol
 * Cambia el rol de un usuario ('usuario' o 'admin'). Solo para Administradores.
 */
router.put('/:id/rol', verificarToken, requerirPermiso('usuarios', 'editar'), actualizarRolUsuario);

/**
 * PUT /api/usuarios/:id
 * RF16: edita los datos de una cuenta (nombre, correo, cédula, dirección, contraseña, rol y si está activa).
 */
router.put('/:id', verificarToken, requerirPermiso('usuarios', 'editar'), actualizarUsuario);

/**
 * DELETE /api/usuarios/:id
 * RF16: elimina la cuenta; si tiene pedidos o facturas, la desactiva para conservar el historial.
 */
router.delete('/:id', verificarToken, requerirPermiso('usuarios', 'editar'), eliminarUsuario);

export default router;