import pool from '../config/db.js';

/**
 * @file services/logs.js
 * @description RF15 · Registro de actividad (auditoría).
 *
 * Cómo funciona: `registrarActividad` es un middleware que va ANTES de todas las rutas /api.
 * Cuando termina una petición que cambia algo (POST, PUT, PATCH, DELETE), mira:
 *   - quién la hizo (req.usuario, que deja verificarToken; en el login, el usuario de la respuesta),
 *   - qué ruta fue -> la traduce a una acción legible con la tabla REGLAS,
 *   - si salió bien (código < 400) o mal (Fallido: por ejemplo contraseña incorrecta o acceso denegado),
 * y guarda una fila en `logs_actividad` con usuario, acción, módulo, descripción, IP, fecha y hora.
 * Así cualquier ruta nueva queda auditada sin tocar su controlador.
 */

/** Rutas que no vale la pena registrar (ruido): marcar avisos como leídos, historial de vistas… */
const IGNORAR = [/^\/api\/inventario\/notificaciones\/leer/, /^\/api\/recomendaciones\/vista/];

const num = (n) => `N.º ${String(n).padStart(4, '0')}`;

/**
 * Traducción de [método, ruta] -> { accion, modulo, texto }.
 * `m` son los grupos de la expresión, `b` el cuerpo de la petición y `r` el de la respuesta.
 */
const REGLAS = [
  ['POST', /^\/api\/usuarios\/login$/, 'Inicio de sesión', 'usuarios', (m, b) => `Inicio de sesión de ${b.email || '¿?'}`],
  ['POST', /^\/api\/usuarios$/, 'Crear', 'usuarios', (m, b) => `Registro de la cuenta ${b.email || ''}`],
  ['PUT', /^\/api\/usuarios\/(\d+)\/rol$/, 'Editar', 'usuarios', (m, b) => `Cambio de rol del usuario ${num(m[1])} a "${b.rol}"`],
  ['PUT', /^\/api\/usuarios\/(\d+)$/, 'Editar', 'usuarios', (m) => `Edición del usuario ${num(m[1])}`],
  ['DELETE', /^\/api\/usuarios\/(\d+)$/, 'Eliminar', 'usuarios', (m) => `Eliminación del usuario ${num(m[1])}`],
  ['POST', /^\/api\/libros$/, 'Crear', 'libros', (m, b) => `Alta del libro «${b.titulo || ''}»`],
  ['PUT', /^\/api\/libros\/(\d+)$/, 'Editar', 'libros', (m, b) => `Edición del libro ${num(m[1])}${b.titulo ? ` «${b.titulo}»` : ''}`],
  ['DELETE', /^\/api\/libros\/(\d+)$/, 'Eliminar', 'libros', (m) => `Eliminación del libro ${num(m[1])}`],
  ['POST', /^\/api\/libros\/(\d+)\/resenas$/, 'Crear', 'resenas', (m, b) => `Reseña de ${b.calificacion}★ al libro ${num(m[1])}`],
  ['PUT', /^\/api\/resenas\/(\d+)\/moderar$/, 'Moderar', 'resenas', (m, b) => `Reseña ${num(m[1])}: ${b.decision === 'aprobar' ? 'aprobada' : 'rechazada'}`],
  ['DELETE', /^\/api\/resenas\/(\d+)$/, 'Eliminar', 'resenas', (m) => `Eliminación de la reseña ${num(m[1])}`],
  ['POST', /^\/api\/pedidos$/, 'Venta', 'pedidos', (m, b, r) => r?.pedido ? `Pedido ${num(r.pedido.id_pedido)} por ${r.pedido.total ?? ''}` : 'Intento de compra'],
  ['POST', /^\/api\/pedidos\/(\d+)\/devolver$/, 'Devolución', 'pedidos', (m) => `Devolución del pedido ${num(m[1])}`],
  ['POST', /^\/api\/pedidos\/(\d+)\/solicitud-devolucion$/, 'Crear', 'pedidos', (m, b) => `Solicitud de devolución del pedido ${num(m[1])} (${b.motivo || ''})`],
  ['POST', /^\/api\/pedidos\/solicitudes\/(\d+)\/responder$/, 'Devolución', 'pedidos', (m, b) => `Solicitud ${num(m[1])}: ${b.decision}`],
  ['PUT', /^\/api\/pedidos\/(\d+)\/estado$/, 'Editar', 'pedidos', (m, b) => `Pedido ${num(m[1])} pasó a "${b.estado}"`],
  ['PUT', /^\/api\/roles\/([\w-]+)$/, 'Editar', 'roles', (m) => `Permisos del rol "${m[1]}"`],
  ['POST', /^\/api\/roles$/, 'Crear', 'roles', (m, b) => `Rol nuevo "${b.nombre || b.clave || ''}"`],
  ['DELETE', /^\/api\/roles\/([\w-]+)$/, 'Eliminar', 'roles', (m) => `Eliminación del rol "${m[1]}"`],
  ['PUT', /^\/api\/inventario\/minimo\/(\d+)$/, 'Editar', 'inventario', (m, b) => `Stock mínimo del libro ${num(m[1])} = ${b.minimo ?? 'por defecto'}`],
  ['PUT', /^\/api\/inventario\/minimo-defecto$/, 'Editar', 'inventario', (m, b) => `Stock mínimo por defecto = ${b.minimo}`],
  ['POST', /^\/api\/inventario\/conteos$/, 'Crear', 'inventario', (m, b, r) => `Inicio del conteo cíclico ${r?.idConteo ? num(r.idConteo) : ''}`],
  ['POST', /^\/api\/inventario\/conteos\/(\d+)\/ajustar$/, 'Ajuste', 'inventario', (m, b, r) => `Ajuste de stock por el conteo ${num(m[1])} (${r?.ajustados ?? 0} libro(s))`],
  ['POST', /^\/api\/inventario\/conteos\/(\d+)\/cerrar$/, 'Editar', 'inventario', (m) => `Cierre del conteo ${num(m[1])}`],
  ['POST', /^\/api\/casos$/, 'Crear', 'soporte', (m, b, r) => `Caso ${r?.idCaso ? num(r.idCaso) : ''} · ${b.motivo || ''}${b.id_pedido ? ` (pedido ${num(b.id_pedido)})` : ''}`],
  ['POST', /^\/api\/casos\/(\d+)\/mensajes$/, 'Mensaje', 'soporte', (m) => `Mensaje en el caso ${num(m[1])}`],
  ['PUT', /^\/api\/casos\/(\d+)\/estado$/, 'Editar', 'soporte', (m, b) => `Caso ${num(m[1])} pasó a "${b.estado}"`],
  ['POST', /^\/api\/facturas\/(\d+)\/enviar$/, 'Editar', 'facturas', (m) => `Envío a la DIAN de la factura ${num(m[1])}`],
  ['POST', /^\/api\/favoritos$/, 'Crear', 'favoritos', (m, b) => `Agregó el libro ${num(b.id_libro)} a favoritos`],
  ['DELETE', /^\/api\/favoritos\/(\d+)$/, 'Eliminar', 'favoritos', (m) => `Quitó el libro ${num(m[1])} de favoritos`],
  ['PUT', /^\/api\/suscripciones$/, 'Editar', 'suscripciones', () => 'Cambió sus preferencias de notificación'],
  ['POST', /^\/api\/suscripciones\/avisos\/(\d+)$/, 'Crear', 'suscripciones', (m) => `Pidió aviso de reposición del libro ${num(m[1])}`],
  ['PUT', /^\/api\/inventario\/conteos\/(\d+)\/libros\/(\d+)$/, 'Editar', 'inventario', (m, b) => `Conteo ${num(m[1])}: libro ${num(m[2])} contado = ${b.cantidad}`],
  ['POST', /^\/api\/suscripciones\/promocion$/, 'Crear', 'configuracion', (m, b) => `Promoción enviada: "${b.asunto || ''}"`]
];

