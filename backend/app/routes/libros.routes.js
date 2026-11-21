import express from 'express';
import {
  listarLibros,
  obtenerLibro,
  crearLibro,
  actualizarLibro,
  eliminarLibro
} from '../controllers/libros.controller.js';
import { listarResenasLibro, crearResena, miResena } from '../controllers/resenas.controller.js';

import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Endpoints principales de Libros (Públicos para lectura)
router.get('/', listarLibros);
router.get('/:id', obtenerLibro);

// Endpoints protegidos para Administrador / Dueño
router.post('/', verificarToken, requerirPermiso('libros', 'editar'), crearLibro);
router.put('/:id', verificarToken, requerirPermiso('libros', 'editar'), actualizarLibro);
router.delete('/:id', verificarToken, requerirPermiso('libros', 'editar'), eliminarLibro);

// Reseñas anidadas por libro
// Reseñas de un libro: se leen las aprobadas (público) y solo quien lo compró puede escribir (RF29 + RF21)
router.get('/:idLibro/resenas', listarResenasLibro);
router.get('/:idLibro/resenas/mia', verificarToken, miResena);
router.post('/:idLibro/resenas', verificarToken, crearResena);

export default router;
