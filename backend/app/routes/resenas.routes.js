import express from 'express';
import {
  listarResenas,
  crearResena,
  eliminarResena
} from '../controllers/resenas.controller.js';
import { verificarToken, requerirAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

// GET /api/resenas            -> todas las reseñas (vista del dueño)
// GET /api/resenas?id_libro=1 -> reseñas de un libro
router.get('/', listarResenas);
router.post('/', crearResena);

// Eliminar reseñas es una tarea de moderación: solo Administrador / Dueño
router.delete('/:id', verificarToken, requerirAdmin, eliminarResena);

export default router;
