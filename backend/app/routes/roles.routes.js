import express from 'express';
import { listarRoles, misPermisos, crearRol, actualizarRol, eliminarRol } from '../controllers/roles.controller.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Cualquier usuario con sesión puede consultar SUS permisos (el frontend lo necesita)
router.get('/mis-permisos', verificarToken, misPermisos);

// La lista de roles la usan los módulos Usuarios y Roles
router.get('/', verificarToken, listarRoles);

// RF18: solo quien puede editar el módulo Roles crea, cambia o borra roles
router.post('/', verificarToken, requerirPermiso('roles', 'editar'), crearRol);
router.put('/:clave', verificarToken, requerirPermiso('roles', 'editar'), actualizarRol);
router.delete('/:clave', verificarToken, requerirPermiso('roles', 'editar'), eliminarRol);

export default router;