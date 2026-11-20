import {
  getAllUsuarios,
  getUsuarioById,
  crearUsuario as crearUsuarioModel,
  eliminarUsuario as eliminarUsuarioModel,
  getUsuarioByEmail,
  updatePasswordModel,
  cambiarRolUsuario
} from '../models/usuarios.model.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import config from '../config/environments/index.js';
import { getRolPorClave, getPermisosDeRol } from '../models/roles.model.js';

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
    // Excluir hash de contraseñas por seguridad
    const safeUsuarios = usuarios.map(u => {
      const { password, ...resto } = u;
      return resto;
    });
    res.json({ usuarios: safeUsuarios });
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
    const { password, ...usuarioSeguro } = rows[0];
    res.json({ usuario: usuarioSeguro });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para crear/registrar un nuevo usuario con contraseña cifrada (Bcrypt).
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

    // Comprobar si el correo ya existe
    const existente = await getUsuarioByEmail(usuario.email);
    if (existente && existente.length > 0) {
      return res.status(409).json({ error: 'El correo electrónico ya está registrado' });
    }

    // Hashear la contraseña con bcrypt (10 rounds de salt)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(usuario.password, salt);

    // RF18: el registro público siempre crea clientes. Crear cuentas internas
    // exige sesión con permiso de editar usuarios; crear admins exige ser admin.
    let rol = 'usuario';
    if (usuario.rol && usuario.rol !== 'usuario') {
      const token = (req.headers['authorization'] || '').split(' ')[1];
      let solicitante = null;
      try {
        solicitante = token ? jwt.verify(token, config.JWT_SECRET) : null;
      } catch {
        solicitante = null;
      }
      if (!solicitante) {
        return res.status(403).json({ error: 'Solo el personal autorizado puede crear cuentas internas' });
      }
      if (!(await getRolPorClave(usuario.rol))) {
        return res.status(400).json({ error: 'Ese rol no existe' });
      }
      const [filaSolicitante] = await getUsuarioById(solicitante.id);
      const rolSolicitante = filaSolicitante?.rol;
      const permisos = await getPermisosDeRol(rolSolicitante);
      if (!permisos.some(p => p.modulo === 'usuarios' && p.editar)) {
        return res.status(403).json({ error: 'No tienes permiso para crear cuentas internas' });
      }
      if (usuario.rol === 'admin' && rolSolicitante !== 'admin') {
        return res.status(403).json({ error: 'Solo un administrador puede crear administradores' });
      }
      rol = usuario.rol;
    }

    const newUser = await crearUsuarioModel({
      ...usuario,
      password: hashedPassword,
      rol
    });

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
 * Controlador para actualizar el rol de un usuario ('usuario' o 'admin').
 * Requiere permisos de administrador.
 * 
 * @async
 * @function actualizarRolUsuario
 * @param {import('express').Request} req - Objeto de petición Express.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 */
export const actualizarRolUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { rol } = req.body;

    // RF18: nadie cambia su propio rol (evita que un admin se quite el acceso por error)
    if (Number(id) === req.usuario.id) {
      return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
    }
    // RF18: el rol debe existir en la tabla roles
    if (!(await getRolPorClave(rol))) {
      return res.status(400).json({ error: 'Ese rol no existe' });
    }
    // RF18: solo un administrador puede dar o quitar el rol de administrador
    const [destino] = await getUsuarioById(id);
    if ((rol === 'admin' || destino?.rol === 'admin') && req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo un administrador puede dar o quitar el rol de administrador' });
    }

    await cambiarRolUsuario(id, rol);
    res.json({ message: `Rol actualizado correctamente a "${rol}"` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para iniciar sesión de un usuario (Login).
 * Valida la contraseña mediante bcrypt.compare() con auto-migración de texto plano a bcrypt.
 * Genera y firma un token JWT válido por 24 horas y retorna los datos y rol del usuario.
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

    // Verificación segura con Bcrypt
    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, usuario.password);
    } catch {
      isMatch = false;
    }

    // Compatibilidad retroactiva: si estaba en texto plano, permitir login y actualizar a bcrypt
    if (!isMatch && usuario.password === password) {
      isMatch = true;
      try {
        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(password, salt);
        await updatePasswordModel(usuario.id, newHash);
        console.log(`✓ Contraseña del usuario ${usuario.email} migrada automáticamente a bcrypt.`);
      } catch (errMigracion) {
        console.error('Error migrando contraseña antigua a bcrypt:', errMigracion);
      }
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas (contraseña incorrecta)' });
    }
    
    // Generar token JWT con rol incluido
    const token = jwt.sign(
      {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol || 'usuario'
      },
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
        rol: usuario.rol || 'usuario',
        telefono: usuario.telefono || null,
        direccion: usuario.direccion || null,
        fecha_registro: usuario.fecha_registro || null,
        permisos: await getPermisosDeRol(usuario.rol || 'usuario'),
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};