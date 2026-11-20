import {
  getRoles, getRolPorClave, getPermisosDeRol, crearRol as crearRolModel,
  actualizarDatosRol, guardarPermisos, eliminarRol as eliminarRolModel
} from '../models/roles.model.js';
import { getUsuarioById } from '../models/usuarios.model.js';

/** Genera la clave a partir del nombre: "Atención al Cliente" -> "atencion_al_cliente" */
const generarClave = (nombre) => nombre
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quita tildes
  .toLowerCase().replace(/[^a-z0-9]+/g, '_')           // espacios y símbolos -> _
  .replace(/^_|_$/g, '').slice(0, 30);

/** GET /api/roles · Lista los roles con sus permisos. */
export const listarRoles = async (req, res) => {
  try {
    res.json({ roles: await getRoles() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** GET /api/roles/mis-permisos · Rol y permisos ACTUALES del usuario que inició sesión. */
export const misPermisos = async (req, res) => {
  try {
    const [usuario] = await getUsuarioById(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    // rol_nombre: el nombre legible del rol ("Encargado de inventario") para mostrarlo en pantalla
    const rol = await getRolPorClave(usuario.rol);
    res.json({ rol: usuario.rol, rol_nombre: rol?.nombre || usuario.rol, permisos: await getPermisosDeRol(usuario.rol) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** POST /api/roles · Crea un rol nuevo con sus permisos. Body: { nombre, descripcion, permisos } */
export const crearRol = async (req, res) => {
  try {
    const { nombre, descripcion, permisos = [] } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre del rol es obligatorio' });
    }
    const clave = generarClave(nombre);
    if (!clave) return res.status(400).json({ error: 'El nombre debe tener letras o números' });
    if (await getRolPorClave(clave)) {
      return res.status(409).json({ error: 'Ya existe un rol con ese nombre' });
    }
    await crearRolModel({ clave, nombre: nombre.trim(), descripcion });
    await guardarPermisos(clave, permisos);
    res.status(201).json({ message: 'Rol creado correctamente', clave });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** PUT /api/roles/:clave · Cambia nombre, descripción y permisos de un rol. */
export const actualizarRol = async (req, res) => {
  try {
    const { clave } = req.params;
    if (clave === 'admin') {
      return res.status(400).json({ error: 'El administrador siempre tiene acceso total' });
    }
    if (clave === 'usuario') {
      return res.status(400).json({ error: 'Los clientes no tienen acceso a la administración' });
    }
    const rol = await getRolPorClave(clave);
    if (!rol) return res.status(404).json({ error: 'El rol no existe' });

    const { nombre, descripcion, permisos = [] } = req.body;
    if (nombre && nombre.trim()) {
      // Si no mandan descripción, se conserva la que ya tenía
      const nuevaDescripcion = descripcion !== undefined ? descripcion : rol.descripcion;
      await actualizarDatosRol(clave, { nombre: nombre.trim(), descripcion: nuevaDescripcion });
    }
    await guardarPermisos(clave, permisos);
    res.json({ message: 'Permisos actualizados' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** DELETE /api/roles/:clave · Elimina un rol personalizado sin usuarios asignados. */
export const eliminarRol = async (req, res) => {
  try {
    const rol = await getRolPorClave(req.params.clave);
    if (!rol) return res.status(404).json({ error: 'El rol no existe' });
    if (rol.es_base) return res.status(400).json({ error: 'Los roles base no se pueden eliminar' });
    await eliminarRolModel(rol.clave);
    res.json({ message: 'Rol eliminado' });
  } catch (error) {
    // La llave foránea de usuarios.rol impide borrar un rol que todavía está en uso
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'Hay usuarios con este rol. Cámbialos de rol antes de eliminarlo.' });
    }
    res.status(500).json({ error: error.message });
  }
};