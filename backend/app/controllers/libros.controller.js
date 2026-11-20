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
/**
 * RF13 · Valida la cantidad de stock: entero de 0 en adelante.
 * @returns {number|null} La cantidad como número, o null si no es válida.
 */
const leerStock = (valor) => {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** RF13 · Registra un libro nuevo con su cantidad inicial en stock. */
export const crearLibro = async (req, res) => {
  try {
    const { titulo, ISBN, genero, autor, precio, portada, descripcion, stock } = req.body;

    if (!titulo || !autor) {
      return res.status(400).json({ error: 'Título y autor son campos obligatorios.' });
    }
    const cantidad = leerStock(stock ?? 0);
    if (cantidad === null) {
      return res.status(400).json({ error: 'La cantidad en stock debe ser un número entero de 0 en adelante.' });
    }

    const nuevoLibro = await crearLibroModel({
      titulo,
      ISBN: ISBN || null,          // vacío = sin ISBN (NULL no choca con la regla UNIQUE)
      genero: genero || 'General',
      autor,
      precio: precio ? parseFloat(precio) : 19.99,
      portada,
      descripcion,
      stock: cantidad
    });

    res.status(201).json({ message: 'Libro creado exitosamente', libro: nuevoLibro });
  } catch (error) {
    // RF13: la regla UNIQUE de la BD avisa si el ISBN ya existe
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un libro con ese ISBN.' });
    }
    res.status(500).json({ error: error.message });
  }
};

/** RF13 · Actualiza la información de un libro y/o su cantidad en stock. */
export const actualizarLibro = async (req, res) => {
  try {
    const { id } = req.params;
    const libroExistente = await getLibroById(id);
    if (!libroExistente) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }

    const datos = { ...req.body };
    if (datos.stock !== undefined) {
      datos.stock = leerStock(datos.stock);
      if (datos.stock === null) {
        return res.status(400).json({ error: 'La cantidad en stock debe ser un número entero de 0 en adelante.' });
      }
    }

    await actualizarLibroModel(id, datos);
    const libroActualizado = await getLibroById(id);
    res.json({ message: 'Libro actualizado correctamente', libro: libroActualizado });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe otro libro con ese ISBN.' });
    }
    res.status(500).json({ error: error.message });
  }
};

/** Elimina un libro (junto con su inventario y sus reseñas). */
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
    // Si el libro ya aparece en facturas o pedidos, la BD no deja borrarlo (es historial de ventas)
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'Este libro tiene ventas o pedidos registrados. En vez de eliminarlo, deja su stock en 0.' });
    }
    res.status(500).json({ error: error.message });
  }
};