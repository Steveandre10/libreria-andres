import express from 'express';
import { listarResenas, moderarResena, eliminarResena } from '../controllers/resenas.controller.js';
import { verificarToken, requerirPermiso } from '../middlewares/auth.middleware.js';

/**
 * @file resenas.routes.js
 * @description RF21 · Moderación de reseñas (módulo "resenas" de RF18).
 *   GET    /api/resenas?estado=Pendiente|Aprobada|Rechazada -> lista para moderar (resenas:ver)
 *   PUT    /api/resenas/:id/moderar {decision, motivo}      -> aprobar / rechazar (resenas:editar)
 *   DELETE /api/resenas/:id                                 -> eliminar (resenas:editar)
 * Crear y leer las reseñas de UN libro va en /api/libros/:idLibro/resenas (RF29).
 */
const router = express.Router();

router.get('/', verificarToken, requerirPermiso('resenas', 'ver'), listarResenas);
router.put('/:id/moderar', verificarToken, requerirPermiso('resenas', 'editar'), moderarResena);
router.delete('/:id', verificarToken, requerirPermiso('resenas', 'editar'), eliminarResena);

export default router;
