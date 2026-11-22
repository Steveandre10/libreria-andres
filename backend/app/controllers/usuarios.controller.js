import {
  getAllUsuarios,
  getUsuarioById,
  crearUsuario as crearUsuarioModel,
  eliminarUsuario as eliminarUsuarioModel,
  getUsuarioByEmail,
  updatePasswordModel,
  cambiarRolUsuario,
  actualizarUsuario as actualizarUsuarioModel,
  desactivarUsuario
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
    // RF16: datos básicos válidos antes de tocar la base de datos
    usuario.nombre = String(usuario.nombre).trim().slice(0, 100);
    usuario.email = String(usuario.email).trim().toLowerCase();
    if (!CORREO_VALIDO.test(usuario.email)) {
      return res.status(400).json({ error: 'El correo electrónico no es válido' });
    }
    if (String(usuario.password).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
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
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: mensajeDuplicado(error) });
    res.status(500).json({ error: error.message });
  }
};

/** RF16 · Formato básico de correo (algo@algo.algo). */
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** RF16 · Traduce el error de la regla UNIQUE de MySQL a un mensaje claro. */
const mensajeDuplicado = (error) => (/cedula/i.test(error.message)
  ? 'Ya existe una cuenta con esa cédula'
  : 'El correo electrónico ya está registrado');

/**
 * RF16 · Reglas comunes antes de editar o eliminar una cuenta.
 * Devuelve { error, status } si no se puede, o { destino } con la fila del usuario.
 */
const validarCuentaAjena = async (req, id, accion) => {
  const [destino] = await getUsuarioById(id);
  if (!destino) return { status: 404, error: 'Usuario no encontrado' };
  if (destino.rol === 'admin' && req.usuario.rol !== 'admin') {
    return { status: 403, error: `Solo un administrador puede ${accion} la cuenta de un administrador` };
  }
  return { destino };
};

/**
 * PUT /api/usuarios/:id · RF16: el personal con permiso edita los datos de una cuenta.
 * Campos opcionales: nombre, email, cedula, direccion, password (nueva), rol, activo.
 * - No se repite el correo de otra cuenta.
 * - Nadie se cambia su propio rol ni se desactiva a sí mismo (evita quedarse sin acceso).
 * - Solo un administrador puede editar administradores o dar el rol de administrador.
 */
export const actualizarUsuario = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { destino, error, status } = await validarCuentaAjena(req, id, 'editar');
    if (error) return res.status(status).json({ error });

    const b = req.body || {};
    const cambios = {};
    const esYo = id === req.usuario.id;

    if (b.nombre !== undefined) {
      cambios.nombre = String(b.nombre).trim().slice(0, 100);
      if (!cambios.nombre) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
    }
    if (b.email !== undefined) {
      cambios.email = String(b.email).trim().toLowerCase();
      if (!CORREO_VALIDO.test(cambios.email)) return res.status(400).json({ error: 'El correo electrónico no es válido' });
      const [otro] = await getUsuarioByEmail(cambios.email);
      if (otro && otro.id !== id) return res.status(409).json({ error: 'El correo electrónico ya está registrado en otra cuenta' });
    }
    if (b.cedula !== undefined) cambios.cedula = String(b.cedula || '').trim().slice(0, 100) || null;
    if (b.direccion !== undefined) cambios.direccion = String(b.direccion || '').trim().slice(0, 100) || null;
    if (b.password) {
      if (String(b.password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      cambios.password = await bcrypt.hash(String(b.password), await bcrypt.genSalt(10));
    }
    if (b.rol !== undefined && b.rol !== destino.rol) {
      if (esYo) return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
      if (!(await getRolPorClave(b.rol))) return res.status(400).json({ error: 'Ese rol no existe' });
      if (b.rol === 'admin' && req.usuario.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo un administrador puede dar el rol de administrador' });
      }
      cambios.rol = b.rol;
    }
    if (b.activo !== undefined) {
      if (esYo && !b.activo) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
      cambios.activo = Boolean(b.activo);
    }

    await actualizarUsuarioModel(id, cambios);
    const [actualizado] = await getUsuarioById(id);
    const { password, ...seguro } = actualizado;
    res.json({ message: 'Cuenta actualizada', usuario: seguro });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: mensajeDuplicado(error) });
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
    const id = Number(req.params.id);
    // RF16: nadie borra su propia cuenta desde el panel (se quedaría sin acceso a mitad de la sesión)
    if (id === req.usuario.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    const { error, status } = await validarCuentaAjena(req, id, 'eliminar');
    if (error) return res.status(status).json({ error });

    try {
      await eliminarUsuarioModel(id);
      return res.json({ message: 'Usuario eliminado correctamente', eliminado: true });
    } catch (errorBorrado) {
      // RF16: si tiene pedidos, facturas u otro historial, la base no deja borrarlo (llaves foráneas).
      // En ese caso se DESACTIVA: no puede iniciar sesión, pero su historial contable se conserva.
      if (errorBorrado.code === 'ER_ROW_IS_REFERENCED_2' || errorBorrado.code === 'ER_ROW_IS_REFERENCED') {
        await desactivarUsuario(id);
        return res.json({
          message: 'La cuenta tiene pedidos o facturas, así que se desactivó para conservar el historial',
          desactivado: true
        });
      }
      throw errorBorrado;
    }
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
    // RF16: una cuenta desactivada por el administrador no puede entrar
    if (usuario.activo === 0) {
      return res.status(403).json({ error: 'Esta cuenta está desactivada. Comunícate con la librería.' });
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