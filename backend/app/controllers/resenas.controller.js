import {
  getResenasByLibro,
  getAllResenas,
  crearResena as crearResenaModel,
  eliminarResena as eliminarResenaModel
} from '../models/resenas.model.js';

/**
 * Controlador para listar las reseñas de un libro.
 * 
 * @async
 * @function listarResenas
 * @param {import('express').Request} req - Objeto de petición Express.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 */
export const listarResenas = async (req, res) => {
  try {
    const idLibro = req.params.idLibro || req.query.id_libro;
    const resenas = idLibro ? await getResenasByLibro(idLibro) : await getAllResenas();
    res.json({ resenas });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para crear una nueva reseña para un libro.
 * 
 * @async
 * @function crearResena
 * @param {import('express').Request} req - Objeto de petición Express.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 */
export const crearResena = async (req, res) => {
  try {
    const { reseña, calificacion, id_libro, id_usuario } = req.body;

    if (!id_libro || !reseña) {
      return res.status(400).json({ error: 'El libro y el texto de la reseña son obligatorios' });
    }

    const nuevaResena = await crearResenaModel({
      reseña,
      calificacion: calificacion || 5.0,
      id_usuario: id_usuario || null,
      id_libro
    });

    res.status(201).json({
      message: 'Reseña registrada con éxito',
      resena: nuevaResena
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para eliminar una reseña.
 * 
 * @async
 * @function eliminarResena
 * @param {import('express').Request} req - Objeto de petición Express.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 */
export const eliminarResena = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_libro } = req.query;
    await eliminarResenaModel(id, id_libro);
    res.json({ message: 'Reseña eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
