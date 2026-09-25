import { getAllUsuarios, getUsuarioById, crearUsuario as crearUsuarioModel, eliminarUsuario as eliminarUsuarioModel, getUsuarioByEmail } from '../models/usuarios.model.js';
import jwt from 'jsonwebtoken';
import config from '../config/environments/index.js';

/**
 * Controlador para listar todos los usuarios.
 * Responde con un JSON que contiene un array de usuarios.
 * 
 * @async
 * @function listarUsuarios
 * @param {import('express').Request} req - Objeto de petición HTTP Express.
 * @param {import('express').Response} res - Objeto de respuesta HTTP Express.
 * @returns {Promise<void>}
 */
export const listarUsuarios = async (req, res) => {
  try {
    const usuarios = await getAllUsuarios();
    res.json({ usuarios });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para obtener un usuario específico por su ID.
 * Si no lo encuentra, responde con estado 404.
 * 
 * @async
 * @function obtenerUsuario
 * @param {import('express').Request} req - Objeto de petición HTTP Express con el ID en req.params.
 * @param {import('express').Response} res - Objeto de respuesta HTTP Express.
 * @returns {Promise<void>}
 */
export const obtenerUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await getUsuarioById(id);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({ usuario: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para crear/registrar un nuevo usuario.
 * Valida que los datos requeridos (nombre, email, password) estén presentes.
 * Retorna el usuario creado con su ID generado con código de estado 201.
 * 
 * @async
 * @function crearUsuario
 * @param {import('express').Request} req - Objeto de petición HTTP Express con los datos en req.body.
 * @param {import('express').Response} res - Objeto de respuesta HTTP Express.
 * @returns {Promise<void>}
 */
export const crearUsuario = async (req, res) => {
  try {
    const usuario = req.body;
    if (!usuario || !usuario.nombre || !usuario.email || !usuario.password) {
      return res.status(400).json({ error: 'Faltan datos: nombre, email y password son requeridos' });
    }
    const newUser = await crearUsuarioModel(usuario);
    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para eliminar un usuario por su ID.
 * Responde con un mensaje confirmando la eliminación.
 * 
 * @async
 * @function eliminarUsuario
 * @param {import('express').Request} req - Objeto de petición HTTP Express con el ID en req.params.
 * @param {import('express').Response} res - Objeto de respuesta HTTP Express.
 * @returns {Promise<void>}
 */
export const eliminarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    await eliminarUsuarioModel(id);
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para iniciar sesión de un usuario (Login).
 * Valida que el email y la contraseña coincidan con los de la BD.
 * Genera y firma un token JWT válido por 24 horas y retorna los datos del usuario.
 * 
 * @async
 * @function loginUsuario
 * @param {import('express').Request} req - Objeto de petición HTTP Express con email y password en req.body.
 * @param {import('express').Response} res - Objeto de respuesta HTTP Express.
 * @returns {Promise<void>}
 */
export const loginUsuario = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }
    const rows = await getUsuarioByEmail(email);
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas (usuario no encontrado)' });
    }
    const usuario = rows[0];
    // Comparación directa de contraseñas (para este entorno)
    if (usuario.password !== password) {
      return res.status(401).json({ error: 'Credenciales inválidas (contraseña incorrecta)' });
    }
    
    // Generar token JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, nombre: usuario.nombre },
      config.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        telefono: usuario.telefono || null,
        direccion: usuario.direccion || null,
        fecha_registro: usuario.fecha_registro || null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};