import express from 'express';

import {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  eliminarUsuario,
  loginUsuario
} from '../controllers/usuarios.controller.js';

/**
 * Enrutador Express para gestionar los endpoints relacionados con la entidad Usuarios.
 * @type {import('express').Router}
 */
const router = express.Router();

/**
 * GET /api/usuarios/
 * Lista todos los usuarios.
 */
router.get('/', listarUsuarios);

/**
 * GET /api/usuarios/:id
 * Obtiene la información de un usuario específico por su ID.
 */
router.get('/:id', obtenerUsuario);

/**
 * POST /api/usuarios/
 * Registra o crea un nuevo usuario.
 */
router.post('/', crearUsuario);

/**
 * POST /api/usuarios/login
 * Permite el inicio de sesión y retorna un token JWT de autenticación.
 */
router.post('/login', loginUsuario);

/**
 * DELETE /api/usuarios/:id
 * Elimina un usuario del sistema por su ID.
 */
router.delete('/:id', eliminarUsuario);

export default router;