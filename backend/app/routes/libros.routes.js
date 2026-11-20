import express from 'express';
import {
  listarLibros,
  obtenerLibro,
  crearLibro,
  actualizarLibro,
  eliminarLibro
} from '../controllers/libros.controller.js';
import {
  listarResenas,
  crearResena
} from '../controllers/resenas.controller.js';

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
router.get('/:idLibro/resenas', listarResenas);
router.post('/:idLibro/resenas', (req, res, next) => {
  req.body.id_libro = req.params.idLibro;
  crearResena(req, res, next);
});

export default router;
