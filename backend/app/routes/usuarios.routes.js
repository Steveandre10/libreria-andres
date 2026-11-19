import express from 'express';

import {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  eliminarUsuario,
  loginUsuario,
  actualizarRolUsuario
} from '../controllers/usuarios.controller.js';
import { verificarToken, requerirAdmin } from '../middlewares/auth.middleware.js';

/**
 * Enrutador Express para gestionar los endpoints relacionados con la entidad Usuarios.
 * @type {import('express').Router}
 */
const router = express.Router();

/**
 * GET /api/usuarios/
 * Lista todos los usuarios (Solo para Administradores / Dueños).
 */
router.get('/', verificarToken, requerirAdmin, listarUsuarios);

/**
 * GET /api/usuarios/:id
 * Obtiene la información de un usuario específico por su ID.
 */
router.get('/:id', obtenerUsuario);

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
router.put('/:id/rol', verificarToken, requerirAdmin, actualizarRolUsuario);

/**
 * DELETE /api/usuarios/:id
 * Elimina un usuario del sistema por su ID (Solo Administradores).
 */
router.delete('/:id', verificarToken, requerirAdmin, eliminarUsuario);

export default router;