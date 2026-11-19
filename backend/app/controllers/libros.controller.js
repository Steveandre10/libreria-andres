import {
  getAllLibros,
  getLibroById,
  crearLibro as crearLibroModel,
  actualizarLibro as actualizarLibroModel,
  eliminarLibro as eliminarLibroModel
} from '../models/libros.model.js';
import { getResenasByLibro } from '../models/resenas.model.js';

/**
 * Controlador para listar libros con filtros opcionales.
 * 
 * @async
 * @function listarLibros
 * @param {import('express').Request} req - Objeto de petición Express.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 */
export const listarLibros = async (req, res) => {
  try {
    const { search, genero, disponibilidad } = req.query;
    const libros = await getAllLibros({ search, genero, disponibilidad });
    res.json({ libros });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para obtener el detalle de un libro y sus reseñas.
 * 
 * @async
 * @function obtenerLibro
 * @param {import('express').Request} req - Objeto de petición Express con req.params.id.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 */
export const obtenerLibro = async (req, res) => {
  try {
    const { id } = req.params;
    const libro = await getLibroById(id);
    if (!libro) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }

    // Traer reseñas asociadas
    const resenas = await getResenasByLibro(id);
    res.json({ libro, resenas });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para crear un libro nuevo (Rol Administrador / Dueño de Tienda).
 * 
 * @async
 * @function crearLibro
 * @param {import('express').Request} req - Objeto de petición Express con datos en body.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 */
export const crearLibro = async (req, res) => {
  try {
    const { titulo, ISBN, genero, autor, precio, portada, descripcion, disponibilidad, id_libreria } = req.body;
    
    if (!titulo || !autor) {
      return res.status(400).json({ error: 'Título y autor son campos obligatorios.' });
    }

    const nuevoLibro = await crearLibroModel({
      titulo,
      ISBN,
      genero: genero || 'General',
      autor,
      precio: precio ? parseFloat(precio) : 19.99,
      portada,
      descripcion,
      disponibilidad: disponibilidad || 'Disponible',
      id_libreria: id_libreria ? parseInt(id_libreria) : null
    });

    res.status(201).json({
      message: 'Libro creado exitosamente',
      libro: nuevoLibro
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para actualizar un libro.
 * 
 * @async
 * @function actualizarLibro
 * @param {import('express').Request} req - Objeto de petición Express.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 */
export const actualizarLibro = async (req, res) => {
  try {
    const { id } = req.params;
    const libroExistente = await getLibroById(id);
    if (!libroExistente) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }

    await actualizarLibroModel(id, req.body);
    const libroActualizado = await getLibroById(id);

    res.json({
      message: 'Libro actualizado correctamente',
      libro: libroActualizado
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para eliminar un libro.
 * 
 * @async
 * @function eliminarLibro
 * @param {import('express').Request} req - Objeto de petición Express.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 */
export const eliminarLibro = async (req, res) => {
  try {
    const { id } = req.params;
    const libroExistente = await getLibroById(id);
    if (!libroExistente) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }

    await eliminarLibroModel(id);
    res.json({ message: 'Libro eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