/** Si no hay regla específica: Crear / Editar / Eliminar según el método, y el módulo según la ruta. */
const ACCION_POR_METODO = { POST: 'Crear', PUT: 'Editar', PATCH: 'Editar', DELETE: 'Eliminar' };

const describir = (req, cuerpoRespuesta) => {
  const ruta = req.originalUrl.split('?')[0];
  for (const [metodo, expr, accion, modulo, texto] of REGLAS) {
    if (metodo !== req.method) continue;
    const m = ruta.match(expr);
    if (m) {
      let descripcion = '';
      try { descripcion = texto(m, req.body || {}, cuerpoRespuesta); } catch { descripcion = ruta; }
      return { accion, modulo, descripcion };
    }
  }
  return { accion: ACCION_POR_METODO[req.method] || req.method, modulo: ruta.split('/')[2] || 'api', descripcion: `${req.method} ${ruta}` };
};

/** Inserta una fila en logs_actividad. Nunca rompe la petición si falla. */
export const registrarLog = async ({ idUsuario = null, nombre = null, accion, modulo, descripcion = null, resultado = 'OK', ip = null }) => {
  try {
    let usuarioNombre = nombre;
    if (idUsuario && !usuarioNombre) {
      const [[u]] = await pool.query('SELECT nombre, email FROM usuarios WHERE id = ?', [idUsuario]);
      usuarioNombre = u ? `${u.nombre} (${u.email})` : null;
    }
    await pool.query(
      `INSERT INTO logs_actividad (id_usuario, usuario_nombre, accion, modulo, descripcion, resultado, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [idUsuario, usuarioNombre, accion, modulo, String(descripcion || '').slice(0, 500), resultado, ip]
    );
  } catch (error) {
    console.error('RF15 · No se pudo guardar el log:', error.message);
  }
};

/** RF15 · Middleware: registra cada petición que cambia datos cuando termina. */
export const registrarActividad = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || IGNORAR.some(r => r.test(req.originalUrl))) return next();

  // Guardamos lo que responde el servidor (para saber, por ejemplo, el número del pedido creado)
  let cuerpoRespuesta = null;
  const jsonOriginal = res.json.bind(res);
  res.json = (cuerpo) => { cuerpoRespuesta = cuerpo; return jsonOriginal(cuerpo); };

  res.on('finish', () => {
    const { accion, modulo, descripcion } = describir(req, cuerpoRespuesta);
    const ok = res.statusCode < 400;
    // En el login todavía no hay req.usuario: si salió bien, el usuario viene en la respuesta
    const idUsuario = req.usuario?.id ?? (ok ? cuerpoRespuesta?.usuario?.id : null) ?? null;
    const detalleError = !ok && cuerpoRespuesta?.error ? ` · ${cuerpoRespuesta.error}` : '';
    registrarLog({
      idUsuario,
      nombre: idUsuario ? null : (req.body?.email ? `Sin sesión (${String(req.body.email).slice(0, 100)})` : 'Sin sesión'),
      accion,
      modulo,
      descripcion: ok ? descripcion : `Intento fallido: ${descripcion}${detalleError}`,
      resultado: ok ? 'OK' : 'Fallido',
      ip: (req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || '').trim().slice(0, 45)
    });
  });
  next();
};
