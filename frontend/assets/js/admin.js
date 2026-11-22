/**
 * @file admin.js
 * @description Administración de Librería Adrián (personal interno, según los permisos de su rol · RF18).
 * Secciones por hash: #resumen, #libros, #libros/nuevo, #libros/:id, #inventario, #usuarios, #usuarios/nuevo, #resenas, #roles, #roles/nuevo, #roles/:clave
 */

const esc = (v) => window.esc(v);
/** RF18 · Módulos de la administración y su nombre visible (mismos que en el backend). */
const NOMBRES_MODULO = { resumen: 'Resumen', libros: 'Libros', inventario: 'Inventario', facturas: 'Facturas', reportes: 'Reportes', soporte: 'Atención al cliente', usuarios: 'Usuarios', resenas: 'Reseñas', roles: 'Roles y permisos', auditoria: 'Registro de actividad', configuracion: 'Configuración' }; // RF14: + inventario · RF17: + configuracion · RF8/RF6/RF20: + reportes
const MODULOS = Object.keys(NOMBRES_MODULO);
const estado = {
  libros: [],
  usuarios: [],
  resenas: [],
  roles: [],
  cargado: { libros: false, usuarios: false, resenas: false, roles: false },
  filtros: { libros: { q: '', genero: '', disp: '' }, resenas: { q: '', libro: '' } }
};

document.addEventListener('DOMContentLoaded', async () => {
  // RF18: primero confirmamos con el servidor qué puede hacer este usuario
  await window.refrescarPermisos();
  if (!window.esPersonal()) {
    window.location.href = 'index.html';   // un cliente no tiene nada que hacer aquí
    return;
  }
  window.addEventListener('hashchange', enrutar);
  await Promise.all([cargarLibros(), cargarUsuarios(), cargarResenas(), cargarRoles(), cargarSolicitudes(), cargarAlertas(), cargarConteoCasos()]);
  enrutar();
});

/* ---------------------------------------------------------------
   DATOS
   --------------------------------------------------------------- */
async function cargarLibros() {
  try {
    const res = await fetch(`${window.API_BASE}/api/libros`);
    if (!res.ok) throw new Error();
    estado.libros = (await res.json()).libros || [];
    estado.cargado.libros = true;
  } catch {
    estado.cargado.libros = false;
  }
}

async function cargarUsuarios() {
  try {
    const res = await window.fetchAPI('/api/usuarios');
    if (!res.ok) throw new Error();
    estado.usuarios = (await res.json()).usuarios || [];
    estado.cargado.usuarios = true;
  } catch {
    estado.cargado.usuarios = false;
  }
}

async function cargarResenas() {
  try {
    if (!window.puede('resenas')) throw new Error();   // RF21: la lista completa (con pendientes) es solo para moderar
    const res = await window.fetchAPI('/api/resenas');
    if (!res.ok) throw new Error();
    estado.resenas = (await res.json()).resenas || [];
    estado.cargado.resenas = true;
  } catch {
    estado.cargado.resenas = false;
  }
}

/** RF18 · Trae los roles con sus permisos (para el módulo Roles y el selector de Usuarios). */
async function cargarRoles() {
  try {
    const res = await window.fetchAPI('/api/roles');
    if (!res.ok) throw new Error();
    estado.roles = (await res.json()).roles || [];
    estado.cargado.roles = true;
  } catch {
    estado.cargado.roles = false;
  }
}

async function leerError(res, porDefecto) {
  const data = await res.json().catch(() => ({}));
  return new Error(data.error || porDefecto);
}

/* ---------------------------------------------------------------
   ENRUTADOR
   --------------------------------------------------------------- */
function enrutar() {
  const [hash, param] = location.hash.replace('#', '').split('/');
  detenerInventarioEnVivo(); // RF14: al cambiar de sección se apaga la actualización automática
  detenerKpis();             // RF19: lo mismo con el tablero de indicadores
  detenerSoporte();          // RF30: y con la bandeja de casos
  // Sin sección en la URL: abre el primer módulo que este rol puede ver
  const seccion = hash || MODULOS.find(m => window.puede(m)) || 'resumen';

  const rail = document.getElementById('rail');
  rail.dataset.page = `admin:${seccion}`;
  window.renderShell();
  actualizarConteoRail();

  const root = document.getElementById('admin-root');
  const vistas = { resumen: vistaResumen, libros: vistaLibros, inventario: vistaInventario, facturas: vistaFacturas, reportes: vistaReportes, soporte: vistaSoporte, usuarios: vistaUsuarios, resenas: vistaResenas, roles: vistaRoles, auditoria: vistaAuditoria,
    configuracion: async (r, p) => { await vistaConfiguracion(r, p); agregarPanelPromocion(r); } };   // RF26: + panel de promociones

  // RF18 · criterio 3: sin permiso para ver el módulo -> acceso denegado
  if (!vistas[seccion] || !window.puede(seccion, 'ver')) {
    root.innerHTML = accesoDenegado(seccion);
    return;
  }
  vistas[seccion](root, param);
  aplicarPermisos(root);
}

/** RF18 · Pantalla que ve quien entra a un módulo sin permiso. */
function accesoDenegado(seccion) {
  const u = window.getCurrentUser() || {};
  const destino = MODULOS.find(m => window.puede(m));
  return `<div class="panel"><div class="empty">
    <i class="fas fa-lock" aria-hidden="true"></i>
    <h2>Acceso denegado</h2>
    <p>Tu rol (${esc(u.rol_nombre || u.rol)}) no tiene permiso para ver «${esc(NOMBRES_MODULO[seccion] || seccion)}». Si lo necesitas, pídeselo al administrador.</p>
    ${destino ? `<a class="btn btn-secondary" href="admin.html#${destino}">Ir a ${NOMBRES_MODULO[destino]}</a>` : ''}
  </div></div>`;
}

/**
 * RF18 · Quita los botones para los que el usuario no tiene permiso.
 * Uso en el HTML: <button data-requiere="libros:editar">…</button>
 */
function aplicarPermisos(raiz) {
  raiz.querySelectorAll('[data-requiere]').forEach(el => {
    const [modulo, accion] = el.dataset.requiere.split(':');
    if (!window.puede(modulo, accion)) el.remove();
  });
}

function actualizarConteoRail() {
  const agotados = estado.libros.filter(l => l.disponibilidad === 'Agotado').length;
  const badge = document.querySelector('[data-count="libros"]');
  if (badge) {
    badge.textContent = agotados;
    badge.hidden = agotados === 0;
    badge.title = `${agotados} agotados`;
  }
  // RF14: solicitudes de devolución esperando respuesta
  const pendientes = inv.solicitudes.filter(x => x.estado === 'Pendiente').length;
  const badgeSol = document.querySelector('[data-count="solicitudes"]');
  if (badgeSol) {
    badgeSol.textContent = pendientes;
    badgeSol.hidden = pendientes === 0;
    badgeSol.title = `${pendientes} solicitudes de devolución pendientes`;
  }
  // RF21: reseñas esperando aprobación
  const badgeRes = document.querySelector('[data-count="resenas"]');
  if (badgeRes) {
    const n = estado.resenas.filter(r => r.estado === 'Pendiente').length;
    badgeRes.textContent = n;
    badgeRes.hidden = !n;
    badgeRes.title = `${n} reseñas por aprobar`;
  }
  // RF30: casos de atención al cliente sin cerrar
  const badgeCasos = document.querySelector('[data-count="casos"]');
  if (badgeCasos) {
    badgeCasos.textContent = sop.casosAbiertos;
    badgeCasos.hidden = !sop.casosAbiertos;
    badgeCasos.title = `${sop.casosAbiertos} casos sin cerrar`;
  }
  // RF10: avisos de stock bajo sin leer
  const badgeAlerta = document.querySelector('[data-count="alertas"]');
  if (badgeAlerta) {
    badgeAlerta.textContent = inv.sinLeer;
    badgeAlerta.hidden = !inv.sinLeer;
    badgeAlerta.title = `${inv.sinLeer} avisos de stock bajo sin leer`;
  }
}

function errorConexion(que) {
  return `<div class="panel"><div class="empty">
    <i class="fas fa-plug-circle-xmark" aria-hidden="true"></i>
    <h2>No pudimos cargar ${que}</h2>
    <p>El servidor no respondió. Comprueba que la API y MySQL (XAMPP) estén en marcha.</p>
    <button type="button" class="btn btn-secondary" onclick="location.reload()">Reintentar</button>
  </div></div>`;
}

const fecha = (v, opts = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  v ? new Date(v).toLocaleDateString('es-CO', opts) : '—';
const nota = (v) => (parseFloat(v) || 0).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const portada = (l) => esc(l.portada || window.PORTADA_DEFECTO);

/* ---------------------------------------------------------------
   RESUMEN
   --------------------------------------------------------------- */
function vistaResumen(root) {
  if (!estado.cargado.libros) { root.innerHTML = errorConexion('la tienda'); return; }

  const total = estado.libros.length;
  const agotados = estado.libros.filter(l => l.disponibilidad === 'Agotado');
  const clientes = estado.usuarios.filter(u => u.rol !== 'admin').length;
  const recientes = [...estado.libros].sort((a, b) => b.id_libro - a.id_libro).slice(0, 5);
  const ultimasResenas = estado.resenas.filter(r => r.estado === 'Aprobada').slice(0, 5);   // RF21: solo publicadas
  const hoy = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  root.innerHTML = `
    <section class="admin-section">
      <header class="page-head">
        <div><h1>Resumen</h1><p>Estado de la tienda, ${esc(hoy)}.</p></div>
        <div class="actions">
          <a class="btn btn-secondary" href="admin.html#usuarios/nuevo" data-requiere="usuarios:editar"><i class="fas fa-user-plus" aria-hidden="true"></i> Nuevo usuario</a>
          <a class="btn btn-primary" href="admin.html#libros/nuevo" data-requiere="libros:editar"><i class="fas fa-plus" aria-hidden="true"></i> Nuevo libro</a>
        </div>
      </header>

      ${window.isAdmin() ? '<section class="panel kpis-panel" id="kpis" aria-live="polite"><p class="list-empty">Cargando indicadores…</p></section>' : ''}

      <div class="summary-strip">
        <div><b>${total}</b><span>Títulos en catálogo</span></div>
        <div><b>${total - agotados.length}</b><span>Disponibles</span></div>
        <div class="${agotados.length ? 'warn' : ''}"><b>${agotados.length}</b><span>Agotados</span></div>
        <div><b>${estado.cargado.resenas ? estado.resenas.length : '—'}</b><span>Reseñas de lectores</span></div>
        <div><b>${estado.cargado.usuarios ? clientes : '—'}</b><span>Clientes registrados</span></div>
      </div>

      <div class="admin-cols">
        <section class="panel">
          <div class="panel-head"><h2>Agotados</h2><a class="btn btn-quiet btn-sm" href="admin.html#libros">Ver libros</a></div>
          ${agotados.length ? `<ul class="list">${agotados.map(l => `
            <li>
              <img class="thumb" src="${portada(l)}" alt="" onerror="this.src=window.PORTADA_DEFECTO" />
              <div class="grow"><b>${esc(l.titulo)}</b><span>${esc(l.autor)}</span></div>
              <a class="btn btn-secondary btn-sm" data-requiere="libros:editar" href="admin.html#libros/${l.id_libro}">Reponer stock</a>
            </li>`).join('')}</ul>` : '<p class="list-empty">Todos los libros están disponibles.</p>'}
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Reseñas recientes</h2><a class="btn btn-quiet btn-sm" href="admin.html#resenas">Ver todas</a></div>
          ${ultimasResenas.length ? `<ul class="list">${ultimasResenas.map(r => `
            <li>
              <div class="grow">
                <b>${esc(r.libro_titulo || 'Libro eliminado')}</b>
                <p class="quote">${esc(r.reseña)}</p>
                <span>${esc(r.usuario_nombre)} · ${fecha(r.fecha)}</span>
              </div>
              <span class="rating"><i class="fas fa-star" aria-hidden="true"></i>${nota(r.calificacion)}</span>
            </li>`).join('')}</ul>` : `<p class="list-empty">${estado.cargado.resenas ? 'Todavía no hay reseñas.' : 'No se pudieron cargar las reseñas.'}</p>`}
        </section>

        <section class="panel" style="grid-column:1/-1">
          <div class="panel-head"><h2>Últimos libros agregados</h2><a class="btn btn-quiet btn-sm" href="admin.html#libros/nuevo">Agregar otro</a></div>
          ${recientes.length ? `<ul class="list">${recientes.map(l => `
            <li>
              <img class="thumb" src="${portada(l)}" alt="" onerror="this.src=window.PORTADA_DEFECTO" />
              <div class="grow"><b>${esc(l.titulo)}</b><span>${esc(l.autor)} · ${window.numeroRegistro(l.id_libro)}</span></div>
              <span class="genre" style="--g:${window.genreColor(l.genero)}"><i aria-hidden="true"></i>${esc(l.genero || 'General')}</span>
              <span class="price num" style="min-width:72px; text-align:right">${window.formatPrecio(l.precio)}</span>
              <a class="btn btn-quiet btn-sm" href="admin.html#libros/${l.id_libro}">Editar</a>
            </li>`).join('')}</ul>` : '<p class="list-empty">Aún no hay libros. Agrega el primero.</p>'}
        </section>
      </div>
    </section>`;
  if (window.isAdmin()) iniciarKpis();   // RF19
}

/* ---------------------------------------------------------------
   LIBROS
   --------------------------------------------------------------- */
function vistaLibros(root, param) {
  if (!estado.cargado.libros) { root.innerHTML = errorConexion('los libros'); return; }

  const f = estado.filtros.libros;
  const generos = [...new Set(estado.libros.map(l => l.genero || 'General'))].sort((a, b) => a.localeCompare(b, 'es'));
  const agotados = estado.libros.filter(l => l.disponibilidad === 'Agotado').length;
  const seleccionado = param && param !== 'nuevo' ? estado.libros.find(l => String(l.id_libro) === param) : null;
  const abierto = param === 'nuevo' || !!seleccionado;

  root.innerHTML = `
    <section class="admin-section workspace">
      <div>
        <header class="page-head">
          <div><h1>Libros</h1><p>${estado.libros.length} títulos · ${agotados} agotados</p></div>
          <div class="actions"><a class="btn btn-primary" href="admin.html#libros/nuevo" data-requiere="libros:editar"><i class="fas fa-plus" aria-hidden="true"></i> Nuevo libro</a></div>
        </header>

        <div class="toolbar">
          <label class="search"><span class="sr-only">Buscar libros</span><i class="fas fa-magnifying-glass" aria-hidden="true"></i>
            <input type="search" class="input" id="f-q" placeholder="Título, autor o ISBN" value="${esc(f.q)}" /></label>
          <label><span class="sr-only">Género</span><select class="select" id="f-genero">
            <option value="">Todos los géneros</option>
            ${generos.map(g => `<option ${f.genero === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}
          </select></label>
          <label><span class="sr-only">Disponibilidad</span><select class="select" id="f-disp">
            <option value="">Cualquier estado</option>
            <option ${f.disp === 'Disponible' ? 'selected' : ''}>Disponible</option>
            <option ${f.disp === 'Agotado' ? 'selected' : ''}>Agotado</option>
          </select></label>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Libro</th><th>Género</th><th class="right">Precio</th><th class="right">Stock</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody id="libros-tbody"></tbody>
          </table>
          <div class="table-foot" id="libros-foot"></div>
        </div>
      </div>

      <aside class="workspace-side ${abierto ? '' : 'is-empty'}" id="libro-side">
        ${abierto ? fichaLibro(seleccionado) : fichaVacia()}
      </aside>
    </section>`;

  pintarTablaLibros(seleccionado ? seleccionado.id_libro : null);

  const filtrar = () => {
    f.q = document.getElementById('f-q').value;
    f.genero = document.getElementById('f-genero').value;
    f.disp = document.getElementById('f-disp').value;
    pintarTablaLibros(seleccionado ? seleccionado.id_libro : null);
  };
  ['f-q', 'f-genero', 'f-disp'].forEach(id => document.getElementById(id).addEventListener('input', filtrar));

  document.getElementById('libros-tbody').addEventListener('click', (e) => {
    if (e.target.closest('.switch, button, a')) return;
    const tr = e.target.closest('tr[data-id]');
    if (tr) location.hash = `libros/${tr.dataset.id}`;
  });

  const side = document.getElementById('libro-side');
  side.addEventListener('click', (e) => { if (e.target === side) location.hash = 'libros'; });

  if (abierto) conectarFormLibro(seleccionado);
}

function pintarTablaLibros(idSeleccionado) {
  const f = estado.filtros.libros;
  const q = f.q.trim().toLowerCase();
  const filas = estado.libros.filter(l =>
    (!q || `${l.titulo} ${l.autor} ${l.ISBN || ''}`.toLowerCase().includes(q)) &&
    (!f.genero || (l.genero || 'General') === f.genero) &&
    (!f.disp || l.disponibilidad === f.disp)
  );

  const tbody = document.getElementById('libros-tbody');
  document.getElementById('libros-foot').textContent =
    filas.length === estado.libros.length ? `${filas.length} títulos` : `${filas.length} de ${estado.libros.length} títulos`;

  if (!filas.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty" style="padding:28px"><p>${estado.libros.length ? 'Ningún libro coincide con los filtros.' : 'Aún no hay libros en el catálogo.'}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filas.map(l => {
    const disp = l.disponibilidad !== 'Agotado';
    return `
      <tr class="clickable ${l.id_libro === idSeleccionado ? 'selected' : ''}" data-id="${l.id_libro}">
        <td><div class="title-cell"><img src="${portada(l)}" alt="" loading="lazy" onerror="this.src=window.PORTADA_DEFECTO" /><div><b>${esc(l.titulo)}</b><span>${esc(l.autor)}</span></div></div></td>
        <td><span class="genre" style="--g:${window.genreColor(l.genero)}"><i aria-hidden="true"></i>${esc(l.genero || 'General')}</span></td>
        <td class="right"><b>${window.formatPrecio(l.precio)}</b></td>
        <td class="right"><b class="${l.stock > 0 ? '' : 'stock-cero'}">${l.stock}</b></td>  <!-- RF13 -->
        <td><span class="status ${disp ? 'status-ok' : 'status-out'}">${disp ? 'Disponible' : 'Agotado'}</span></td>
        <td><div class="row-actions">
          <a class="icon-btn" href="admin.html#libros/${l.id_libro}" aria-label="Editar ${esc(l.titulo)}" title="Editar"><i class="fas fa-pen"></i></a>
          <button type="button" class="icon-btn danger" data-requiere="libros:editar" onclick="eliminarLibro(${l.id_libro})" aria-label="Eliminar ${esc(l.titulo)}" title="Eliminar"><i class="fas fa-trash-can"></i></button>
        </div></td>
      </tr>`;
  }).join('');
  aplicarPermisos(tbody); // RF18: la tabla se redibuja al filtrar
}

function fichaVacia() {
  return `
    <div class="ficha">
      <div class="ficha-head"><div class="ficha-call"><span>N.º ----</span><span>Ficha</span></div><h2>Ninguna ficha abierta</h2></div>
      <div class="ficha-body">
        <p style="color:var(--text-2)">Elige un libro de la tabla para editar su precio, portada o sinopsis, o crea uno nuevo.</p>
        <div style="margin-top:16px"><a class="btn btn-primary" href="admin.html#libros/nuevo" data-requiere="libros:editar"><i class="fas fa-plus" aria-hidden="true"></i> Nuevo libro</a></div>
      </div>
    </div>`;
}

function fichaLibro(l) {
  const nuevo = !l;
  const v = (k) => esc(l ? (l[k] ?? '') : '');
  const generos = [...new Set(estado.libros.map(x => x.genero).filter(Boolean))];
  return `
    <form class="ficha" id="form-libro" novalidate>
      <div class="ficha-head">
        <div class="ficha-call"><span>${nuevo ? 'N.º nueva' : window.numeroRegistro(l.id_libro)}</span><span>${nuevo ? 'Alta de libro' : `Alta ${fecha(l.fecha_registro)}`}</span></div>
        <h2>${nuevo ? 'Nuevo libro' : esc(l.titulo)}</h2>
        ${nuevo ? '<p>Completa la ficha y guárdala en el catálogo.</p>' : `<p>${esc(l.autor)} · <a class="link" href="index.html?libro=${l.id_libro}">Ver en la tienda</a></p>`}
        <a class="icon-btn sheet-close" href="admin.html#libros" aria-label="Cerrar ficha"><i class="fas fa-xmark"></i></a>
      </div>
      <div class="ficha-body">
        <fieldset class="rol-campos" ${window.puede('libros', 'editar') ? '' : 'disabled'}>
        <div class="form-grid">
          <label class="field full"><span class="field-label">Título *</span><input class="input" name="titulo" required maxlength="200" value="${v('titulo')}" /></label>
          <label class="field full"><span class="field-label">Autor *</span><input class="input" name="autor" required maxlength="100" value="${v('autor')}" /></label>
          <label class="field"><span class="field-label">Precio (USD) *</span><input class="input num" name="precio" type="number" min="0" step="0.01" required value="${v('precio')}" /></label>
          <!-- RF13: cantidad en stock (la disponibilidad se calcula sola) -->
          <label class="field"><span class="field-label">Cantidad en stock *</span><input class="input num" name="stock" type="number" min="0" step="1" required value="${l ? l.stock : 0}" />
            <span class="field-hint">${!l ? 'Unidades con las que entra al catálogo.' : (l.stock > 0 ? 'Disponible en la tienda.' : 'Con 0 aparece como Agotado.')}</span></label>
          <label class="field"><span class="field-label">Género</span><input class="input" name="genero" list="dl-generos" maxlength="50" value="${v('genero')}" placeholder="Clásico" />
            <datalist id="dl-generos">${generos.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
          <label class="field"><span class="field-label">ISBN</span><input class="input mono" name="ISBN" maxlength="20" value="${v('ISBN')}" placeholder="978-…" />
            <span class="field-hint">No puede repetirse entre libros.</span></label>
          <div class="field full">
            <label class="field-label" for="f-portada">Portada (URL de imagen)</label>
            <div class="cover-preview">
              <img id="portada-preview" src="${l && l.portada ? esc(l.portada) : window.PORTADA_DEFECTO}" alt="" onerror="this.src=window.PORTADA_DEFECTO" />
              <input class="input" id="f-portada" name="portada" type="url" value="${v('portada')}" placeholder="https://…" />
            </div>
            <span class="field-hint">Si la dejas vacía se usa una portada genérica.</span>
          </div>
          <label class="field full"><span class="field-label">Sinopsis</span><textarea class="textarea" name="descripcion" rows="4">${v('descripcion')}</textarea></label>
        </div>
        </fieldset>
        <div class="ficha-actions">
          <button type="submit" class="btn btn-primary" data-requiere="libros:editar">${nuevo ? 'Guardar en el catálogo' : 'Guardar cambios'}</button>
          ${nuevo ? '<a class="btn btn-secondary" href="admin.html#libros">Cancelar</a>' : ''}
          <span class="spacer"></span>
          ${nuevo ? '' : `<button type="button" class="btn btn-danger" data-requiere="libros:editar" onclick="eliminarLibro(${l.id_libro})"><i class="fas fa-trash-can" aria-hidden="true"></i> Eliminar</button>`}
        </div>
      </div>
    </form>`;
}

function conectarFormLibro(libro) {
  const form = document.getElementById('form-libro');
  const preview = document.getElementById('portada-preview');
  form.portada.addEventListener('change', () => { preview.src = form.portada.value.trim() || window.PORTADA_DEFECTO; });
  form.titulo.focus({ preventScroll: true });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const datos = {
      titulo: form.titulo.value.trim(),
      autor: form.autor.value.trim(),
      precio: parseFloat(form.precio.value),
      stock: parseInt(form.stock.value, 10),   // RF13: cantidad en stock
      genero: form.genero.value.trim() || 'General',
      ISBN: form.ISBN.value.trim() || null,
      portada: form.portada.value.trim() || window.PORTADA_DEFECTO,
      descripcion: form.descripcion.value.trim() || null
    };
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const res = await window.fetchAPI(libro ? `/api/libros/${libro.id_libro}` : '/api/libros', {
        method: libro ? 'PUT' : 'POST',
        body: JSON.stringify(datos)
      });
      if (!res.ok) throw await leerError(res, 'No se pudo guardar el libro');
      const body = await res.json().catch(() => ({}));
      await cargarLibros();
      window.showToast(libro ? `Guardaste los cambios de «${datos.titulo}».` : `«${datos.titulo}» ya está en el catálogo.`);
      const nuevoId = libro ? libro.id_libro : (body.libro && body.libro.id_libro) || body.id_libro;
      location.hash = nuevoId ? `libros/${nuevoId}` : 'libros';
      if (libro) enrutar();
    } catch (err) {
      window.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

window.cambiarDisponibilidad = async function(idLibro, nuevoEstado, input) {
  const label = input ? input.closest('.switch') : null;
  if (label) label.classList.add('busy');
  try {
    const res = await window.fetchAPI(`/api/libros/${idLibro}`, { method: 'PUT', body: JSON.stringify({ disponibilidad: nuevoEstado }) });
    if (!res.ok) throw await leerError(res, 'No se pudo cambiar la disponibilidad');
    const libro = estado.libros.find(l => l.id_libro === idLibro);
    if (libro) libro.disponibilidad = nuevoEstado;
    window.showToast(`«${libro ? libro.titulo : 'Libro'}» ahora está ${nuevoEstado.toLowerCase()}.`);
    actualizarConteoRail();
    if (input) {
      label.classList.remove('busy');
      const [seccion] = location.hash.replace('#', '').split('/');
      if (seccion === 'libros') {
        const p = document.querySelector('.page-head p');
        const ag = estado.libros.filter(l => l.disponibilidad === 'Agotado').length;
        if (p) p.textContent = `${estado.libros.length} títulos · ${ag} agotados`;
        const sel = document.querySelector('#form-libro select[name="disponibilidad"]');
        const abierto = location.hash.split('/')[1];
        if (sel && abierto === String(idLibro)) sel.value = nuevoEstado;
      }
    } else {
      enrutar();
    }
  } catch (e) {
    if (input) { input.checked = !input.checked; label.classList.remove('busy'); }
    window.showToast(e.message, 'error');
  }
};

window.eliminarLibro = async function(idLibro) {
  const libro = estado.libros.find(l => l.id_libro === idLibro);
  if (!libro) return;
  const ok = await window.confirmar({
    titulo: `¿Eliminar «${libro.titulo}»?`,
    mensaje: 'El libro desaparece del catálogo y de los carritos futuros. Esta acción no se puede deshacer.',
    confirmar: 'Eliminar libro',
    peligro: true
  });
  if (!ok) return;
  try {
    const res = await window.fetchAPI(`/api/libros/${idLibro}`, { method: 'DELETE' });
    if (!res.ok) throw await leerError(res, 'No se pudo eliminar el libro');
    await cargarLibros();
    window.showToast(`Eliminaste «${libro.titulo}».`);
    if (location.hash === '#libros') enrutar(); else location.hash = 'libros';
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};

/* ---------------------------------------------------------------
   USUARIOS
   --------------------------------------------------------------- */
function vistaUsuarios(root, param) {
  if (!estado.cargado.usuarios) { root.innerHTML = errorConexion('los usuarios'); return; }
  const yo = window.getCurrentUser();
  const admins = estado.usuarios.filter(u => u.rol === 'admin').length;
  // RF16: #usuarios/nuevo abre el alta; #usuarios/<id> abre la edición de esa cuenta
  const editando = param && param !== 'nuevo' ? estado.usuarios.find(u => u.id === Number(param)) : null;
  const abierto = param === 'nuevo' || Boolean(editando);
  const desactivadas = estado.usuarios.filter(u => u.activo === 0).length;

  root.innerHTML = `
    <section class="admin-section workspace">
      <div>
        <header class="page-head">
          <div><h1>Usuarios</h1><p>${estado.usuarios.length} cuentas · ${admins} ${admins === 1 ? 'administrador' : 'administradores'}${desactivadas ? ` · ${desactivadas} desactivada${desactivadas === 1 ? '' : 's'}` : ''}</p></div>
          <div class="actions"><a class="btn btn-primary" href="admin.html#usuarios/nuevo" data-requiere="usuarios:editar"><i class="fas fa-user-plus" aria-hidden="true"></i> Nuevo usuario</a></div>
        </header>
        <div class="toolbar">
          <label class="search"><span class="sr-only">Buscar usuarios</span><i class="fas fa-magnifying-glass" aria-hidden="true"></i>
            <input type="search" class="input" id="u-q" placeholder="Nombre o correo" /></label>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Registro</th><th><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody id="usuarios-tbody"></tbody>
          </table>
        </div>
      </div>
      <aside class="workspace-side ${abierto ? '' : 'is-empty'}" id="usuario-side">
        ${abierto ? fichaUsuario(editando) : `
          <div class="ficha">
            <div class="ficha-head"><div class="ficha-call"><span>Cuentas</span><span>Roles</span></div><h2>Usuarios por rol</h2></div>
            <div class="ficha-body">
              <dl class="ficha-facts">
                ${estado.roles.map(r => `<div><dt>${esc(r.nombre)}</dt><dd>${r.total_usuarios}</dd></div>`).join('')}
              </dl>
              <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap">
                <a class="btn btn-primary" href="admin.html#usuarios/nuevo" data-requiere="usuarios:editar">Crear usuario</a>
                <a class="btn btn-secondary" href="admin.html#roles" data-requiere="roles:ver">Ver roles y permisos</a>
              </div>
            </div>
          </div>`}
      </aside>
    </section>`;

  const pintar = () => {
    const q = document.getElementById('u-q').value.trim().toLowerCase();
    const filas = estado.usuarios.filter(u => !q || `${u.nombre} ${u.email}`.toLowerCase().includes(q));
    document.getElementById('usuarios-tbody').innerHTML = filas.length ? filas.map(u => {
      const esYo = yo && yo.id === u.id;
      return `
        <tr>
          <td style="white-space:nowrap"><b>${esc(u.nombre)}</b>${esYo ? ' <span class="status status-admin">Tú</span>' : ''}</td>
          <td>${esc(u.email)}</td>
          <td>
            <select class="select select-sm" aria-label="Rol de ${esc(u.nombre)}"
              ${esYo || !window.puede('usuarios', 'editar') ? 'disabled' : ''}
              ${esYo ? 'title="No puedes cambiar tu propio rol"' : ''}
              onchange="cambiarRol(${u.id}, this.value, this)">
              ${opcionesRol(u.rol)}
            </select>
          </td>
          <td>${u.activo === 0 ? '<span class="status status-out">Desactivada</span>' : '<span class="status status-ok">Activa</span>'}</td>
          <td class="mono">${fecha(u.fecha_registro)}</td>
          <td><div class="row-actions">
            <a class="icon-btn" href="admin.html#usuarios/${u.id}" data-requiere="usuarios:editar" aria-label="Editar a ${esc(u.nombre)}" title="Editar"><i class="fas fa-pen"></i></a>
            ${esYo ? '' : `<button type="button" class="icon-btn danger" data-requiere="usuarios:editar" onclick="eliminarUsuario(${u.id})" aria-label="Eliminar a ${esc(u.nombre)}" title="Eliminar"><i class="fas fa-trash-can"></i></button>`}
          </div></td>
        </tr>`;
    }).join('') : '<tr><td colspan="6"><div class="empty" style="padding:28px"><p>Ningún usuario coincide.</p></div></td></tr>';
    aplicarPermisos(document.getElementById('usuarios-tbody')); // RF18
  };
  pintar();
  document.getElementById('u-q').addEventListener('input', pintar);

  const side = document.getElementById('usuario-side');
  side.addEventListener('click', (e) => { if (e.target === side) location.hash = 'usuarios'; });
  if (abierto) conectarFormUsuario(editando);
}

/**
 * RF16 · Ficha para crear (sin `u`) o editar (con `u`) una cuenta.
 * Al editar, la contraseña es opcional: si se deja vacía, no cambia.
 */
function fichaUsuario(u = null) {
  const yo = window.getCurrentUser();
  const esYo = u && yo && yo.id === u.id;
  const v = (campo) => (u && u[campo] ? esc(u[campo]) : '');
  return `
    <form class="ficha" id="form-usuario">
      <div class="ficha-head">
        <div class="ficha-call"><span>${u ? window.numeroRegistro(u.id) : 'N.º nueva'}</span><span>${u ? 'Edición de cuenta' : 'Alta de cuenta'}</span></div>
        <h2>${u ? esc(u.nombre) : 'Nuevo usuario'}</h2>
        <p>${u ? esc(u.email) : 'La persona podrá entrar con este correo y contraseña.'}</p>
        <a class="icon-btn sheet-close" href="admin.html#usuarios" aria-label="Cerrar"><i class="fas fa-xmark"></i></a>
      </div>
      <div class="ficha-body">
        <div class="form-grid">
          <label class="field full"><span class="field-label">Nombre completo *</span><input class="input" name="nombre" required maxlength="100" autocomplete="off" value="${v('nombre')}" /></label>
          <label class="field full"><span class="field-label">Correo *</span><input class="input" name="email" type="email" required maxlength="150" autocomplete="off" value="${v('email')}" /><span class="field-hint">No puede repetirse con otra cuenta.</span></label>
          <label class="field full"><span class="field-label">${u ? 'Nueva contraseña' : 'Contraseña inicial *'}</span><input class="input" name="password" type="password" ${u ? '' : 'required'} minlength="6" autocomplete="new-password" /><span class="field-hint">${u ? 'Déjala vacía para no cambiarla. ' : ''}Mínimo 6 caracteres.</span></label>
          <label class="field full"><span class="field-label">Rol</span><select class="select" name="rol" ${esYo ? 'disabled title="No puedes cambiar tu propio rol"' : ''}>${opcionesRol(u ? u.rol : 'usuario', true)}</select></label>
          <label class="field"><span class="field-label">Cédula</span><input class="input" name="cedula" maxlength="100" value="${v('cedula')}" /></label>
          <label class="field"><span class="field-label">Dirección</span><input class="input" name="direccion" maxlength="100" value="${v('direccion')}" /></label>
          ${u ? `<label class="field full" style="flex-direction:row; align-items:center; gap:8px">
            <input type="checkbox" name="activo" ${u.activo === 0 ? '' : 'checked'} ${esYo ? 'disabled' : ''} />
            <span>Cuenta activa <span class="field-hint">(si la desactivas, no podrá iniciar sesión)</span></span></label>` : ''}
        </div>
        <div class="ficha-actions">
          <button type="submit" class="btn btn-primary">${u ? 'Guardar cambios' : 'Crear usuario'}</button>
          <a class="btn btn-secondary" href="admin.html#usuarios">Cancelar</a>
        </div>
      </div>
    </form>`;
}

/** RF16 · Envía la ficha: POST para crear, PUT para editar. */
function conectarFormUsuario(u = null) {
  const form = document.getElementById('form-usuario');
  form.nombre.focus({ preventScroll: true });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const datos = {
      nombre: form.nombre.value.trim(),
      email: form.email.value.trim(),
      cedula: form.cedula.value.trim() || null,
      direccion: form.direccion.value.trim() || null
    };
    if (form.password.value) datos.password = form.password.value;
    if (!form.rol.disabled) datos.rol = form.rol.value;
    if (u && form.activo && !form.activo.disabled) datos.activo = form.activo.checked;

    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const res = await window.fetchAPI(u ? `/api/usuarios/${u.id}` : '/api/usuarios',
        { method: u ? 'PUT' : 'POST', body: JSON.stringify(datos) });
      if (!res.ok) throw await leerError(res, u ? 'No se pudieron guardar los cambios' : 'No se pudo crear el usuario');
      await Promise.all([cargarUsuarios(), cargarRoles()]);
      window.showToast(u ? `Guardaste los cambios de ${datos.nombre}.` : `Creaste la cuenta de ${datos.nombre}.`);
      location.hash = 'usuarios';
    } catch (err) {
      window.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

window.cambiarRol = async function(id, rol, select) {
  const u = estado.usuarios.find(x => x.id === id);
  if (!u || u.rol === rol) return;
  const nombreRol = nombreDeRol(rol);
  if (rol === 'admin') {
    const ok = await window.confirmar({
      titulo: `¿Hacer administrador a ${u.nombre}?`,
      mensaje: 'Podrá editar y eliminar libros, gestionar usuarios y moderar reseñas.',
      confirmar: 'Dar acceso de administrador'
    });
    if (!ok) { if (select) select.value = u.rol; return; }
  }
  try {
    const res = await window.fetchAPI(`/api/usuarios/${id}/rol`, { method: 'PUT', body: JSON.stringify({ rol }) });
    if (!res.ok) throw await leerError(res, 'No se pudo cambiar el rol');
    u.rol = rol;
    await cargarRoles(); // actualiza el conteo de usuarios por rol
    window.showToast(`${u.nombre} ahora es ${nombreRol}.`);
    enrutar();
  } catch (e) {
    if (select) select.value = u.rol; // el servidor dijo que no: vuelve al rol anterior
    window.showToast(e.message, 'error');
  }
};

window.eliminarUsuario = async function(id) {
  const u = estado.usuarios.find(x => x.id === id);
  if (!u) return;
  const ok = await window.confirmar({
    titulo: `¿Eliminar la cuenta de ${u.nombre}?`,
    // RF16: si tiene pedidos o facturas no se borra, se desactiva (el servidor decide)
    mensaje: `${u.email} ya no podrá iniciar sesión. Si la cuenta tiene pedidos o facturas, se desactiva en lugar de borrarse para conservar el historial.`,
    confirmar: 'Eliminar cuenta',
    peligro: true
  });
  if (!ok) return;
  try {
    const res = await window.fetchAPI(`/api/usuarios/${id}`, { method: 'DELETE' });
    if (!res.ok) throw await leerError(res, 'No se pudo eliminar el usuario');
    const r = await res.json();
    if (r.desactivado) {
      u.activo = 0;
      window.showToast(`${u.nombre} tiene pedidos o facturas: su cuenta quedó desactivada.`);
    } else {
      estado.usuarios = estado.usuarios.filter(x => x.id !== id);
      window.showToast(`Eliminaste la cuenta de ${u.nombre}.`);
    }
    await cargarRoles();
    enrutar();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};

/* ---------------------------------------------------------------
   RESEÑAS
   --------------------------------------------------------------- */
/* vistaResenas: ver "RESEÑAS · MODERACIÓN (RF21)" al final del archivo */

window.eliminarResena = async function(id) {
  const r = estado.resenas.find(x => x.id_reseña === id);
  if (!r) return;
  const ok = await window.confirmar({
    titulo: '¿Eliminar esta reseña?',
    mensaje: `La reseña de ${r.usuario_nombre} sobre «${r.libro_titulo || 'este libro'}» se borra y se recalcula la valoración del libro.`,
    confirmar: 'Eliminar reseña',
    peligro: true
  });
  if (!ok) return;
  try {
    const res = await window.fetchAPI(`/api/resenas/${id}?id_libro=${r.id_libro}`, { method: 'DELETE' });
    if (!res.ok) throw await leerError(res, 'No se pudo eliminar la reseña');
    await Promise.all([cargarResenas(), cargarLibros()]);
    window.showToast('Reseña eliminada.');
    enrutar();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};


/* ---------------------------------------------------------------
   ROLES Y PERMISOS (RF18)
   --------------------------------------------------------------- */

/** RF18 · Nombre legible de un rol a partir de su clave ('inventario' -> 'Encargado de inventario'). */
function nombreDeRol(clave) {
  const r = estado.roles.find(x => x.clave === clave);
  return r ? r.nombre : clave;
}

/**
 * RF18 · <option> de todos los roles para un <select>.
 * @param {string} seleccionado - Clave del rol que aparece elegido.
 * @param {boolean} [paraAlta=false] - En el alta de usuarios, solo un admin ve la opción "Administrador".
 */
function opcionesRol(seleccionado, paraAlta = false) {
  return estado.roles
    .filter(r => !paraAlta || r.clave !== 'admin' || window.isAdmin())
    .map(r => `<option value="${esc(r.clave)}" ${r.clave === seleccionado ? 'selected' : ''}>${esc(r.nombre)}</option>`)
    .join('');
}

/** RF18 · Texto corto con los módulos de un rol, para la tabla. */
function resumenPermisos(r) {
  if (r.clave === 'admin') return 'Todos los módulos';
  if (r.clave === 'usuario') return '<span class="field-hint">Sin acceso a la administración</span>';
  if (!r.permisos.length) return '<span class="field-hint">Ninguno</span>';
  return r.permisos
    .map(p => `${esc(NOMBRES_MODULO[p.modulo] || p.modulo)}${p.editar ? ' <span class="field-hint">(editar)</span>' : ''}`)
    .join(', ');
}

/** RF18 · Vista: lista de roles a la izquierda y la ficha del rol abierta a la derecha. */
function vistaRoles(root, param) {
  if (!estado.cargado.roles) { root.innerHTML = errorConexion('los roles'); return; }
  const editar = window.puede('roles', 'editar');
  const sel = param && param !== 'nuevo' ? estado.roles.find(r => r.clave === param) : null;
  const abierto = (param === 'nuevo' && editar) || !!sel;

  root.innerHTML = `
    <section class="admin-section workspace">
      <div>
        <header class="page-head">
          <div><h1>Roles y permisos</h1><p>${estado.roles.length} roles · cada uno define qué módulos ve y edita</p></div>
          <div class="actions"><a class="btn btn-primary" href="admin.html#roles/nuevo" data-requiere="roles:editar"><i class="fas fa-plus" aria-hidden="true"></i> Nuevo rol</a></div>
        </header>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Rol</th><th>Módulos</th><th class="right">Usuarios</th></tr></thead>
            <tbody id="roles-tbody">
              ${estado.roles.map(r => `
                <tr class="clickable ${sel && sel.clave === r.clave ? 'selected' : ''}" data-clave="${esc(r.clave)}">
                  <td><b>${esc(r.nombre)}</b>${r.es_base ? ' <span class="status status-admin">Base</span>' : ''}
                    <div class="field-hint">${esc(r.descripcion || '')}</div></td>
                  <td>${resumenPermisos(r)}</td>
                  <td class="right">${r.total_usuarios}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <aside class="workspace-side ${abierto ? '' : 'is-empty'}" id="rol-side">
        ${abierto ? fichaRol(sel, editar) : `
          <div class="ficha">
            <div class="ficha-head"><div class="ficha-call"><span>Roles</span><span>Permisos</span></div><h2>Ningún rol abierto</h2></div>
            <div class="ficha-body"><p style="color:var(--text-2)">Elige un rol para ver qué módulos puede ver y editar${editar ? ', o crea uno nuevo' : ''}.</p></div>
          </div>`}
      </aside>
    </section>`;

  // Clic en una fila: abre la ficha de ese rol
  document.getElementById('roles-tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-clave]');
    if (tr) location.hash = `roles/${tr.dataset.clave}`;
  });
  const side = document.getElementById('rol-side');
  side.addEventListener('click', (e) => { if (e.target === side) location.hash = 'roles'; });

  if (abierto) conectarFormRol(sel);
}

/** RF18 · Ficha de un rol con la tabla de permisos (módulo × ver / editar). */
function fichaRol(r, editar) {
  const nuevo = !r;
  const fijo = r && (r.clave === 'admin' || r.clave === 'usuario');  // sus permisos no se editan
  const bloqueado = !editar || fijo;
  const tiene = (m, accion) => !!r && (r.clave === 'admin' || r.permisos.some(p => p.modulo === m && p[accion]));

  return `
    <form class="ficha" id="form-rol">
      <div class="ficha-head">
        <div class="ficha-call"><span>${nuevo ? 'Rol nuevo' : esc(r.clave)}</span><span>${r && r.es_base ? 'Rol base' : 'Personalizado'}</span></div>
        <h2>${nuevo ? 'Nuevo rol' : esc(r.nombre)}</h2>
        ${fijo ? `<p>${r.clave === 'admin' ? 'El administrador siempre tiene acceso total.' : 'Los clientes no entran a la administración.'}</p>` : ''}
        <a class="icon-btn sheet-close" href="admin.html#roles" aria-label="Cerrar"><i class="fas fa-xmark"></i></a>
      </div>
      <div class="ficha-body">
        <fieldset class="rol-campos" ${bloqueado ? 'disabled' : ''}>
          <label class="field"><span class="field-label">Nombre del rol *</span>
            <input class="input" name="nombre" required maxlength="60" value="${esc(r ? r.nombre : '')}" placeholder="Atención al cliente" /></label>
          <label class="field"><span class="field-label">Descripción</span>
            <input class="input" name="descripcion" maxlength="200" value="${esc(r ? r.descripcion || '' : '')}" placeholder="Qué hace esta persona en la tienda" /></label>
          <div class="field">
            <span class="field-label">Permisos por módulo</span>
            <table class="table permisos">
              <thead><tr><th>Módulo</th><th>Ver</th><th>Editar</th></tr></thead>
              <tbody>
                ${MODULOS.map(m => `
                  <tr>
                    <td>${NOMBRES_MODULO[m]}</td>
                    <td><input type="checkbox" name="ver-${m}" ${tiene(m, 'ver') ? 'checked' : ''} aria-label="Ver ${NOMBRES_MODULO[m]}" /></td>
                    <td><input type="checkbox" name="editar-${m}" ${tiene(m, 'editar') ? 'checked' : ''} aria-label="Editar ${NOMBRES_MODULO[m]}" /></td>
                  </tr>`).join('')}
              </tbody>
            </table>
            <span class="field-hint">"Editar" incluye "Ver". Quien no ve un módulo recibe "Acceso denegado".</span>
          </div>
        </fieldset>
        ${bloqueado ? '' : `
        <div class="ficha-actions">
          <button type="submit" class="btn btn-primary">${nuevo ? 'Crear rol' : 'Guardar permisos'}</button>
          ${nuevo ? '<a class="btn btn-secondary" href="admin.html#roles">Cancelar</a>' : ''}
          <span class="spacer"></span>
          ${!nuevo && !r.es_base ? `<button type="button" class="btn btn-danger" onclick="eliminarRol('${esc(r.clave)}')"><i class="fas fa-trash-can" aria-hidden="true"></i> Eliminar</button>` : ''}
        </div>`}
      </div>
    </form>`;
}

/** RF18 · Conecta el formulario del rol: reglas de las casillas y guardado. */
function conectarFormRol(rol) {
  const form = document.getElementById('form-rol');

  // Marcar "Editar" marca también "Ver"; quitar "Ver" quita también "Editar"
  form.addEventListener('change', (e) => {
    const [accion, modulo] = (e.target.name || '').split('-');
    if (accion === 'editar' && e.target.checked) form[`ver-${modulo}`].checked = true;
    if (accion === 'ver' && !e.target.checked) form[`editar-${modulo}`].checked = false;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const datos = {
      nombre: form.nombre.value.trim(),
      descripcion: form.descripcion.value.trim() || null,
      permisos: MODULOS.map(m => ({
        modulo: m,
        ver: form[`ver-${m}`].checked,
        editar: form[`editar-${m}`].checked
      }))
    };
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const res = await window.fetchAPI(rol ? `/api/roles/${rol.clave}` : '/api/roles', {
        method: rol ? 'PUT' : 'POST',
        body: JSON.stringify(datos)
      });
      if (!res.ok) throw await leerError(res, 'No se pudo guardar el rol');
      const body = await res.json();
      await cargarRoles();
      await window.refrescarPermisos(); // por si cambiaste los permisos de tu propio rol
      window.showToast(rol ? `Guardaste los permisos de «${datos.nombre}».` : `Creaste el rol «${datos.nombre}».`);
      const destino = `roles/${rol ? rol.clave : body.clave}`;
      if (location.hash === `#${destino}`) enrutar(); else location.hash = destino;
    } catch (err) {
      window.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

/** RF18 · Elimina un rol personalizado (el backend no deja borrar uno con usuarios). */
window.eliminarRol = async function(clave) {
  const r = estado.roles.find(x => x.clave === clave);
  if (!r) return;
  const ok = await window.confirmar({
    titulo: `¿Eliminar el rol «${r.nombre}»?`,
    mensaje: r.total_usuarios
      ? `Tiene ${r.total_usuarios} usuario(s). Cámbialos de rol antes de eliminarlo.`
      : 'Esta acción no se puede deshacer.',
    confirmar: 'Eliminar rol',
    peligro: true
  });
  if (!ok) return;
  try {
    const res = await window.fetchAPI(`/api/roles/${clave}`, { method: 'DELETE' });
    if (!res.ok) throw await leerError(res, 'No se pudo eliminar el rol');
    await cargarRoles();
    window.showToast(`Eliminaste el rol «${r.nombre}».`);
    location.hash = 'roles';
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};


/* ---------------------------------------------------------------
   INVENTARIO EN TIEMPO REAL (RF14)
   Cómo funciona:
   1. Al entrar a #inventario se piden /api/inventario y /api/pedidos.
   2. Cada 10 segundos se vuelven a pedir y se repinta solo lo que cambia
      (la búsqueda que escribiste no se borra).
   3. Si el stock de un libro cambió desde la última vez (por una venta,
      devolución o ajuste), su número parpadea para que se note.
   4. Al salir de la sección, el temporizador se apaga (detenerInventarioEnVivo).
   --------------------------------------------------------------- */

/** Cada cuánto se refresca el inventario (milisegundos). */
const INVENTARIO_CADA_MS = 10000;
/* RF11: el "stock bajo" ya no es un número fijo: cada libro trae su `stock_minimo`
   (el propio o el de por defecto) y se marca bajo cuando stock <= mínimo. */
const esBajo = (l) => l.stock > 0 && l.stock <= l.stock_minimo;

const inv = {
  libros: [],
  movimientos: [],
  pedidos: [],
  solicitudes: [],       // RF14: solicitudes de devolución de los clientes
  notificaciones: [],    // RF10: avisos de stock bajo
  sinLeer: 0,
  minimoDefecto: 5,      // RF11
  actualizado: null,
  anterior: new Map(),   // id_libro -> stock de la consulta anterior (para el parpadeo)
  q: '',
  timer: null
};

/** RF14 · Apaga la actualización automática (se llama al cambiar de sección). */
function detenerInventarioEnVivo() {
  if (inv.timer) clearInterval(inv.timer);
  inv.timer = null;
}

/** RF14 · Pide al servidor la foto actual del inventario y las ventas recientes. */
async function cargarInventario() {
  const [resInv, resPed] = await Promise.all([
    window.fetchAPI('/api/inventario'),
    window.fetchAPI('/api/pedidos')
  ]);
  if (!resInv.ok) throw await leerError(resInv, 'No se pudo consultar el inventario');
  const datos = await resInv.json();
  inv.anterior = new Map(inv.libros.map(l => [l.id_libro, l.stock]));
  inv.libros = datos.libros;
  inv.movimientos = datos.movimientos;
  inv.actualizado = new Date(datos.actualizado);
  // RF10: si llegó un aviso nuevo mientras miras el panel, se muestra también como aviso flotante
  if (inv.notificaciones.length && datos.sinLeer > inv.sinLeer && datos.notificaciones[0]) {
    window.showToast(datos.notificaciones[0].mensaje);
  }
  inv.notificaciones = datos.notificaciones || [];
  inv.sinLeer = datos.sinLeer || 0;
  inv.minimoDefecto = datos.minimoDefecto ?? 5;
  inv.pedidos = resPed.ok ? (await resPed.json()).pedidos : [];
  await cargarSolicitudes();
}

/** RF14 · Trae las solicitudes de devolución (solo si el rol puede ver el inventario). */
async function cargarSolicitudes() {
  if (!window.puede('inventario')) return;
  try {
    const res = await window.fetchAPI('/api/pedidos/solicitudes');
    if (res.ok) inv.solicitudes = (await res.json()).solicitudes;
  } catch {
    // sin conexión: se mantienen las que ya teníamos
  }
}

/** RF14 · Vista principal del módulo Inventario. */
async function vistaInventario(root, param) {
  if (param === 'conteo') return vistaConteo(root);   // RF12
  root.innerHTML = `
    <section class="admin-section">
      <header class="page-head">
        <div>
          <h1>Inventario</h1>
          <p><span class="en-vivo" aria-hidden="true"></span> En tiempo real · <span id="inv-hora">consultando…</span></p>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-quiet" data-requiere="inventario:editar" onclick="editarMinimoDefecto()" title="RF11: mínimo de los libros que no tienen uno propio">
            <i class="fas fa-sliders" aria-hidden="true"></i> Mínimo por defecto: <b id="inv-min-defecto">${inv.minimoDefecto}</b></button>
          <a class="btn btn-secondary" href="admin.html#inventario/conteo"><i class="fas fa-clipboard-list" aria-hidden="true"></i> Conteo cíclico</a>
          <button type="button" class="btn btn-secondary" id="inv-refrescar"><i class="fas fa-rotate" aria-hidden="true"></i> Actualizar ahora</button>
        </div>
      </header>

      <div class="summary-strip" id="inv-resumen"></div>

      <!-- RF10: avisos cuando un libro llega a su stock mínimo -->
      <section class="panel" id="inv-alertas-panel" style="margin-bottom:26px">
        <div class="panel-head">
          <h2>Avisos de stock bajo <span class="status status-bajo" id="inv-alertas-count" hidden></span></h2>
          <button type="button" class="btn btn-quiet btn-sm" id="inv-alertas-leer" onclick="leerAlerta()" hidden>Marcar todas como leídas</button>
        </div>
        <ul class="list" id="inv-alertas"></ul>
      </section>

      <!-- RF14: solicitudes de devolución enviadas por los clientes desde "Mis compras" -->
      <section class="panel" id="inv-solicitudes-panel" style="margin-bottom:26px">
        <div class="panel-head"><h2>Solicitudes de devolución <span class="status status-bajo" id="inv-sol-count" hidden></span></h2></div>
        <ul class="list" id="inv-solicitudes"></ul>
      </section>

      <div class="toolbar">
        <label class="search"><span class="sr-only">Buscar en el inventario</span><i class="fas fa-magnifying-glass" aria-hidden="true"></i>
          <input type="search" class="input" id="inv-q" placeholder="Buscar por título o ISBN" value="${esc(inv.q)}" /></label>
      </div>

      <div class="table-wrap" style="margin-bottom:26px">
        <table class="table">
          <thead><tr><th>Libro</th><th>ISBN</th><th class="right">En stock</th><th class="right">Mínimo</th><th class="right">Vendidos</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody id="inv-tbody"><tr><td colspan="7"><p class="list-empty">Cargando inventario…</p></td></tr></tbody>
        </table>
        <div class="table-foot" id="inv-foot"></div>
      </div>

      <div class="admin-cols">
        <section class="panel">
          <div class="panel-head"><h2>Ventas recientes</h2></div>
          <ul class="list" id="inv-ventas"></ul>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Movimientos del stock</h2></div>
          <ul class="list" id="inv-movs"></ul>
        </section>
      </div>
    </section>`;

  document.getElementById('inv-q').addEventListener('input', (e) => {
    inv.q = e.target.value;
    pintarTablaInventario();
  });
  document.getElementById('inv-refrescar').addEventListener('click', () => refrescarInventario(true));

  await refrescarInventario();
  // Actualización automática mientras sigas en esta sección
  inv.timer = setInterval(() => {
    if (document.visibilityState === 'visible') refrescarInventario();
  }, INVENTARIO_CADA_MS);
}

/** RF14 · Consulta y repinta. Con `avisar` muestra un aviso (botón "Actualizar ahora"). */
async function refrescarInventario(avisar = false) {
  try {
    await cargarInventario();
    if (!document.getElementById('inv-tbody')) return;   // ya saliste de la sección
    pintarResumenInventario();
    pintarTablaInventario();
    pintarSolicitudes();
    pintarAlertas();   // RF10
    pintarVentas();
    pintarMovimientos();
    actualizarConteoRail();
    document.getElementById('inv-hora').textContent =
      `actualizado a las ${inv.actualizado.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    if (avisar) window.showToast('Inventario actualizado.');
  } catch (e) {
    const hora = document.getElementById('inv-hora');
    if (hora) hora.textContent = 'sin conexión con el servidor, reintentando…';
  }
}

/** RF14 · Franja de totales arriba de la tabla. */
function pintarResumenInventario() {
  const unidades = inv.libros.reduce((s, l) => s + l.stock, 0);
  const agotados = inv.libros.filter(l => l.stock === 0).length;
  const bajos = inv.libros.filter(esBajo).length;   // RF11: según el mínimo de cada libro
  const vendidas = inv.libros.reduce((s, l) => s + l.vendidos, 0);
  document.getElementById('inv-resumen').innerHTML = `
    <div><b>${unidades}</b><span>Unidades en stock</span></div>
    <div><b>${inv.libros.length}</b><span>Títulos</span></div>
    <div class="${agotados ? 'warn' : ''}"><b>${agotados}</b><span>Agotados</span></div>
    <div class="${bajos ? 'warn' : ''}"><b>${bajos}</b><span>Stock bajo (≤ su mínimo)</span></div>
    <div><b>${vendidas}</b><span>Unidades vendidas</span></div>`;
}

/** RF14 · Tabla de libros con su cantidad actual, filtrada por título o ISBN. */
function pintarTablaInventario() {
  const q = inv.q.trim().toLowerCase();
  const filas = inv.libros.filter(l => !q || `${l.titulo} ${l.ISBN || ''}`.toLowerCase().includes(q));
  const tbody = document.getElementById('inv-tbody');
  document.getElementById('inv-foot').textContent =
    filas.length === inv.libros.length ? `${filas.length} títulos` : `${filas.length} de ${inv.libros.length} títulos`;

  if (!filas.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty" style="padding:28px"><p>${inv.libros.length ? 'Ningún libro coincide con ese título o ISBN.' : 'Aún no hay libros en el inventario.'}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filas.map(l => {
    const antes = inv.anterior.get(l.id_libro);
    const cambio = antes !== undefined && antes !== l.stock;   // ¿cambió desde la última consulta?
    const nivel = l.stock === 0 ? 'stock-cero' : (esBajo(l) ? 'stock-bajo' : '');
    return `
      <tr>
        <td><div class="title-cell"><img src="${portada(l)}" alt="" loading="lazy" onerror="this.src=window.PORTADA_DEFECTO" /><div><b>${esc(l.titulo)}</b><span>${esc(l.autor)}</span></div></div></td>
        <td class="mono">${esc(l.ISBN || '—')}</td>
        <td class="right"><span class="stock-num ${nivel} ${cambio ? 'cambio' : ''}" title="${cambio ? `Antes: ${antes}` : ''}">${l.stock}</span></td>
        <td class="right">
          <!-- RF11: mínimo del libro; "por defecto" si no tiene uno propio -->
          <span class="num" title="${l.minimo_propio == null ? 'Usa el mínimo por defecto' : 'Mínimo propio de este libro'}">${l.stock_minimo}</span>
          ${l.minimo_propio == null ? '<span class="field-hint">def.</span>' : ''}
        </td>
        <td class="right">${l.vendidos}</td>
        <td><span class="status ${l.stock === 0 ? 'status-out' : (esBajo(l) ? 'status-bajo' : 'status-ok')}">${l.stock > 0 ? (esBajo(l) ? 'Stock bajo' : 'Disponible') : 'Agotado'}</span></td>
        <td><div class="row-actions">
          <button type="button" class="icon-btn" data-requiere="inventario:editar" onclick="editarMinimo(${l.id_libro})" aria-label="Stock mínimo de ${esc(l.titulo)}" title="Stock mínimo"><i class="fas fa-sliders"></i></button>
          <a class="icon-btn" href="admin.html#libros/${l.id_libro}" data-requiere="libros:editar" aria-label="Ajustar stock de ${esc(l.titulo)}" title="Ajustar stock"><i class="fas fa-pen"></i></a>
        </div></td>
      </tr>`;
  }).join('');
  aplicarPermisos(tbody);
}

/** RF14 · Últimas ventas, con botón de devolución para las que siguen activas. */
function pintarVentas() {
  const lista = document.getElementById('inv-ventas');
  if (!inv.pedidos.length) {
    lista.innerHTML = '<li class="list-empty">Todavía no hay ventas.</li>';
    return;
  }
  lista.innerHTML = inv.pedidos.slice(0, 8).map(p => {
    const unidades = p.items.reduce((s, i) => s + i.cantidad, 0);
    const resumen = p.items.map(i => `${i.cantidad}× ${i.titulo}`).join(', ');
    return `
      <li>
        <div class="grow">
          <b>${window.numeroRegistro(p.id_pedido)} · ${esc(p.cliente || 'Cliente')}</b>
          <p class="quote">${esc(resumen)}</p>
          <span>${unidades} unidad(es) · ${window.formatPrecio(p.total)} · ${fechaHora(p.fecha_registro)}</span>
          <span class="estado-envio-fila">
            <span class="status ${ESTADO_ENVIO[p.estado_envio]?.clase || 'status-admin'}">${p.estado_envio || 'Pendiente'}</span>
            ${(SIGUIENTES[p.estado_envio] || []).length ? `<button type="button" class="link" data-requiere="inventario:editar" onclick="cambiarEstadoPedido(${p.id_pedido})">Actualizar estado</button>` : ''}
          </span>
        </div>
        ${p.estado !== 'Activo'
          ? '<span class="status status-out">Devuelto</span>'
          : (p.solicitud && p.solicitud.estado === 'Pendiente'
            ? '<span class="status status-bajo">Solicitud pendiente</span>'
            : `<button type="button" class="btn btn-secondary btn-sm" data-requiere="inventario:editar" onclick="devolverPedido(${p.id_pedido})">Registrar devolución</button>`)}
      </li>`;
  }).join('');
  aplicarPermisos(lista);
}

/** RF14 · Historial: cada venta, devolución, alta o ajuste con su cambio de stock. */
function pintarMovimientos() {
  const lista = document.getElementById('inv-movs');
  if (!inv.movimientos.length) {
    lista.innerHTML = '<li class="list-empty">Aún no hay movimientos registrados.</li>';
    return;
  }
  const iconos = { 'Venta': 'fa-cart-shopping', 'Devolución': 'fa-rotate-left', 'Ajuste': 'fa-pen', 'Alta': 'fa-plus' };
  lista.innerHTML = inv.movimientos.slice(0, 10).map(m => {
    const sube = m.stock_nuevo > m.stock_anterior;
    return `
      <li>
        <span class="mov-icono ${sube ? 'sube' : 'baja'}"><i class="fas ${iconos[m.tipo_movimiento] || 'fa-circle'}" aria-hidden="true"></i></span>
        <div class="grow">
          <b>${esc(m.tipo_movimiento)} · ${esc(m.titulo)}</b>
          <span>${esc(m.usuario_nombre || 'Sistema')} · ${fechaHora(m.fecha_movimiento)}${m.id_pedido ? ` · ${window.numeroRegistro(m.id_pedido)}` : ''}</span>
        </div>
        <span class="mov-cambio ${sube ? 'sube' : 'baja'}">${sube ? '+' : '−'}${m.cantidad}</span>
        <span class="field-hint num" style="min-width:52px; text-align:right">${m.stock_anterior} → ${m.stock_nuevo}</span>
      </li>`;
  }).join('');
}

/** Fecha y hora corta: "20 nov, 15:42". */
function fechaHora(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** RF14 · Registra la devolución de un pedido: vuelve al inventario y queda en el historial. */
window.devolverPedido = async function(idPedido) {
  const p = inv.pedidos.find(x => x.id_pedido === idPedido);
  if (!p) return;
  const estadoLibro = await pedirEstadoLibro({
    titulo: `Registrar la devolución del ${window.numeroRegistro(idPedido)}`,
    mensaje: `${p.items.map(i => `${i.cantidad}× ${i.titulo}`).join(', ')}. El pedido quedará como Devuelto y se generará la nota crédito.`,
    confirmar: 'Registrar devolución'
  });
  if (!estadoLibro) return;
  try {
    const res = await window.fetchAPI(`/api/pedidos/${idPedido}/devolucion`, { method: 'POST', body: JSON.stringify({ estado_libro: estadoLibro }) });
    if (!res.ok) throw await leerError(res, 'No se pudo registrar la devolución');
    window.showToast((await res.json()).message);
    await cargarLibros();          // para que Libros y el Resumen también vean el stock nuevo
    await refrescarInventario();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};

/* ---------------------------------------------------------------
   SOLICITUDES DE DEVOLUCIÓN (RF14)
   El cliente la envía desde "Mis compras"; aquí el personal la aprueba
   (se hace la devolución: stock repuesto y pedido "Devuelto") o la rechaza
   con una respuesta que el cliente ve en el detalle de su pedido.
   --------------------------------------------------------------- */

/** RF14 · Pinta las solicitudes: las pendientes con botones, las resueltas como historial. */
function pintarSolicitudes() {
  const lista = document.getElementById('inv-solicitudes');
  if (!lista) return;
  const pendientes = inv.solicitudes.filter(x => x.estado === 'Pendiente');
  const resueltas = inv.solicitudes.filter(x => x.estado !== 'Pendiente').slice(0, 4);

  const contador = document.getElementById('inv-sol-count');
  contador.hidden = pendientes.length === 0;
  contador.textContent = `${pendientes.length} pendiente(s)`;

  if (!inv.solicitudes.length) {
    lista.innerHTML = '<li class="list-empty">No hay solicitudes de devolución. Cuando un cliente pida una desde "Mis compras", aparecerá aquí.</li>';
    return;
  }

  const fila = (sol) => {
    const libros = sol.items.map(i => `${i.cantidad}× ${i.titulo}`).join(', ');
    const pendiente = sol.estado === 'Pendiente';
    return `
      <li class="${pendiente ? 'solicitud-pendiente' : ''}">
        <div class="grow">
          <b>${window.numeroRegistro(sol.id_pedido)} · ${esc(sol.cliente || 'Cliente')} · ${window.formatPrecio(sol.total)}</b>
          <p class="quote"><b>${esc(sol.motivo)}</b>${sol.detalle ? ` — “${esc(sol.detalle)}”` : ''}</p>
          <span>${esc(libros)} · pedida ${fechaHora(sol.fecha_solicitud)}${!pendiente ? ` · respondida por ${esc(sol.revisor || '—')} el ${fechaHora(sol.fecha_respuesta)}` : ''}</span>
          ${sol.estado === 'Aprobada' ? `<span>Libro ${sol.estado_libro === 'Dañado' ? '<b style="color:var(--red)">dañado</b> · no volvió al stock' : 'en buen estado · volvió al stock'}${sol.id_nota ? ` · <a class="link" href="nota.html?id=${sol.id_nota}" target="_blank" rel="noopener">Nota crédito NC-${String(sol.id_nota).padStart(4, '0')}</a>` : ''}</span>` : ''}
          ${!pendiente && sol.respuesta ? `<span>Respuesta: ${esc(sol.respuesta)}</span>` : ''}
        </div>
        ${pendiente ? `
          <div class="solicitud-acciones">
            <button type="button" class="btn btn-primary btn-sm" data-requiere="inventario:editar" onclick="responderSolicitud(${sol.id_solicitud}, 'aprobar')">Aprobar</button>
            <button type="button" class="btn btn-danger btn-sm" data-requiere="inventario:editar" onclick="responderSolicitud(${sol.id_solicitud}, 'rechazar')">Rechazar</button>
          </div>`
        : `<span class="status ${sol.estado === 'Aprobada' ? 'status-out' : 'status-admin'}">${sol.estado === 'Aprobada' ? 'Devuelto' : 'Rechazada'}</span>`}
      </li>`;
  };

  lista.innerHTML = [...pendientes, ...resueltas].map(fila).join('');
  aplicarPermisos(lista);
}

/**
 * RF14 · Aprueba o rechaza una solicitud.
 * Aprobar pide confirmación; rechazar pide escribir la respuesta para el cliente.
 */
window.responderSolicitud = async function(idSolicitud, decision) {
  const sol = inv.solicitudes.find(x => x.id_solicitud === idSolicitud);
  if (!sol) return;
  const unidades = sol.items.reduce((s, i) => s + i.cantidad, 0);
  let respuesta = '';

  let estadoLibro = 'Bueno';
  if (decision === 'aprobar') {
    // RF9: el libro solo vuelve al stock si llegó en buen estado
    estadoLibro = await pedirEstadoLibro({
      titulo: `Aprobar la devolución del ${window.numeroRegistro(sol.id_pedido)}`,
      mensaje: `${unidades} unidad(es). Motivo del cliente: «${sol.motivo}». Se generará la nota crédito y ${sol.cliente || 'el cliente'} verá su pedido como devuelto.`,
      confirmar: 'Aprobar devolución'
    });
    if (!estadoLibro) return;
  } else {
    respuesta = await pedirTexto({
      titulo: `Rechazar la devolución del ${window.numeroRegistro(sol.id_pedido)}`,
      mensaje: `Motivo del cliente: «${sol.motivo}». Escribe la respuesta que verá en su pedido.`,
      placeholder: 'Ej.: pasaron más de 30 días desde la entrega.',
      confirmar: 'Rechazar solicitud'
    });
    if (respuesta === null) return;   // canceló
  }

  try {
    const res = await window.fetchAPI(`/api/pedidos/solicitudes/${idSolicitud}/responder`, {
      method: 'POST',
      body: JSON.stringify({ decision, respuesta, estado_libro: estadoLibro })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo responder la solicitud');
    window.showToast(data.message);
    await cargarLibros();          // el stock nuevo también se ve en Libros y en el Resumen
    await refrescarInventario();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};

/**
 * RF9 · Diálogo para aprobar una devolución eligiendo en qué estado llegó el libro.
 * @returns {Promise<'Bueno'|'Dañado'|null>} null si se canceló.
 */
function pedirEstadoLibro({ titulo, mensaje, confirmar = 'Aprobar' }) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'confirm';
    dlg.innerHTML = `
      <form class="ficha" method="dialog">
        <div class="ficha-head"><h2>${esc(titulo)}</h2></div>
        <div class="ficha-body">
          <p>${esc(mensaje)}</p>
          <fieldset class="estado-libro" style="border:0; display:grid; gap:8px; margin-top:12px">
            <legend class="field-label" style="margin-bottom:6px">¿En qué estado llegó el libro?</legend>
            <label class="pay-option"><input type="radio" name="estado" value="Bueno" checked /> <span><b>Buen estado</b> · vuelve al stock para venderse</span></label>
            <label class="pay-option"><input type="radio" name="estado" value="Dañado" /> <span><b>Dañado</b> · no vuelve al stock</span></label>
          </fieldset>
          <div class="confirm-actions">
            <button type="button" class="btn btn-secondary" data-cancelar>Cancelar</button>
            <button type="submit" class="btn btn-primary">${esc(confirmar)}</button>
          </div>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    const cerrar = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      cerrar(dlg.querySelector('input[name="estado"]:checked').value);
    });
    dlg.querySelector('[data-cancelar]').addEventListener('click', () => cerrar(null));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(null); });
    dlg.showModal();
  });
}

/**
 * Diálogo con forma de ficha que pide un texto obligatorio.
 * @returns {Promise<string|null>} El texto escrito, o null si se canceló.
 */
function pedirTexto({ titulo, mensaje, placeholder = '', confirmar = 'Aceptar' }) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'confirm';
    dlg.innerHTML = `
      <form class="ficha" method="dialog">
        <div class="ficha-head"><h2>${esc(titulo)}</h2></div>
        <div class="ficha-body">
          <p>${esc(mensaje)}</p>
          <textarea class="textarea" name="texto" required maxlength="300" placeholder="${esc(placeholder)}" style="margin-top:12px"></textarea>
          <div class="confirm-actions">
            <button type="button" class="btn btn-secondary" data-cancelar>Cancelar</button>
            <button type="submit" class="btn btn-danger-solid">${esc(confirmar)}</button>
          </div>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const cerrar = (valor) => { dlg.close(); dlg.remove(); resolve(valor); };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const texto = form.texto.value.trim();
      if (!texto) { form.texto.focus(); return; }
      cerrar(texto);
    });
    dlg.querySelector('[data-cancelar]').addEventListener('click', () => cerrar(null));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(null); });
    dlg.showModal();
    form.texto.focus();
  });
}


/* ---------------------------------------------------------------
   CONFIGURACIÓN DE LA TIENDA (RF17)
   - Métodos de pago: interruptor para activar/desactivar cada uno.
   - Tipos de envío: tabla con su costo; se crean y editan en la ficha de la derecha.
   Todo se guarda en la BD (metodos_pago y tipos_envio) y el carrito lo lee al abrirse,
   así que los cambios se ven en la siguiente compra sin tocar código.
   Rutas del panel: #configuracion, #configuracion/nuevo, #configuracion/<id del envío>
   --------------------------------------------------------------- */

const cfg = { metodos_pago: [], envios: [] };

/** RF17 · Trae todas las opciones (activas e inactivas). */
async function cargarConfiguracion() {
  const res = await window.fetchAPI('/api/tienda/configuracion');
  if (!res.ok) throw await leerError(res, 'No se pudo cargar la configuración');
  Object.assign(cfg, await res.json());
}

/** RF17 · Vista del módulo Configuración. */
async function vistaConfiguracion(root, param) {
  try {
    await cargarConfiguracion();
    await cargarConfigFE();   // RF5
  } catch (e) {
    root.innerHTML = errorConexion('la configuración');
    return;
  }
  const editar = window.puede('configuracion', 'editar');
  const envioSel = param && param !== 'nuevo' ? cfg.envios.find(e => String(e.id_tipo_envio) === param) : null;
  const abierto = (param === 'nuevo' && editar) || !!envioSel;
  const activos = cfg.metodos_pago.filter(m => m.activo).length;

  root.innerHTML = `
    <section class="admin-section workspace">
      <div>
        <header class="page-head">
          <div><h1>Configuración</h1><p>Métodos de pago y envíos que ve el cliente al comprar. Los cambios aplican de inmediato.</p></div>
        </header>

        <section class="panel" style="margin-bottom:24px">
          <div class="panel-head"><h2>Métodos de pago</h2><span class="field-hint">${activos} de ${cfg.metodos_pago.length} activos</span></div>
          <ul class="list" id="cfg-metodos">
            ${cfg.metodos_pago.map(m => `
              <li>
                <span class="mov-icono ${m.activo ? 'sube' : 'baja'}"><i class="fas ${iconoMetodo(m.nombre_metodo)}" aria-hidden="true"></i></span>
                <div class="grow"><b>${esc(m.nombre_metodo)}</b><span>${esc(m.descripcion || '')}</span></div>
                ${editar ? `
                  <label class="switch">
                    <input type="checkbox" ${m.activo ? 'checked' : ''} onchange="cambiarMetodoPago(${m.id_metodo_pago}, this)" aria-label="Activar ${esc(m.nombre_metodo)}" />
                    <span class="track" aria-hidden="true"></span><span class="lbl-on">Activo</span><span class="lbl-off">Inactivo</span>
                  </label>`
                : `<span class="status ${m.activo ? 'status-ok' : 'status-out'}">${m.activo ? 'Activo' : 'Inactivo'}</span>`}
              </li>`).join('')}
          </ul>
          ${activos === 0 ? '<p class="list-empty" style="color:var(--red)">Sin métodos activos, los clientes no pueden pagar.</p>' : ''}
        </section>

        ${seccionFacturacionElectronica(editar)}

        <section class="panel">
          <div class="panel-head">
            <h2>Tipos de envío</h2>
            <a class="btn btn-primary btn-sm" href="admin.html#configuracion/nuevo" data-requiere="configuracion:editar"><i class="fas fa-plus" aria-hidden="true"></i> Nuevo envío</a>
          </div>
          <div class="table-wrap" style="border:0; border-radius:0">
            <table class="table">
              <thead><tr><th>Envío</th><th>Tiempo</th><th class="right">Costo</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead>
              <tbody id="cfg-envios">
                ${cfg.envios.length ? cfg.envios.map(e => `
                  <tr class="clickable ${envioSel && envioSel.id_tipo_envio === e.id_tipo_envio ? 'selected' : ''}" data-id="${e.id_tipo_envio}">
                    <td><b>${esc(e.nombre)}</b><div class="field-hint">${esc(e.descripcion || '')}</div></td>
                    <td>${esc(e.tiempo_estimado || '—')}</td>
                    <td class="right"><b>${e.costo === 0 ? 'Gratis' : window.formatPrecio(e.costo)}</b></td>
                    <td>${editar ? `
                      <label class="switch">
                        <input type="checkbox" ${e.activo ? 'checked' : ''} onchange="cambiarEnvioActivo(${e.id_tipo_envio}, this)" aria-label="Activar ${esc(e.nombre)}" />
                        <span class="track" aria-hidden="true"></span><span class="lbl-on">Activo</span><span class="lbl-off">Inactivo</span>
                      </label>`
                      : `<span class="status ${e.activo ? 'status-ok' : 'status-out'}">${e.activo ? 'Activo' : 'Inactivo'}</span>`}
                    </td>
                    <td><div class="row-actions">
                      <a class="icon-btn" href="admin.html#configuracion/${e.id_tipo_envio}" aria-label="Editar ${esc(e.nombre)}" title="Editar"><i class="fas fa-pen"></i></a>
                      <button type="button" class="icon-btn danger" data-requiere="configuracion:editar" onclick="eliminarEnvio(${e.id_tipo_envio})" aria-label="Eliminar ${esc(e.nombre)}" title="Eliminar"><i class="fas fa-trash-can"></i></button>
                    </div></td>
                  </tr>`).join('')
                : '<tr><td colspan="5"><p class="list-empty">No hay tipos de envío. Crea al menos uno para que los clientes puedan comprar.</p></td></tr>'}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside class="workspace-side ${abierto ? '' : 'is-empty'}" id="cfg-side">
        ${abierto ? fichaEnvio(envioSel) : `
          <div class="ficha">
            <div class="ficha-head"><div class="ficha-call"><span>Envíos</span><span>Costos</span></div><h2>Ningún envío abierto</h2></div>
            <div class="ficha-body"><p style="color:var(--text-2)">Elige un tipo de envío para cambiar su nombre, tiempo o costo${editar ? ', o crea uno nuevo' : ''}.</p></div>
          </div>`}
      </aside>
    </section>`;

  document.getElementById('cfg-envios').addEventListener('click', (e) => {
    if (e.target.closest('.switch, button, a')) return;
    const tr = e.target.closest('tr[data-id]');
    if (tr) location.hash = `configuracion/${tr.dataset.id}`;
  });
  const side = document.getElementById('cfg-side');
  side.addEventListener('click', (e) => { if (e.target === side) location.hash = 'configuracion'; });
  if (abierto) conectarFormEnvio(envioSel);
  conectarFormFE();   // RF5
}

/* ---------------- RF5 · Datos del emisor para la facturación electrónica ---------------- */
let cfgFE = {};

async function cargarConfigFE() {
  const res = await window.fetchAPI('/api/facturas/electronica/configuracion');
  if (!res.ok) throw await leerError(res, 'No se pudo cargar la facturación electrónica');
  cfgFE = (await res.json()).configuracion;
}

/** Sección del panel con NIT, resolución, prefijo, ambiente y proveedor. */
function seccionFacturacionElectronica(editar) {
  const completo = /^\d{9,10}$/.test(cfgFE.fe_nit_emisor || '') && cfgFE.fe_resolucion;
  return `
    <section class="panel" style="margin-bottom:24px">
      <div class="panel-head">
        <h2>Facturación electrónica</h2>
        <span class="status ${completo ? 'status-ok' : 'status-out'}">${completo ? 'Datos completos' : 'Faltan datos'}</span>
      </div>
      <form class="panel-body" id="form-fe" novalidate>
        <p class="note" style="margin-bottom:14px"><i class="fas fa-circle-info" aria-hidden="true"></i>
          <span>${cfgFE.fe_proveedor === 'api'
            ? 'Conectado a un proveedor tecnológico real. Las facturas aceptadas quedan validadas ante la DIAN.'
            : '<b>Modo pruebas (simulador).</b> Las facturas se validan con las reglas de la DIAN y obtienen CUFE y QR, pero <b>no tienen validez legal</b>. Para facturar de verdad se necesita habilitación ante la DIAN, certificado digital y un proveedor tecnológico.'}</span></p>
        <fieldset class="rol-campos" ${editar ? '' : 'disabled'}>
          <div class="form-grid">
            <label class="field"><span class="field-label">NIT del emisor *</span><input class="input mono" name="fe_nit_emisor" inputmode="numeric" maxlength="10" value="${esc(cfgFE.fe_nit_emisor)}" placeholder="900123456 (sin DV)" /></label>
            <label class="field"><span class="field-label">Razón social</span><input class="input" name="fe_razon_social" maxlength="100" value="${esc(cfgFE.fe_razon_social)}" /></label>
            <label class="field"><span class="field-label">Resolución de facturación *</span><input class="input mono" name="fe_resolucion" maxlength="30" value="${esc(cfgFE.fe_resolucion)}" placeholder="18760000001" /></label>
            <label class="field"><span class="field-label">Prefijo</span><input class="input mono" name="fe_prefijo" maxlength="4" value="${esc(cfgFE.fe_prefijo)}" placeholder="SETP" /></label>
            <label class="field"><span class="field-label">Ambiente</span><select class="select" name="fe_ambiente">
              <option value="2" ${cfgFE.fe_ambiente !== '1' ? 'selected' : ''}>Pruebas (habilitación)</option>
              <option value="1" ${cfgFE.fe_ambiente === '1' ? 'selected' : ''}>Producción</option></select></label>
            <label class="field"><span class="field-label">Proveedor</span><select class="select" name="fe_proveedor">
              <option value="simulador" ${cfgFE.fe_proveedor !== 'api' ? 'selected' : ''}>Simulador (pruebas)</option>
              <option value="api" ${cfgFE.fe_proveedor === 'api' ? 'selected' : ''}>Proveedor tecnológico (API)</option></select></label>
            <label class="field full"><span class="field-label">Clave técnica</span><input class="input mono" name="fe_clave_tecnica" type="password" autocomplete="off" placeholder="${esc(cfgFE.fe_clave_tecnica_mascara || 'Sin configurar')} · déjalo vacío para no cambiarla" /></label>
          </div>
        </fieldset>
        ${editar ? '<div class="ficha-actions" style="border:0; margin-top:6px; padding-top:6px"><button type="submit" class="btn btn-primary">Guardar datos de facturación</button></div>' : ''}
      </form>
    </section>`;
}

function conectarFormFE() {
  const form = document.getElementById('form-fe');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(form).entries());
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const res = await window.fetchAPI('/api/facturas/electronica/configuracion', { method: 'PUT', body: JSON.stringify(datos) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudieron guardar los datos');
      window.showToast(data.message);
      enrutar();
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

/** Ícono según el nombre del método de pago. */
function iconoMetodo(nombre = '') {
  const n = nombre.toLowerCase();
  if (n.includes('tarjeta')) return 'fa-credit-card';
  if (n.includes('nequi') || n.includes('daviplata')) return 'fa-mobile-screen';
  if (n.includes('efectivo')) return 'fa-money-bill';
  if (n.includes('pse')) return 'fa-building-columns';   // RF3: débito bancario
  return 'fa-wallet';
}

/** RF17 · Ficha para crear o editar un tipo de envío. */
function fichaEnvio(e) {
  const nuevo = !e;
  const editar = window.puede('configuracion', 'editar');
  const v = (k) => esc(e ? (e[k] ?? '') : '');
  return `
    <form class="ficha" id="form-envio" novalidate>
      <div class="ficha-head">
        <div class="ficha-call"><span>${nuevo ? 'Envío nuevo' : `Envío ${window.numeroRegistro(e.id_tipo_envio)}`}</span><span>${e && !e.activo ? 'Inactivo' : 'Activo'}</span></div>
        <h2>${nuevo ? 'Nuevo tipo de envío' : esc(e.nombre)}</h2>
        <p>${nuevo ? 'Aparecerá en el carrito apenas lo guardes.' : 'Los pedidos ya hechos conservan el costo con el que se compraron.'}</p>
        <a class="icon-btn sheet-close" href="admin.html#configuracion" aria-label="Cerrar"><i class="fas fa-xmark"></i></a>
      </div>
      <div class="ficha-body">
        <fieldset class="rol-campos" ${editar ? '' : 'disabled'}>
          <label class="field"><span class="field-label">Nombre *</span><input class="input" name="nombre" required maxlength="60" value="${v('nombre')}" placeholder="Envío estándar" /></label>
          <label class="field"><span class="field-label">Descripción</span><input class="input" name="descripcion" maxlength="150" value="${v('descripcion')}" placeholder="Entrega a domicilio" /></label>
          <div class="form-grid">
            <label class="field"><span class="field-label">Tiempo estimado</span><input class="input" name="tiempo_estimado" maxlength="40" value="${v('tiempo_estimado')}" placeholder="3 a 5 días hábiles" /></label>
            <label class="field"><span class="field-label">Costo (USD) *</span><input class="input num" name="costo" type="number" min="0" step="0.01" required value="${e ? e.costo : ''}" placeholder="0 = gratis" /></label>
          </div>
          <label class="check"><input type="checkbox" name="activo" ${!e || e.activo ? 'checked' : ''} /> Visible en el carrito</label>
        </fieldset>
        ${editar ? `
        <div class="ficha-actions">
          <button type="submit" class="btn btn-primary">${nuevo ? 'Crear envío' : 'Guardar cambios'}</button>
          ${nuevo ? '<a class="btn btn-secondary" href="admin.html#configuracion">Cancelar</a>' : ''}
          <span class="spacer"></span>
          ${nuevo ? '' : `<button type="button" class="btn btn-danger" onclick="eliminarEnvio(${e.id_tipo_envio})"><i class="fas fa-trash-can" aria-hidden="true"></i> Eliminar</button>`}
        </div>` : ''}
      </div>
    </form>`;
}

/** RF17 · Guarda el formulario del envío (crear o editar). */
function conectarFormEnvio(envio) {
  const form = document.getElementById('form-envio');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const datos = {
      nombre: form.nombre.value.trim(),
      descripcion: form.descripcion.value.trim(),
      tiempo_estimado: form.tiempo_estimado.value.trim(),
      costo: parseFloat(form.costo.value),
      activo: form.activo.checked
    };
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const res = await window.fetchAPI(envio ? `/api/tienda/envios/${envio.id_tipo_envio}` : '/api/tienda/envios', {
        method: envio ? 'PUT' : 'POST',
        body: JSON.stringify(datos)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el envío');
      window.showToast(data.message);
      const destino = `configuracion/${envio ? envio.id_tipo_envio : data.id_tipo_envio}`;
      if (location.hash === `#${destino}`) enrutar(); else location.hash = destino;
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

/** RF17 · Interruptor de un método de pago. */
window.cambiarMetodoPago = async function(id, input) {
  const label = input.closest('.switch');
  label.classList.add('busy');
  try {
    const res = await window.fetchAPI(`/api/tienda/metodos-pago/${id}`, { method: 'PUT', body: JSON.stringify({ activo: input.checked }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo cambiar el método de pago');
    window.showToast(data.message);
    enrutar();
  } catch (e) {
    input.checked = !input.checked;
    label.classList.remove('busy');
    window.showToast(e.message, 'error');
  }
};

/** RF17 · Interruptor rápido de un tipo de envío. */
window.cambiarEnvioActivo = async function(id, input) {
  const label = input.closest('.switch');
  label.classList.add('busy');
  try {
    const res = await window.fetchAPI(`/api/tienda/envios/${id}`, { method: 'PUT', body: JSON.stringify({ activo: input.checked }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo cambiar el envío');
    window.showToast(data.message);
    enrutar();
  } catch (e) {
    input.checked = !input.checked;
    label.classList.remove('busy');
    window.showToast(e.message, 'error');
  }
};

/** RF17 · Elimina un tipo de envío (si ya se usó en pedidos, el servidor pide desactivarlo). */
window.eliminarEnvio = async function(id) {
  const e = cfg.envios.find(x => x.id_tipo_envio === id);
  if (!e) return;
  const ok = await window.confirmar({
    titulo: `¿Eliminar «${e.nombre}»?`,
    mensaje: 'Dejará de aparecer en el carrito. Si ya se usó en pedidos, tendrás que desactivarlo en vez de eliminarlo.',
    confirmar: 'Eliminar envío',
    peligro: true
  });
  if (!ok) return;
  try {
    const res = await window.fetchAPI(`/api/tienda/envios/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el envío');
    window.showToast(data.message);
    if (location.hash === '#configuracion') enrutar(); else location.hash = 'configuracion';
  } catch (err) {
    window.showToast(err.message, 'error');
  }
};


/* ---------------------------------------------------------------
   FACTURAS (RF7)
   Búsqueda por número de pedido exacto y/o rango de fechas.
   Los filtros se mandan al servidor (GET /api/facturas?pedido=&desde=&hasta=)
   y cada resultado se puede ABRIR o DESCARGAR (PDF) en factura.html.
   --------------------------------------------------------------- */

const fact = { filtros: { pedido: '', desde: '', hasta: '', estado_dian: '' }, resultados: [] };

/** RF5 · Cómo se ve cada estado de la factura ante la DIAN. */
const ESTADO_DIAN = {
  Pendiente: { clase: 'status-admin', texto: 'Sin enviar' },
  Enviada:   { clase: 'status-bajo',  texto: 'Enviada' },
  Aceptada:  { clase: 'status-ok',    texto: 'Aceptada' },
  Rechazada: { clase: 'status-out',   texto: 'Rechazada' }
};

/** RF7 · Vista del módulo Facturas. */
function vistaFacturas(root) {
  const f = fact.filtros;
  root.innerHTML = `
    <section class="admin-section">
      <header class="page-head">
        <div><h1>Facturas</h1><p>Busca por número de pedido o por fecha, y abre o descarga la factura.</p></div>
      </header>

      <form class="panel filtros-facturas" id="form-facturas" novalidate>
        <label class="field">
          <span class="field-label">N.º de pedido</span>
          <input class="input mono" name="pedido" inputmode="numeric" placeholder="Ej. 17" value="${esc(f.pedido)}" />
        </label>
        <label class="field">
          <span class="field-label">Desde</span>
          <input class="input" type="date" name="desde" value="${esc(f.desde)}" />
        </label>
        <label class="field">
          <span class="field-label">Hasta</span>
          <input class="input" type="date" name="hasta" value="${esc(f.hasta)}" />
        </label>
        <label class="field">
          <span class="field-label">Estado DIAN</span>
          <select class="select" name="estado_dian">
            <option value="">Todos</option>
            ${Object.keys(ESTADO_DIAN).map(k => `<option value="${k}" ${f.estado_dian === k ? 'selected' : ''}>${ESTADO_DIAN[k].texto}</option>`).join('')}
          </select>
        </label>
        <div class="filtros-acciones">
          <button type="submit" class="btn btn-primary"><i class="fas fa-magnifying-glass" aria-hidden="true"></i> Buscar</button>
          <button type="button" class="btn btn-quiet" id="facturas-limpiar">Limpiar</button>
        </div>
        <div class="atajos-fecha">
          <span class="field-hint">Rápido:</span>
          <button type="button" class="link" data-rango="hoy">Hoy</button>
          <button type="button" class="link" data-rango="7">Últimos 7 días</button>
          <button type="button" class="link" data-rango="mes">Este mes</button>
        </div>
      </form>

      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Factura</th><th>Pedido</th><th>Fecha</th><th>Cliente</th><th class="right">Total</th><th>Pedido</th><th>DIAN</th><th><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody id="facturas-tbody"><tr><td colspan="8"><p class="list-empty">Buscando…</p></td></tr></tbody>
        </table>
        <div class="table-foot" id="facturas-foot"></div>
      </div>
    </section>`;

  const form = document.getElementById('form-facturas');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    f.pedido = form.pedido.value.trim();
    f.desde = form.desde.value;
    f.hasta = form.hasta.value;
    f.estado_dian = form.estado_dian.value;
    buscarFacturas();
  });
  document.getElementById('facturas-limpiar').addEventListener('click', () => {
    fact.filtros = { pedido: '', desde: '', hasta: '', estado_dian: '' };
    vistaFacturas(root);
  });
  // Atajos: llenan el rango de fechas y buscan
  form.querySelectorAll('[data-rango]').forEach(btn => btn.addEventListener('click', () => {
    const hoy = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let desde = new Date(hoy);
    if (btn.dataset.rango === '7') desde.setDate(hoy.getDate() - 6);
    if (btn.dataset.rango === 'mes') desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    form.desde.value = iso(desde);
    form.hasta.value = iso(hoy);
    form.pedido.value = '';
    form.requestSubmit();
  }));

  buscarFacturas();
}

/** RF7 · Pide al servidor las facturas según los filtros y pinta la tabla. */
async function buscarFacturas() {
  const { pedido, desde, hasta, estado_dian } = fact.filtros;
  const tbody = document.getElementById('facturas-tbody');
  const foot = document.getElementById('facturas-foot');

  // Validación rápida en el navegador (el servidor también la hace)
  if (desde && hasta && desde > hasta) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty" style="padding:28px"><h3>Revisa las fechas</h3><p>La fecha "Desde" no puede ser posterior a "Hasta".</p></div></td></tr>';
    foot.textContent = '';
    return;
  }

  const params = new URLSearchParams();
  if (pedido) params.set('pedido', pedido);
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  if (estado_dian) params.set('estado_dian', estado_dian);

  try {
    const res = await window.fetchAPI(`/api/facturas?${params}`);
    if (!res.ok) throw await leerError(res, 'No se pudieron buscar las facturas');
    fact.resultados = (await res.json()).facturas;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty" style="padding:28px"><p>${esc(e.message)}</p></div></td></tr>`;
    return;
  }

  const hayFiltro = pedido || desde || hasta || estado_dian;
  foot.textContent = hayFiltro
    ? `${fact.resultados.length} factura(s) encontradas`
    : `Últimas ${fact.resultados.length} facturas`;

  if (!fact.resultados.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty" style="padding:28px">
      <i class="fas fa-file-circle-question" aria-hidden="true"></i>
      <h3>No encontramos facturas</h3>
      <p>${pedido ? `No hay una factura para el pedido ${esc(pedido)}.` : 'No hay facturas en ese rango de fechas.'} Revisa el número o amplía las fechas.</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = fact.resultados.map(x => `
    <tr>
      <td class="mono"><b>${window.numeroRegistro(x.id_factura)}</b></td>
      <td class="mono">${window.numeroRegistro(x.id_pedido)}</td>
      <td class="mono">${fechaHora(x.fecha_registro || x.fecha_emision)}</td>
      <td><b>${esc(x.cliente || '—')}</b><div class="field-hint">${esc(x.cliente_email || '')}</div></td>
      <td class="right"><b>${window.formatPrecio(x.total)}</b></td>
      <td><span class="status ${x.estado_pedido === 'Devuelto' ? 'status-out' : 'status-ok'}">${x.estado_pedido === 'Devuelto' ? 'Anulada' : 'Vigente'}</span>
        ${x.id_nota ? `<div><a class="link field-hint" href="nota.html?id=${x.id_nota}" target="_blank" rel="noopener">NC-${String(x.id_nota).padStart(4, '0')}</a></div>` : ''}</td>
      <td class="celda-dian">
        <span class="status ${ESTADO_DIAN[x.estado_dian]?.clase || 'status-admin'}">${ESTADO_DIAN[x.estado_dian]?.texto || x.estado_dian}</span>
        ${x.estado_dian === 'Rechazada' && x.motivo_rechazo ? `<div class="motivo-dian" title="${esc(x.motivo_rechazo)}">${esc(x.motivo_rechazo)}</div>` : ''}
        ${x.estado_dian === 'Aceptada' && x.cufe ? `<div class="field-hint mono" title="CUFE ${esc(x.cufe)}">CUFE ${esc(x.cufe.slice(0, 10))}…</div>` : ''}
      </td>
      <td><div class="row-actions">
        ${x.estado_dian !== 'Aceptada' && x.estado_pedido !== 'Devuelto' ? `
          <button type="button" class="icon-btn" data-requiere="facturas:editar" onclick="corregirDocumentoFactura(${x.id_factura})" aria-label="Corregir documento del cliente" title="Corregir cédula/NIT del cliente"><i class="fas fa-id-card"></i></button>
          <button type="button" class="btn btn-secondary btn-sm" data-requiere="facturas:editar" onclick="enviarFacturaDian(${x.id_factura}, this)">${x.estado_dian === 'Pendiente' ? 'Enviar' : 'Reenviar'}</button>` : ''}
        <a class="icon-btn" href="factura.html?id=${x.id_factura}" target="_blank" rel="noopener" aria-label="Abrir factura ${window.numeroRegistro(x.id_factura)}" title="Abrir"><i class="fas fa-eye"></i></a>
        <a class="icon-btn" href="factura.html?id=${x.id_factura}&descargar=1" target="_blank" rel="noopener" aria-label="Descargar factura ${window.numeroRegistro(x.id_factura)} en PDF" title="Descargar PDF"><i class="fas fa-file-arrow-down"></i></a>
      </div></td>
    </tr>`).join('');
  aplicarPermisos(tbody);
}

/** RF5 · Envía o reenvía una factura al servicio de validación (DIAN / proveedor). */
window.enviarFacturaDian = async function(idFactura, boton) {
  if (boton) { boton.disabled = true; boton.textContent = 'Enviando…'; }
  try {
    const res = await window.fetchAPI(`/api/facturas/${idFactura}/enviar`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo enviar la factura');
    window.showToast(data.estado === 'Rechazada' ? `Rechazada: ${data.motivo}` : data.message, data.estado === 'Aceptada' ? 'success' : 'error');
  } catch (e) {
    window.showToast(e.message, 'error');
  }
  buscarFacturas();
};

/** RF5 · Corrige la cédula/NIT del cliente antes de reenviar (p. ej. si la DIAN lo rechazó). */
window.corregirDocumentoFactura = async function(idFactura) {
  const x = fact.resultados.find(f => f.id_factura === idFactura);
  const documento = await pedirTexto({
    titulo: `Documento del cliente · factura ${window.numeroRegistro(idFactura)}`,
    mensaje: `Actual: ${x && x.documento_adquiriente ? x.documento_adquiriente : 'consumidor final (222222222222)'}. Escribe la cédula o NIT, solo números. Para consumidor final escribe 222222222222.`,
    placeholder: '1020304050',
    confirmar: 'Guardar documento'
  });
  if (documento === null) return;
  try {
    const res = await window.fetchAPI(`/api/facturas/${idFactura}/documento`, { method: 'PUT', body: JSON.stringify({ documento }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar el documento');
    window.showToast(data.message);
    buscarFacturas();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};


/* ---------------------------------------------------------------
   ESTADO DEL PEDIDO Y DEL ENVÍO (RF27)
   El encargado lo avanza desde "Ventas recientes"; el cliente lo ve en "Mis compras".
   --------------------------------------------------------------- */

/** Color de cada estado. */
const ESTADO_ENVIO = {
  Pendiente: { clase: 'status-admin' }, Pagado: { clase: 'status-bajo' },
  Enviado: { clase: 'status-bajo' }, Entregado: { clase: 'status-ok' }, Cancelado: { clase: 'status-out' }
};
/** Mismas reglas que el servidor: solo se avanza, y se cancela antes de entregar. */
const SIGUIENTES = {
  Pendiente: ['Pagado', 'Cancelado'], Pagado: ['Enviado', 'Cancelado'], Enviado: ['Entregado'], Entregado: [], Cancelado: []
};

/** RF27 · Diálogo para elegir el nuevo estado (y una nota opcional, p. ej. el número de guía). */
window.cambiarEstadoPedido = function(idPedido) {
  const p = inv.pedidos.find(x => x.id_pedido === idPedido);
  if (!p) return;
  const opciones = SIGUIENTES[p.estado_envio] || [];
  const ayudas = {
    Pagado: 'Se confirmó el pago.', Enviado: 'Salió hacia el cliente (anota la guía).',
    Entregado: 'El cliente lo recibió.', Cancelado: 'Repone el stock y genera la nota crédito.'
  };
  const dlg = document.createElement('dialog');
  dlg.className = 'confirm';
  dlg.innerHTML = `
    <form class="ficha" method="dialog">
      <div class="ficha-head"><h2>Estado del ${window.numeroRegistro(idPedido)}</h2><p>Ahora: <b>${esc(p.estado_envio)}</b></p></div>
      <div class="ficha-body">
        <fieldset style="border:0; display:grid; gap:8px">
          <legend class="field-label" style="margin-bottom:6px">Nuevo estado</legend>
          ${opciones.map((o, i) => `
            <label class="pay-option"><input type="radio" name="estado" value="${o}" ${i === 0 ? 'checked' : ''} />
              <span><b>${o}</b> · ${ayudas[o]}</span></label>`).join('')}
        </fieldset>
        <label class="field" style="margin-top:12px"><span class="field-label">Nota para el cliente (opcional)</span>
          <input class="input" name="nota" maxlength="200" placeholder="Ej. Guía Servientrega 1234567" /></label>
        <div class="confirm-actions">
          <button type="button" class="btn btn-secondary" data-cancelar>Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar estado</button>
        </div>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  const cerrar = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector('[data-cancelar]').addEventListener('click', cerrar);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  dlg.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const estado = form.querySelector('input[name="estado"]:checked').value;
    if (estado === 'Cancelado' && !confirm('¿Cancelar el pedido? Se repone el stock y se genera la nota crédito.')) return;
    try {
      const res = await window.fetchAPI(`/api/pedidos/${idPedido}/estado`, {
        method: 'PUT', body: JSON.stringify({ estado, nota: form.nota.value.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo cambiar el estado');
      cerrar();
      window.showToast(data.message);
      await refrescarInventario();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });
  dlg.showModal();
};


/* ---------------------------------------------------------------
   AVISOS DE STOCK BAJO (RF10) Y STOCK MÍNIMO POR LIBRO (RF11)
   Cómo funciona:
   1. El servidor, cada vez que mueve el stock (venta, ajuste…), compara con el mínimo
      del libro. Si lo cruza hacia abajo, guarda una fila en `notificaciones`.
   2. El panel trae esos avisos junto con el inventario (cada 10 s) y los pinta arriba.
   3. Si aparece uno nuevo mientras miras, sale además un aviso flotante.
   4. El contador rojo del riel ("Inventario") muestra cuántos faltan por leer.
   --------------------------------------------------------------- */

/** RF10 · Trae los avisos al abrir el panel (para el contador del riel). */
async function cargarAlertas() {
  if (!window.puede('inventario')) return;
  try {
    const res = await window.fetchAPI('/api/inventario/notificaciones?limite=30');
    if (!res.ok) return;
    const d = await res.json();
    inv.notificaciones = d.notificaciones;
    inv.sinLeer = d.sinLeer;
  } catch {
    // sin conexión: el contador queda en 0
  }
}

/** RF10 · Lista de avisos dentro de Inventario (los no leídos van resaltados). */
function pintarAlertas() {
  const lista = document.getElementById('inv-alertas');
  if (!lista) return;
  const contador = document.getElementById('inv-alertas-count');
  contador.hidden = !inv.sinLeer;
  contador.textContent = `${inv.sinLeer} sin leer`;
  document.getElementById('inv-alertas-leer').hidden = !inv.sinLeer;
  document.getElementById('inv-min-defecto').textContent = inv.minimoDefecto;

  const visibles = inv.notificaciones.slice(0, 8);
  lista.innerHTML = visibles.length ? visibles.map(n => `
    <li class="${n.leida ? '' : 'alerta-nueva'}">
      <i class="fas ${n.stock_actual === 0 ? 'fa-circle-exclamation' : 'fa-triangle-exclamation'} alerta-icono" aria-hidden="true"></i>
      <div class="grow">
        <b>${esc(n.mensaje)}</b>
        <span>${fechaHora(n.fecha)} · ahora hay ${n.stock_actual} unidad(es)${n.leida ? '' : ' · <strong>Nuevo</strong>'}</span>
      </div>
      ${n.id_libro ? `<a class="btn btn-secondary btn-sm" data-requiere="libros:editar" href="admin.html#libros/${n.id_libro}">Reponer stock</a>` : ''}
      ${n.leida ? '' : `<button type="button" class="btn btn-quiet btn-sm" onclick="leerAlerta(${n.id_notificacion})">Marcar leída</button>`}
    </li>`).join('') : '<li class="list-empty">Sin avisos. Cuando un libro llegue a su stock mínimo aparecerá aquí.</li>';
  aplicarPermisos(lista);
}

/** RF10 · Marca un aviso (o todos, sin id) como leído. */
window.leerAlerta = async function(id = null) {
  try {
    const res = await window.fetchAPI('/api/inventario/notificaciones/leer', {
      method: 'PUT', body: JSON.stringify(id ? { id } : {})
    });
    if (!res.ok) throw await leerError(res, 'No se pudo marcar el aviso');
    await refrescarInventario();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};

/**
 * RF11 · Diálogo para escribir un mínimo. Devuelve el número, `null` si eligió
 * "usar el de por defecto", o `undefined` si canceló.
 */
function pedirMinimo({ titulo, texto, valor, permitirDefecto }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'confirm';
    dlg.innerHTML = `
      <form class="ficha" method="dialog" novalidate>
        <div class="ficha-head"><h2>${esc(titulo)}</h2><p>${texto}</p></div>
        <div class="ficha-body">
          <label class="field"><span class="field-label">Stock mínimo (unidades)</span>
            <input class="input num" name="minimo" type="number" min="0" max="9999" step="1" value="${valor ?? ''}" required /></label>
          ${permitirDefecto ? `<label class="check" style="margin-top:10px"><input type="checkbox" name="defecto" ${valor == null ? 'checked' : ''} />
            <span>Usar el mínimo por defecto (${inv.minimoDefecto})</span></label>` : ''}
          <p class="field-error" data-error hidden></p>
          <div class="confirm-actions">
            <button type="button" class="btn btn-secondary" data-cancelar>Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const cerrar = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    const casilla = form.defecto;
    if (casilla) {
      const sync = () => { form.minimo.disabled = casilla.checked; };
      casilla.addEventListener('change', sync);
      sync();
    }
    dlg.querySelector('[data-cancelar]').addEventListener('click', () => cerrar(undefined));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(undefined); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (casilla?.checked) return cerrar(null);
      const n = Number(form.minimo.value);
      if (form.minimo.value === '' || !Number.isInteger(n) || n < 0 || n > 9999) {
        const err = form.querySelector('[data-error]');
        err.textContent = 'Escribe un número entero entre 0 y 9999.';
        err.hidden = false;
        form.minimo.focus();
        return;
      }
      cerrar(n);
    });
    dlg.showModal();
    form.minimo.focus();
  });
}

/** RF11 · Cambiar el mínimo de UN libro (desde la tabla del inventario). */
window.editarMinimo = async function(idLibro) {
  const l = inv.libros.find(x => x.id_libro === idLibro);
  if (!l) return;
  const minimo = await pedirMinimo({
    titulo: `Stock mínimo · ${l.titulo}`,
    texto: `Hay <b>${l.stock}</b> en stock. Cuando llegue a este número o menos, el panel avisará.`,
    valor: l.minimo_propio, permitirDefecto: true
  });
  if (minimo === undefined) return;
  try {
    const res = await window.fetchAPI(`/api/inventario/minimo/${idLibro}`, { method: 'PUT', body: JSON.stringify({ minimo }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar el mínimo');
    window.showToast(data.message);
    await refrescarInventario();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};

/** RF11 · Cambiar el mínimo por defecto (para todos los libros sin mínimo propio). */
window.editarMinimoDefecto = async function() {
  const minimo = await pedirMinimo({
    titulo: 'Mínimo por defecto',
    texto: 'Se usa en todos los libros que no tienen un mínimo propio.',
    valor: inv.minimoDefecto, permitirDefecto: false
  });
  if (minimo === undefined) return;
  try {
    const res = await window.fetchAPI('/api/inventario/minimo-defecto', { method: 'PUT', body: JSON.stringify({ minimo }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar el mínimo');
    window.showToast(data.message);
    await refrescarInventario();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};

/* ---------------------------------------------------------------
   TABLERO DE INDICADORES EN TIEMPO REAL (RF19) · solo administrador
   Va arriba del Resumen. Se pide /api/reportes/kpis al entrar y luego cada minuto
   (solo si la pestaña está visible). Al salir del Resumen, detenerKpis() lo apaga.
   --------------------------------------------------------------- */

const KPIS_CADA_MS = 60000;
const kpi = { timer: null };

function detenerKpis() {
  if (kpi.timer) clearInterval(kpi.timer);
  kpi.timer = null;
}

async function iniciarKpis() {
  detenerKpis();
  await pintarKpis();
  kpi.timer = setInterval(() => {
    if (document.visibilityState === 'visible') pintarKpis();
  }, KPIS_CADA_MS);
}

async function pintarKpis() {
  const caja = document.getElementById('kpis');
  if (!caja) return;
  try {
    const res = await window.fetchAPI('/api/reportes/kpis');
    if (!res.ok) throw await leerError(res, 'No se pudieron cargar los indicadores');
    const k = await res.json();
    if (!document.getElementById('kpis')) return;   // saliste mientras cargaba
    const hora = new Date(k.actualizado).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const dif = k.ventasHoy.total - k.ventasHoy.ayer;
    const comparacion = k.ventasHoy.ayer
      ? `${dif >= 0 ? '▲' : '▼'} ${window.formatPrecio(Math.abs(dif))} frente a ayer`
      : 'Ayer no hubo ventas';
    const maxUnid = Math.max(1, ...k.masVendidos.map(x => x.unidades));

    caja.innerHTML = `
      <div class="panel-head">
        <h2>Tablero en vivo</h2>
        <p class="field-hint"><span class="en-vivo" aria-hidden="true"></span> Actualizado a las ${hora} · se refresca cada minuto
          <button type="button" class="link" onclick="pintarKpis()">Actualizar</button></p>
      </div>
      <div class="kpis">
        <div class="kpi">
          <span class="kpi-label">Ventas de hoy</span>
          <b class="kpi-valor">${window.formatPrecio(k.ventasHoy.total)}</b>
          <span class="kpi-pie">${k.ventasHoy.pedidos} pedido(s) · ${comparacion}</span>
        </div>
        <a class="kpi ${k.pendientes.total ? 'kpi-atencion' : ''}" href="admin.html#inventario">
          <span class="kpi-label">Pedidos por despachar</span>
          <b class="kpi-valor">${k.pendientes.total}</b>
          <span class="kpi-pie">Pendientes o pagados, sin enviar</span>
        </a>
        <a class="kpi ${k.tickets.total ? 'kpi-atencion' : ''}" href="admin.html#${k.tickets.casos ? 'soporte' : (k.tickets.devoluciones ? 'inventario' : 'facturas')}">
          <span class="kpi-label">Tickets abiertos</span>
          <b class="kpi-valor">${k.tickets.total}</b>
          <span class="kpi-pie">${k.tickets.casos} caso(s) de clientes · ${k.tickets.devoluciones} devolución(es) · ${k.tickets.facturasRechazadas} factura(s) rechazada(s)</span>
        </a>
        <a class="kpi ${k.stockBajo ? 'kpi-atencion' : ''}" href="admin.html#inventario">
          <span class="kpi-label">Libros con stock bajo</span>
          <b class="kpi-valor">${k.stockBajo}</b>
          <span class="kpi-pie">${k.notificacionesSinLeer} aviso(s) sin leer</span>
        </a>
      </div>
      <div class="admin-cols kpis-listas">
        <div>
          <h3 class="field-label">Más vendidos · últimos 30 días</h3>
          ${k.masVendidos.length ? `<ol class="barras">${k.masVendidos.map(x => `
            <li title="${esc(x.titulo)}: ${x.unidades} unidad(es)">
              <span class="barras-nombre">${esc(x.titulo)}</span>
              <span class="barras-pista"><span style="width:${(x.unidades / maxUnid) * 100}%"></span></span>
              <span class="num">${x.unidades}</span>
            </li>`).join('')}</ol>` : '<p class="list-empty">Sin ventas en los últimos 30 días.</p>'}
        </div>
        <div>
          <h3 class="field-label">Pedidos esperando despacho</h3>
          ${k.pendientes.lista.length ? `<ul class="list list-compacta">${k.pendientes.lista.map(p => `
            <li><div class="grow"><b>${window.numeroRegistro(p.id_pedido)} · ${esc(p.cliente || 'Cliente')}</b><span>${fechaHora(p.fecha_registro)}</span></div>
              <span class="status ${p.estado_envio === 'Pagado' ? 'status-bajo' : 'status-admin'}">${esc(p.estado_envio)}</span></li>`).join('')}</ul>`
            : '<p class="list-empty">Todo despachado.</p>'}
        </div>
      </div>`;
  } catch (e) {
    caja.innerHTML = `<p class="list-empty">${esc(e.message)} · se reintentará en un minuto.</p>`;
  }
}
window.pintarKpis = pintarKpis;

/* ---------------------------------------------------------------
   REPORTES (RF8, RF6, RF20)
   Tres pestañas; cada una se ve solo si el rol tiene el permiso:
     Movimientos de stock   -> inventario:ver  (RF8)
     Por usuario            -> facturas:ver    (RF6)
     Estadísticas           -> reportes:editar (RF20)
   Exportar:
     Excel -> se arma un CSV (separado por ";" y con BOM para que Excel lea las tildes)
     PDF   -> window.print(); el CSS de impresión deja solo el reporte (Guardar como PDF)
   --------------------------------------------------------------- */

const rep = {
  pestana: null,
  filtros: { desde: '', hasta: '', libro: '', usuario: '', agrupar: 'dia' },
  datos: null,
  grafica: null
};

const PESTANAS_REPORTE = [
  { id: 'movimientos', nombre: 'Movimientos de stock', permiso: ['inventario', 'ver'], icono: 'fa-right-left' },
  { id: 'usuario', nombre: 'Por usuario', permiso: ['facturas', 'ver'], icono: 'fa-user' },
  { id: 'estadisticas', nombre: 'Estadísticas', permiso: ['reportes', 'editar'], icono: 'fa-chart-column' }
];

/** Fecha local en AAAA-MM-DD. */
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function vistaReportes(root, param) {
  const permitidas = PESTANAS_REPORTE.filter(p => window.puede(...p.permiso));
  if (!permitidas.length) { root.innerHTML = accesoDenegado('reportes'); return; }
  rep.pestana = permitidas.find(p => p.id === param) || permitidas[0];
  if (!rep.filtros.desde) {   // por defecto: este mes
    const hoy = new Date();
    rep.filtros.desde = isoDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    rep.filtros.hasta = isoDia(hoy);
  }
  const f = rep.filtros;
  const id = rep.pestana.id;

  root.innerHTML = `
    <section class="admin-section reporte">
      <header class="page-head">
        <div><h1>Reportes</h1><p>${{ movimientos: 'Entradas, ventas y devoluciones de cada libro.', usuario: 'Compras, devoluciones y notas de un cliente.', estadisticas: 'Ventas, ingresos e inventario en un periodo.' }[id]}</p></div>
        <div class="actions no-imprimir">
          <button type="button" class="btn btn-secondary" id="rep-excel"><i class="fas fa-file-excel" aria-hidden="true"></i> Excel</button>
          <button type="button" class="btn btn-secondary" id="rep-pdf"><i class="fas fa-file-pdf" aria-hidden="true"></i> PDF</button>
        </div>
      </header>

      <nav class="tabs-reporte no-imprimir" aria-label="Tipo de reporte">
        ${permitidas.map(p => `<a href="admin.html#reportes/${p.id}" ${p.id === id ? 'aria-current="page"' : ''}><i class="fas ${p.icono}" aria-hidden="true"></i> ${p.nombre}</a>`).join('')}
      </nav>

      <form class="panel filtros-facturas filtros-reporte no-imprimir" id="form-reporte" novalidate>
        ${id === 'usuario' ? `<label class="field"><span class="field-label">Usuario</span>
          <select class="select" name="usuario" required><option value="">Cargando…</option></select></label>` : ''}
        ${id === 'movimientos' ? `<label class="field"><span class="field-label">Libro</span>
          <select class="select" name="libro"><option value="">Todos los libros</option></select></label>` : ''}
        ${id === 'estadisticas' ? `<label class="field"><span class="field-label">Agrupar por</span>
          <select class="select" name="agrupar"><option value="dia" ${f.agrupar === 'dia' ? 'selected' : ''}>Día</option><option value="mes" ${f.agrupar === 'mes' ? 'selected' : ''}>Mes</option></select></label>` : ''}
        <label class="field"><span class="field-label">Desde</span><input class="input" type="date" name="desde" value="${esc(f.desde)}" /></label>
        <label class="field"><span class="field-label">Hasta</span><input class="input" type="date" name="hasta" value="${esc(f.hasta)}" /></label>
        <div class="filtros-acciones"><button type="submit" class="btn btn-primary"><i class="fas fa-magnifying-glass" aria-hidden="true"></i> Generar</button></div>
        <div class="atajos-fecha">
          <span class="field-hint">Rápido:</span>
          <button type="button" class="link" data-rango="hoy">Hoy</button>
          <button type="button" class="link" data-rango="7">Últimos 7 días</button>
          <button type="button" class="link" data-rango="mes">Este mes</button>
          <button type="button" class="link" data-rango="anio">Este año</button>
          <button type="button" class="link" data-rango="todo">Todo</button>
        </div>
      </form>

      <p class="reporte-titulo-impreso">Librería Adrián · ${esc(rep.pestana.nombre)} · <span id="rep-rango"></span></p>
      <div id="rep-cuerpo"><p class="list-empty">Generando reporte…</p></div>
    </section>`;

  const form = document.getElementById('form-reporte');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.desde.value && form.hasta.value && form.desde.value > form.hasta.value) {
      window.showToast('La fecha "desde" no puede ser posterior a "hasta".', 'error');
      return;
    }
    f.desde = form.desde.value;
    f.hasta = form.hasta.value;
    if (form.libro) f.libro = form.libro.value;
    if (form.usuario) f.usuario = form.usuario.value;
    if (form.agrupar) f.agrupar = form.agrupar.value;
    generarReporte();
  });
  form.querySelectorAll('[data-rango]').forEach(btn => btn.addEventListener('click', () => {
    const hoy = new Date();
    let desde = new Date(hoy);
    const r = btn.dataset.rango;
    if (r === '7') desde.setDate(hoy.getDate() - 6);
    if (r === 'mes') desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    if (r === 'anio') desde = new Date(hoy.getFullYear(), 0, 1);
    form.desde.value = r === 'todo' ? '' : isoDia(desde);
    form.hasta.value = r === 'todo' ? '' : isoDia(hoy);
    form.requestSubmit();
  }));
  form.querySelector('select[name="libro"], select[name="usuario"]')?.addEventListener('change', () => form.requestSubmit());
  document.getElementById('rep-excel').addEventListener('click', exportarExcel);
  document.getElementById('rep-pdf').addEventListener('click', () => window.print());

  if (id === 'usuario') cargarSelectorUsuarios(form);
  else generarReporte();
}

/** RF6 · Llena el selector de usuarios y, si ya había uno elegido, genera el reporte. */
async function cargarSelectorUsuarios(form) {
  const sel = form.usuario;
  try {
    const res = await window.fetchAPI('/api/reportes/usuarios');
    if (!res.ok) throw await leerError(res, 'No se pudieron cargar los usuarios');
    const usuarios = await res.json();
    sel.innerHTML = '<option value="">Elige un usuario…</option>' + usuarios.map(u =>
      `<option value="${u.id}" ${String(u.id) === String(rep.filtros.usuario) ? 'selected' : ''}>${esc(u.nombre)} · ${esc(u.email)} (${u.pedidos} pedido${u.pedidos === 1 ? '' : 's'})</option>`).join('');
    if (rep.filtros.usuario) generarReporte();
    else document.getElementById('rep-cuerpo').innerHTML = '<div class="panel"><div class="empty"><i class="fas fa-user" aria-hidden="true"></i><p>Elige un usuario para ver sus compras, devoluciones y notas.</p></div></div>';
  } catch (e) {
    document.getElementById('rep-cuerpo').innerHTML = `<p class="list-empty">${esc(e.message)}</p>`;
  }
}

/** Arma la URL según la pestaña y los filtros, la pide y pinta el resultado. */
async function generarReporte() {
  const f = rep.filtros;
  const id = rep.pestana.id;
  const cuerpo = document.getElementById('rep-cuerpo');
  const q = new URLSearchParams();
  if (f.desde) q.set('desde', f.desde);
  if (f.hasta) q.set('hasta', f.hasta);
  let url;
  if (id === 'movimientos') { if (f.libro) q.set('libro', f.libro); url = `/api/reportes/movimientos?${q}`; }
  if (id === 'usuario') url = `/api/reportes/usuario/${f.usuario}?${q}`;
  if (id === 'estadisticas') { q.set('agrupar', f.agrupar); url = `/api/reportes/estadisticas?${q}`; }

  document.getElementById('rep-rango').textContent =
    f.desde || f.hasta ? `${f.desde ? fecha(`${f.desde}T00:00`) : 'el inicio'} a ${f.hasta ? fecha(`${f.hasta}T00:00`) : 'hoy'}` : 'todo el historial';
  cuerpo.innerHTML = '<p class="list-empty">Generando reporte…</p>';
  try {
    const res = await window.fetchAPI(url);
    if (!res.ok) throw await leerError(res, 'No se pudo generar el reporte');
    rep.datos = await res.json();
    if (!document.getElementById('rep-cuerpo')) return;
    if (id === 'movimientos') pintarReporteMovimientos();
    if (id === 'usuario') pintarReporteUsuario();
    if (id === 'estadisticas') await pintarEstadisticas();
  } catch (e) {
    cuerpo.innerHTML = `<div class="panel"><div class="empty"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i><p>${esc(e.message)}</p></div></div>`;
  }
}

/** RF8 · Resumen por libro + detalle de cada movimiento. */
function pintarReporteMovimientos() {
  const d = rep.datos;
  const sel = document.querySelector('#form-reporte select[name="libro"]');
  if (sel && sel.options.length <= 1) {
    sel.innerHTML = '<option value="">Todos los libros</option>' + d.libros.map(l =>
      `<option value="${l.id_libro}" ${String(l.id_libro) === String(rep.filtros.libro) ? 'selected' : ''}>${esc(l.titulo)}</option>`).join('');
  }
  const t = d.totales;
  const tipoClase = { Venta: 'status-admin', 'Devolución': 'status-ok', Alta: 'status-ok', Ajuste: 'status-bajo' };
  document.getElementById('rep-cuerpo').innerHTML = `
    <div class="summary-strip">
      <div><b>${t.entradas}</b><span>Entradas (altas y ajustes +)</span></div>
      <div><b>${t.ventas}</b><span>Unidades vendidas</span></div>
      <div><b>${t.devoluciones}</b><span>Unidades devueltas al stock</span></div>
      <div><b>${t.salidas_ajuste}</b><span>Salidas por ajuste</span></div>
    </div>
    <h2 class="reporte-sub">Por libro</h2>
    <div class="table-wrap" style="margin-bottom:26px">
      <table class="table" id="tabla-rep-principal">
        <thead><tr><th>Libro</th><th class="right">Entradas</th><th class="right">Ventas</th><th class="right">Devoluciones</th><th class="right">Salidas ajuste</th><th class="right">Stock actual</th></tr></thead>
        <tbody>${d.resumen.length ? d.resumen.map(r => `
          <tr><td><b>${esc(r.titulo)}</b><div class="field-hint">${esc(r.autor || '')}</div></td>
            <td class="right num">${r.entradas}</td><td class="right num">${r.ventas}</td><td class="right num">${r.devoluciones}</td>
            <td class="right num">${r.salidas_ajuste}</td><td class="right num">${r.stock_actual}</td></tr>`).join('')
          : '<tr><td colspan="6"><p class="list-empty">No hubo movimientos en ese rango.</p></td></tr>'}</tbody>
      </table>
    </div>
    <h2 class="reporte-sub">Detalle (${d.detalle.length}${d.detalle.length === 1000 ? ', primeros 1000' : ''})</h2>
    <div class="table-wrap">
      <table class="table" id="tabla-rep-detalle">
        <thead><tr><th>Fecha</th><th>Libro</th><th>Tipo</th><th class="right">Cantidad</th><th class="right">Stock</th><th>Pedido</th><th>Usuario</th></tr></thead>
        <tbody>${d.detalle.length ? d.detalle.map(m => `
          <tr><td class="mono">${fechaHora(m.fecha_movimiento)}</td><td>${esc(m.titulo)}</td>
            <td><span class="status ${tipoClase[m.tipo_movimiento] || ''}">${esc(m.tipo_movimiento)}</span></td>
            <td class="right num">${m.stock_nuevo >= m.stock_anterior ? '+' : '−'}${m.cantidad}</td>
            <td class="right num">${m.stock_anterior} → ${m.stock_nuevo}</td>
            <td class="mono">${m.id_pedido ? window.numeroRegistro(m.id_pedido) : '—'}</td><td>${esc(m.usuario_nombre || '—')}</td></tr>`).join('')
          : '<tr><td colspan="7"><p class="list-empty">Sin movimientos.</p></td></tr>'}</tbody>
      </table>
    </div>`;
}

/** RF6 · Transacciones de un usuario. */
function pintarReporteUsuario() {
  const d = rep.datos;
  const t = d.totales;
  const u = d.usuario;
  document.getElementById('rep-cuerpo').innerHTML = `
    <div class="panel reporte-usuario">
      <div><b>${esc(u.nombre)}</b><span>${esc(u.email)}${u.cedula ? ` · C.C. ${esc(u.cedula)}` : ''} · rol ${esc(u.rol)} · cliente desde ${fecha(u.fecha_registro)}</span></div>
    </div>
    <div class="summary-strip">
      <div><b>${t.compras}</b><span>Compras</span></div>
      <div><b>${window.formatPrecio(t.comprado)}</b><span>Total comprado</span></div>
      <div class="${t.devoluciones ? 'warn' : ''}"><b>${t.devoluciones}</b><span>Solicitudes de devolución</span></div>
      <div><b>${window.formatPrecio(t.devuelto)}</b><span>Devuelto en notas crédito</span></div>
      <div><b>${window.formatPrecio(t.neto)}</b><span>Neto</span></div>
    </div>
    <h2 class="reporte-sub">Compras</h2>
    <div class="table-wrap" style="margin-bottom:26px">
      <table class="table" id="tabla-rep-principal">
        <thead><tr><th>Pedido</th><th>Fecha</th><th>Libros</th><th class="right">Unid.</th><th class="right">Total</th><th>Estado</th><th>Factura</th></tr></thead>
        <tbody>${d.compras.length ? d.compras.map(c => `
          <tr><td class="mono">${window.numeroRegistro(c.id_pedido)}</td><td class="mono">${fechaHora(c.fecha_registro)}</td>
            <td>${esc(c.libros || '—')}</td><td class="right num">${c.unidades}</td><td class="right num">${window.formatPrecio(c.total)}</td>
            <td><span class="status ${c.estado === 'Devuelto' ? 'status-out' : 'status-ok'}">${esc(c.estado === 'Devuelto' ? 'Devuelto' : (c.estado_envio || c.estado))}</span></td>
            <td>${c.id_factura ? `<a class="link" href="factura.html?id=${c.id_factura}" target="_blank" rel="noopener">${esc(c.numero_fe || 'Ver')}</a>` : '—'}</td></tr>`).join('')
          : '<tr><td colspan="7"><p class="list-empty">Sin compras en ese rango.</p></td></tr>'}</tbody>
      </table>
    </div>
    <div class="admin-cols">
      <section>
        <h2 class="reporte-sub">Devoluciones</h2>
        <div class="table-wrap">
          <table class="table" id="tabla-rep-devoluciones">
            <thead><tr><th>Pedido</th><th>Fecha</th><th>Motivo</th><th>Estado</th></tr></thead>
            <tbody>${d.devoluciones.length ? d.devoluciones.map(s => `
              <tr><td class="mono">${window.numeroRegistro(s.id_pedido)}</td><td class="mono">${fechaHora(s.fecha_solicitud)}</td>
                <td>${esc(s.motivo)}${s.estado_libro ? `<div class="field-hint">Libro: ${esc(s.estado_libro)}</div>` : ''}</td>
                <td><span class="status ${s.estado === 'Aprobada' ? 'status-ok' : (s.estado === 'Rechazada' ? 'status-out' : 'status-bajo')}">${esc(s.estado)}</span></td></tr>`).join('')
              : '<tr><td colspan="4"><p class="list-empty">Sin devoluciones.</p></td></tr>'}</tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 class="reporte-sub">Notas crédito / débito</h2>
        <div class="table-wrap">
          <table class="table" id="tabla-rep-notas">
            <thead><tr><th>Nota</th><th>Fecha</th><th>Pedido</th><th class="right">Total</th></tr></thead>
            <tbody>${d.notas.length ? d.notas.map(n => `
              <tr><td><a class="link" href="nota.html?id=${n.id_nota}" target="_blank" rel="noopener">${esc(n.tipo)} ${window.numeroRegistro(n.id_nota)}</a></td>
                <td class="mono">${fechaHora(n.fecha_registro)}</td><td class="mono">${window.numeroRegistro(n.id_pedido)}</td>
                <td class="right num">${window.formatPrecio(n.total)}</td></tr>`).join('')
              : '<tr><td colspan="4"><p class="list-empty">Sin notas.</p></td></tr>'}</tbody>
          </table>
        </div>
      </section>
    </div>`;
}

/** Carga Chart.js (cdnjs) solo la primera vez que se necesita. */
let chartJsPromesa = null;
function cargarChartJs() {
  if (window.Chart) return Promise.resolve();
  chartJsPromesa ??= new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    sc.onload = resolve;
    sc.onerror = () => { chartJsPromesa = null; reject(new Error('No se pudo cargar la librería de gráficas')); };
    document.head.appendChild(sc);
  });
  return chartJsPromesa;
}

/** RF20 · Estadísticas: ingresos, ventas por periodo (gráfica + tabla), más vendidos e inventario. */
async function pintarEstadisticas() {
  const d = rep.datos;
  const ing = d.ingresos;
  const inv20 = d.inventario;
  const totalLibros = inv20.normal + inv20.bajo + inv20.agotado || 1;
  const maxUnid = Math.max(1, ...d.masVendidos.map(x => x.unidades));
  const etiquetaPeriodo = (p) => rep.filtros.agrupar === 'mes'
    ? new Date(`${p}-01T00:00`).toLocaleDateString('es-CO', { month: 'short', year: 'numeric' })
    : new Date(`${p}T00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

  document.getElementById('rep-cuerpo').innerHTML = `
    <div class="summary-strip">
      <div><b>${window.formatPrecio(ing.total)}</b><span>Facturado (${ing.facturas} factura${ing.facturas === 1 ? '' : 's'})</span></div>
      <div><b>${window.formatPrecio(ing.credito)}</b><span>Notas crédito (devoluciones)</span></div>
      <div><b>${window.formatPrecio(ing.neto)}</b><span>Ingreso neto</span></div>
      <div><b>${window.formatPrecio(ing.envios)}</b><span>Cobrado en envíos</span></div>
      <div><b>${d.porPeriodo.reduce((s, p) => s + p.pedidos, 0)}</b><span>Pedidos vendidos</span></div>
    </div>

    <section class="panel" style="margin-bottom:26px">
      <div class="panel-head"><h2>Ingresos por ${rep.filtros.agrupar === 'mes' ? 'mes' : 'día'}</h2></div>
      ${d.porPeriodo.length ? `<div class="grafica"><canvas id="grafica-ventas" role="img" aria-label="Ingresos por periodo; los valores están en la tabla de abajo"></canvas></div>` : '<p class="list-empty">No hubo ventas en ese rango.</p>'}
      <div class="table-wrap" style="margin-top:14px">
        <table class="table" id="tabla-rep-principal">
          <thead><tr><th>Periodo</th><th class="right">Pedidos</th><th class="right">Ingresos</th></tr></thead>
          <tbody>${d.porPeriodo.map(p => `<tr><td>${etiquetaPeriodo(p.periodo)}</td><td class="right num">${p.pedidos}</td><td class="right num">${window.formatPrecio(p.ingresos)}</td></tr>`).join('')
            || '<tr><td colspan="3"><p class="list-empty">Sin datos.</p></td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <div class="admin-cols">
      <section class="panel">
        <div class="panel-head"><h2>Libros más vendidos</h2></div>
        ${d.masVendidos.length ? `<ol class="barras" id="tabla-rep-top">${d.masVendidos.map(x => `
          <li title="${esc(x.titulo)}: ${x.unidades} unidad(es) · ${window.formatPrecio(x.ingresos)}">
            <span class="barras-nombre">${esc(x.titulo)}</span>
            <span class="barras-pista"><span style="width:${(x.unidades / maxUnid) * 100}%"></span></span>
            <span class="num">${x.unidades}</span>
          </li>`).join('')}</ol>` : '<p class="list-empty">Sin ventas en ese rango.</p>'}
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Estado del inventario (hoy)</h2></div>
        <div class="barra-estado" role="img" aria-label="${inv20.normal} normales, ${inv20.bajo} con stock bajo, ${inv20.agotado} agotados">
          <span class="seg-ok" style="flex:${inv20.normal}"></span><span class="seg-bajo" style="flex:${inv20.bajo}"></span><span class="seg-out" style="flex:${inv20.agotado}"></span>
        </div>
        <ul class="list list-compacta">
          <li><span class="status status-ok">Normal</span><div class="grow"></div><b class="num">${inv20.normal}</b><span class="field-hint">${Math.round(inv20.normal / totalLibros * 100)}%</span></li>
          <li><span class="status status-bajo">Stock bajo</span><div class="grow"></div><b class="num">${inv20.bajo}</b><span class="field-hint">${Math.round(inv20.bajo / totalLibros * 100)}%</span></li>
          <li><span class="status status-out">Agotado</span><div class="grow"></div><b class="num">${inv20.agotado}</b><span class="field-hint">${Math.round(inv20.agotado / totalLibros * 100)}%</span></li>
          <li><div class="grow"><b>${inv20.unidades} unidades en bodega</b><span>Valor a precio de venta: ${window.formatPrecio(inv20.valor)}</span></div></li>
        </ul>
      </section>
    </div>`;

  if (!d.porPeriodo.length) return;
  try {
    await cargarChartJs();
  } catch (e) {
    document.querySelector('.grafica').innerHTML = `<p class="list-empty">${esc(e.message)}; los datos están en la tabla.</p>`;
    return;
  }
  const lienzo = document.getElementById('grafica-ventas');
  if (!lienzo) return;
  if (rep.grafica) rep.grafica.destroy();
  const css = getComputedStyle(document.documentElement);
  const tinta = css.getPropertyValue('--ink-900').trim() || '#1c2b4a';
  const texto = css.getPropertyValue('--text-3').trim() || '#636c7e';
  const linea = css.getPropertyValue('--line-soft').trim() || '#e7eaef';
  // Una sola serie: sin leyenda (el título la nombra), barras finas, rejilla tenue y tooltip al pasar el mouse
  rep.grafica = new window.Chart(lienzo, {
    type: 'bar',
    data: {
      labels: d.porPeriodo.map(p => etiquetaPeriodo(p.periodo)),
      datasets: [{ label: 'Ingresos', data: d.porPeriodo.map(p => Number(p.ingresos)), backgroundColor: tinta, borderRadius: 4, maxBarThickness: 36 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${window.formatPrecio(c.parsed.y)} · ${d.porPeriodo[c.dataIndex].pedidos} pedido(s)` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: texto } },
        y: { beginAtZero: true, border: { display: false }, grid: { color: linea }, ticks: { color: texto, callback: (v) => window.formatPrecio(v) } }
      }
    }
  });
}

/**
 * Exportar a Excel: convierte las tablas visibles del reporte a CSV.
 * ";" como separador y BOM (﻿) para que Excel en español abra bien columnas y tildes.
 */
function exportarExcel() {
  const tablas = [...document.querySelectorAll('#rep-cuerpo table')];
  if (!tablas.length) { window.showToast('Genera el reporte primero.', 'error'); return; }
  const celda = (t) => {
    const v = t.replace(/\s+/g, ' ').trim();
    return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lineas = [`Librería Adrián;${rep.pestana.nombre};${document.getElementById('rep-rango').textContent}`, ''];
  tablas.forEach(tabla => {
    const titulo = tabla.closest('section, .table-wrap')?.previousElementSibling?.textContent
      || tabla.closest('section')?.querySelector('h2')?.textContent || '';
    if (titulo) lineas.push(celda(titulo));
    tabla.querySelectorAll('tr').forEach(tr => {
      const celdas = [...tr.children];
      if (celdas.length === 1 && celdas[0].colSpan > 1) return;   // fila de "sin datos"
      lineas.push(celdas.map(c => celda(c.innerText.replace(/\s*\n\s*/g, ' · '))).join(';'));   // innerText: el texto tal como se ve
    });
    lineas.push('');
  });
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `reporte-${rep.pestana.id}-${rep.filtros.desde || 'inicio'}-a-${rep.filtros.hasta || 'hoy'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}


/* ---------------------------------------------------------------
   RESEÑAS · MODERACIÓN (RF21)
   Las reseñas nuevas llegan "Pendientes" (RF29). Aquí se aprueban, se rechazan
   (con un motivo opcional que ve el lector) o se eliminan. Solo las aprobadas
   salen en la ficha del libro y cuentan para sus estrellas.
   --------------------------------------------------------------- */
const ESTADO_RESENA = {
  Pendiente: { clase: 'status-bajo', titulo: 'Pendientes' },
  Aprobada: { clase: 'status-ok', titulo: 'Aprobadas' },
  Rechazada: { clase: 'status-out', titulo: 'Rechazadas' }
};

function vistaResenas(root) {
  if (!estado.cargado.resenas) { root.innerHTML = errorConexion('las reseñas'); return; }
  const f = estado.filtros.resenas;
  f.estado ??= 'Pendiente';
  const cuenta = (e) => estado.resenas.filter(r => r.estado === e).length;
  const aprobadas = estado.resenas.filter(r => r.estado === 'Aprobada');
  const media = aprobadas.length ? nota(aprobadas.reduce((s, r) => s + parseFloat(r.calificacion || 0), 0) / aprobadas.length) : '—';
  const libros = [...new Set(estado.resenas.map(r => r.libro_titulo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  root.innerHTML = `
    <section class="admin-section">
      <header class="page-head">
        <div><h1>Reseñas</h1><p>${cuenta('Pendiente')} por revisar · ${aprobadas.length} publicadas · media ${media}</p></div>
      </header>
      <nav class="tabs-reporte" aria-label="Estado de las reseñas">
        ${Object.keys(ESTADO_RESENA).map(e => `<a href="#" data-estado="${e}" ${f.estado === e ? 'aria-current="page"' : ''}>${ESTADO_RESENA[e].titulo} <span class="field-hint">(${cuenta(e)})</span></a>`).join('')}
      </nav>
      <div class="toolbar">
        <label class="search"><span class="sr-only">Buscar reseñas</span><i class="fas fa-magnifying-glass" aria-hidden="true"></i>
          <input type="search" class="input" id="r-q" placeholder="Texto o lector" value="${esc(f.q)}" /></label>
        <label><span class="sr-only">Libro</span><select class="select" id="r-libro">
          <option value="">Todos los libros</option>
          ${libros.map(t => `<option ${f.libro === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select></label>
      </div>
      <ul class="panel list moderacion" id="resenas-lista"></ul>
    </section>`;

  const pintar = () => {
    f.q = document.getElementById('r-q').value;
    f.libro = document.getElementById('r-libro').value;
    const q = f.q.trim().toLowerCase();
    const filas = estado.resenas.filter(r => r.estado === f.estado &&
      (!q || `${r.reseña || ''} ${r.usuario_nombre}`.toLowerCase().includes(q)) &&
      (!f.libro || r.libro_titulo === f.libro));
    const lista = document.getElementById('resenas-lista');
    lista.innerHTML = filas.length ? filas.map(r => `
      <li>
        <div class="grow">
          <b>${esc(r.libro_titulo || 'Libro eliminado')}</b>
          <span>${esc(r.usuario_nombre)} · ${fecha(r.fecha)} · <span class="rating"><i class="fas fa-star" aria-hidden="true"></i>${nota(r.calificacion)}</span></span>
          <p class="quote">${r.reseña ? esc(r.reseña) : '<i>Sin comentario, solo calificación.</i>'}</p>
          ${r.estado !== 'Pendiente' && r.moderador ? `<span class="field-hint">${r.estado} por ${esc(r.moderador)} el ${fecha(r.fecha_moderacion)}${r.motivo_moderacion ? ` · Motivo: ${esc(r.motivo_moderacion)}` : ''}</span>` : ''}
        </div>
        <div class="moderar-acciones">
          ${r.estado !== 'Aprobada' ? `<button type="button" class="btn btn-primary btn-sm" data-requiere="resenas:editar" onclick="moderarResena(${r.id_reseña}, 'aprobar')"><i class="fas fa-check" aria-hidden="true"></i> Aprobar</button>` : ''}
          ${r.estado !== 'Rechazada' ? `<button type="button" class="btn btn-secondary btn-sm" data-requiere="resenas:editar" onclick="moderarResena(${r.id_reseña}, 'rechazar')"><i class="fas fa-ban" aria-hidden="true"></i> Rechazar</button>` : ''}
          <button type="button" class="icon-btn danger" data-requiere="resenas:editar" onclick="eliminarResena(${r.id_reseña})" aria-label="Eliminar reseña" title="Eliminar"><i class="fas fa-trash-can"></i></button>
        </div>
      </li>`).join('') : `<li class="list-empty">${f.estado === 'Pendiente' ? 'No hay reseñas esperando aprobación.' : 'Ninguna reseña en esta lista.'}</li>`;
    aplicarPermisos(lista);
  };
  pintar();
  document.getElementById('r-q').addEventListener('input', pintar);
  document.getElementById('r-libro').addEventListener('input', pintar);
  root.querySelectorAll('[data-estado]').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    f.estado = a.dataset.estado;
    vistaResenas(root);
    aplicarPermisos(root);
  }));
}

/** RF21 · Aprobar o rechazar (al rechazar se puede escribir el motivo). */
window.moderarResena = async function(id, decision) {
  let motivo = '';
  if (decision === 'rechazar') {
    motivo = await pedirTexto({ titulo: 'Rechazar reseña', mensaje: 'Motivo del rechazo (lo verá el lector):', placeholder: 'Ej. Lenguaje ofensivo', confirmar: 'Rechazar' });
    if (motivo === null) return;
  }
  try {
    const res = await window.fetchAPI(`/api/resenas/${id}/moderar`, { method: 'PUT', body: JSON.stringify({ decision, motivo }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo moderar la reseña');
    window.showToast(data.message);
    await Promise.all([cargarResenas(), cargarLibros()]);
    enrutar();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};

/* ---------------------------------------------------------------
   ATENCIÓN AL CLIENTE (RF28 + RF30) · módulo "soporte"
   #soporte          -> bandeja de casos, filtrable por estado y cliente
   #soporte/:id      -> el caso con todo su historial, responder y cambiar estado
   La bandeja se refresca cada 20 s mientras estés en la sección.
   --------------------------------------------------------------- */
const sop = { filtros: { estado: '', cliente: '' }, timer: null, casosAbiertos: 0 };
const ESTADO_CASO = {
  Abierto: 'status-bajo', 'En proceso': 'status-admin', Cerrado: 'status-ok'
};

function detenerSoporte() {
  if (sop.timer) clearInterval(sop.timer);
  sop.timer = null;
}

/** Cuántos casos sin cerrar hay (para el contador del menú). */
async function cargarConteoCasos() {
  if (!window.puede('soporte')) return;
  try {
    const res = await window.fetchAPI('/api/casos');
    if (!res.ok) return;
    const { totales } = await res.json();
    sop.casosAbiertos = (totales.Abierto || 0) + (totales['En proceso'] || 0);
  } catch {
    // sin conexión
  }
}

function vistaSoporte(root, param) {
  if (param) return vistaCaso(root, Number(param));
  const f = sop.filtros;
  root.innerHTML = `
    <section class="admin-section">
      <header class="page-head">
        <div><h1>Atención al cliente</h1><p>Mensajes de los clientes sobre sus pedidos. Cada conversación es un caso.</p></div>
      </header>
      <div class="summary-strip" id="sop-totales"></div>
      <form class="toolbar" id="sop-filtros" onsubmit="return false">
        <label class="search"><span class="sr-only">Buscar cliente</span><i class="fas fa-magnifying-glass" aria-hidden="true"></i>
          <input type="search" class="input" name="cliente" placeholder="Cliente, correo, N.º de caso o pedido" value="${esc(f.cliente)}" /></label>
        <label><span class="sr-only">Estado</span><select class="select" name="estado">
          <option value="">Todos los estados</option>
          ${Object.keys(ESTADO_CASO).map(e => `<option ${f.estado === e ? 'selected' : ''}>${e}</option>`).join('')}
        </select></label>
      </form>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Caso</th><th>Cliente</th><th>Motivo</th><th>Último mensaje</th><th>Estado</th><th>Actualizado</th></tr></thead>
          <tbody id="sop-tbody"><tr><td colspan="6"><p class="list-empty">Cargando casos…</p></td></tr></tbody>
        </table>
      </div>
    </section>`;
  const form = document.getElementById('sop-filtros');
  let espera;
  form.cliente.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { f.cliente = form.cliente.value.trim(); buscarCasosSoporte(); }, 300); });
  form.estado.addEventListener('change', () => { f.estado = form.estado.value; buscarCasosSoporte(); });
  buscarCasosSoporte();
  sop.timer = setInterval(() => { if (document.visibilityState === 'visible') buscarCasosSoporte(); }, 20000);
}

async function buscarCasosSoporte() {
  const q = new URLSearchParams();
  if (sop.filtros.estado) q.set('estado', sop.filtros.estado);
  if (sop.filtros.cliente) q.set('cliente', sop.filtros.cliente);
  try {
    const res = await window.fetchAPI(`/api/casos?${q}`);
    if (!res.ok) throw await leerError(res, 'No se pudieron cargar los casos');
    const { casos, totales } = await res.json();
    const tbody = document.getElementById('sop-tbody');
    if (!tbody) return;
    sop.casosAbiertos = totales.Abierto + totales['En proceso'];
    actualizarConteoRail();
    document.getElementById('sop-totales').innerHTML = `
      <div class="${totales.Abierto ? 'warn' : ''}"><b>${totales.Abierto}</b><span>Abiertos (sin respuesta)</span></div>
      <div><b>${totales['En proceso']}</b><span>En proceso</span></div>
      <div><b>${totales.Cerrado}</b><span>Cerrados</span></div>`;
    tbody.innerHTML = casos.length ? casos.map(c => `
      <tr class="fila-clic" onclick="location.hash='soporte/${c.id_caso}'">
        <td class="mono"><a class="link" href="admin.html#soporte/${c.id_caso}">${window.numeroRegistro(c.id_caso)}</a>${c.id_pedido ? `<div class="field-hint">Pedido ${window.numeroRegistro(c.id_pedido)}</div>` : ''}</td>
        <td><b>${esc(c.cliente)}</b><div class="field-hint">${esc(c.cliente_email)}</div></td>
        <td>${esc(c.motivo)}</td>
        <td style="max-width:36ch">${c.ultimo_es_personal ? '<span class="field-hint">Tú: </span>' : ''}${esc((c.ultimo_mensaje || '').slice(0, 90))}${(c.ultimo_mensaje || '').length > 90 ? '…' : ''}</td>
        <td><span class="status ${ESTADO_CASO[c.estado]}">${esc(c.estado)}</span>${c.asignado ? `<div class="field-hint">${esc(c.asignado)}</div>` : ''}</td>
        <td class="mono">${fechaHora(c.fecha_actualizacion)}</td>
      </tr>`).join('') : `<tr><td colspan="6"><div class="empty" style="padding:28px"><p>${sop.filtros.estado || sop.filtros.cliente ? 'Ningún caso coincide con el filtro.' : 'Todavía no hay casos. Cuando un cliente pulse «Contactar» en su pedido, aparecerá aquí.'}</p></div></td></tr>`;
  } catch (e) {
    const tbody = document.getElementById('sop-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6"><p class="list-empty">${esc(e.message)}</p></td></tr>`;
  }
}

async function vistaCaso(root, idCaso) {
  root.innerHTML = '<div class="empty"><p>Cargando caso…</p></div>';
  let caso;
  try {
    const res = await window.fetchAPI(`/api/casos/${idCaso}`);
    if (!res.ok) throw await leerError(res, 'No se pudo cargar el caso');
    caso = (await res.json()).caso;
  } catch (e) {
    root.innerHTML = `<div class="panel"><div class="empty"><h2>${esc(e.message)}</h2><a class="btn btn-secondary" href="admin.html#soporte">Volver a la bandeja</a></div></div>`;
    return;
  }
  const editar = window.puede('soporte', 'editar');
  root.innerHTML = `
    <section class="admin-section">
      <header class="page-head">
        <div>
          <a class="link" href="admin.html#soporte"><i class="fas fa-arrow-left" aria-hidden="true"></i> Bandeja</a>
          <h1>Caso ${window.numeroRegistro(caso.id_caso)} <span class="status ${ESTADO_CASO[caso.estado]}">${esc(caso.estado)}</span></h1>
          <p>${esc(caso.motivo)} · abierto el ${fechaHora(caso.fecha_creacion)}${caso.asignado ? ` · lo atiende ${esc(caso.asignado)}` : ''}</p>
        </div>
        ${editar ? `<div class="actions">
          ${caso.estado !== 'En proceso' && caso.estado !== 'Cerrado' ? `<button type="button" class="btn btn-secondary" onclick="estadoCaso(${caso.id_caso}, 'En proceso')">Tomar caso</button>` : ''}
          ${caso.estado !== 'Cerrado' ? `<button type="button" class="btn btn-primary" onclick="estadoCaso(${caso.id_caso}, 'Cerrado')"><i class="fas fa-check" aria-hidden="true"></i> Cerrar caso</button>`
            : `<button type="button" class="btn btn-secondary" onclick="estadoCaso(${caso.id_caso}, 'Abierto')">Reabrir</button>`}
        </div>` : ''}
      </header>
      <div class="caso-layout">
        <section class="panel">
          <div class="panel-head"><h2>Historial</h2><span class="field-hint">${caso.historial.length} mensaje(s)</span></div>
          <ol class="chat chat-panel">
            ${caso.historial.map(m => `
              <li class="${m.es_personal ? 'chat-tienda' : 'chat-yo'}">
                <span class="chat-autor">${m.es_personal ? `${esc(m.autor || 'Soporte')} (librería)` : esc(caso.cliente)} · <time>${fechaHora(m.fecha)}</time></span>
                <p>${esc(m.mensaje)}</p>
              </li>`).join('')}
          </ol>
          ${editar ? `<form class="review-form" id="form-respuesta" style="padding:0 20px 20px" novalidate>
            <label class="field"><span class="field-label">Responder al cliente</span>
              <textarea class="textarea" name="mensaje" maxlength="1000" required placeholder="La respuesta le llega por correo y la ve en «Mis compras»"></textarea></label>
            <div><button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane" aria-hidden="true"></i> Enviar respuesta</button></div>
          </form>` : ''}
        </section>
        <aside class="panel caso-datos">
          <div class="panel-head"><h2>Cliente</h2></div>
          <dl class="ficha-facts" style="padding:14px 20px">
            <div><dt>Nombre</dt><dd>${esc(caso.cliente)}</dd></div>
            <div><dt>Correo</dt><dd>${esc(caso.cliente_email)}</dd></div>
            <div><dt>Pedido</dt><dd>${caso.id_pedido ? `<a class="link" href="admin.html#inventario">${window.numeroRegistro(caso.id_pedido)}</a>` : 'Consulta general'}</dd></div>
            ${caso.fecha_cierre ? `<div><dt>Cerrado</dt><dd>${fechaHora(caso.fecha_cierre)}</dd></div>` : ''}
          </dl>
        </aside>
      </div>
    </section>`;
  document.querySelector('.chat-panel li:last-child')?.scrollIntoView({ block: 'nearest' });
  document.getElementById('form-respuesta')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mensaje = e.target.mensaje.value.trim();
    if (mensaje.length < 3) { window.showToast('Escribe la respuesta (mínimo 3 caracteres).', 'error'); return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await window.fetchAPI(`/api/casos/${idCaso}/mensajes`, { method: 'POST', body: JSON.stringify({ mensaje }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar');
      window.showToast('Respuesta enviada al cliente.');
      vistaCaso(root, idCaso);
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

window.estadoCaso = async function(idCaso, estadoNuevo) {
  try {
    const res = await window.fetchAPI(`/api/casos/${idCaso}/estado`, { method: 'PUT', body: JSON.stringify({ estado: estadoNuevo }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo cambiar el estado');
    window.showToast(data.message);
    await cargarConteoCasos();
    actualizarConteoRail();
    vistaCaso(document.getElementById('admin-root'), idCaso);
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};

/* ---------------------------------------------------------------
   REGISTRO DE ACTIVIDAD (RF15) · módulo "auditoria" (solo administrador)
   Cada cambio en el sistema queda guardado por el servidor (services/logs.js).
   Aquí se filtra por usuario, acción, módulo, resultado y fechas.
   --------------------------------------------------------------- */
const aud = { filtros: { usuario: '', accion: '', modulo: '', resultado: '', desde: '', hasta: '' }, pagina: 1, datos: null };

function vistaAuditoria(root) {
  const f = aud.filtros;
  root.innerHTML = `
    <section class="admin-section reporte">
      <header class="page-head">
        <div><h1>Registro de actividad</h1><p>Quién hizo qué y cuándo: inicios de sesión, cambios en los datos y ventas.</p></div>
        <div class="actions no-imprimir"><button type="button" class="btn btn-secondary" id="aud-excel"><i class="fas fa-file-excel" aria-hidden="true"></i> Excel</button></div>
      </header>
      <div class="summary-strip" id="aud-resumen"></div>
      <form class="panel filtros-facturas filtros-auditoria no-imprimir" id="form-aud" novalidate>
        <label class="field"><span class="field-label">Usuario</span><select class="select" name="usuario"><option value="">Todos</option></select></label>
        <label class="field"><span class="field-label">Acción</span><select class="select" name="accion"><option value="">Todas</option></select></label>
        <label class="field"><span class="field-label">Módulo</span><select class="select" name="modulo"><option value="">Todos</option></select></label>
        <label class="field"><span class="field-label">Resultado</span><select class="select" name="resultado">
          <option value="">Todos</option><option ${f.resultado === 'OK' ? 'selected' : ''} value="OK">Correcto</option><option ${f.resultado === 'Fallido' ? 'selected' : ''} value="Fallido">Fallido</option></select></label>
        <label class="field"><span class="field-label">Desde</span><input class="input" type="date" name="desde" value="${esc(f.desde)}" /></label>
        <label class="field"><span class="field-label">Hasta</span><input class="input" type="date" name="hasta" value="${esc(f.hasta)}" /></label>
        <div class="filtros-acciones"><button type="submit" class="btn btn-primary"><i class="fas fa-filter" aria-hidden="true"></i> Filtrar</button>
          <button type="button" class="btn btn-quiet" id="aud-limpiar">Limpiar</button></div>
      </form>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Detalle</th><th>Resultado</th></tr></thead>
          <tbody id="aud-tbody"><tr><td colspan="6"><p class="list-empty">Cargando…</p></td></tr></tbody>
        </table>
        <div class="table-foot" id="aud-foot"></div>
      </div>
    </section>`;
  const form = document.getElementById('form-aud');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.desde.value && form.hasta.value && form.desde.value > form.hasta.value) { window.showToast('La fecha "desde" no puede ser posterior a "hasta".', 'error'); return; }
    ['usuario', 'accion', 'modulo', 'resultado', 'desde', 'hasta'].forEach(k => { f[k] = form[k].value; });
    aud.pagina = 1;
    buscarLogs();
  });
  form.querySelectorAll('select').forEach(s => s.addEventListener('change', () => form.requestSubmit()));
  document.getElementById('aud-limpiar').addEventListener('click', () => {
    Object.keys(f).forEach(k => { f[k] = ''; });
    aud.pagina = 1;
    vistaAuditoria(root);
  });
  document.getElementById('aud-excel').addEventListener('click', exportarLogs);
  buscarLogs();
}

async function buscarLogs() {
  const q = new URLSearchParams({ pagina: aud.pagina });
  Object.entries(aud.filtros).forEach(([k, v]) => { if (v) q.set(k, v); });
  const tbody = document.getElementById('aud-tbody');
  try {
    const res = await window.fetchAPI(`/api/auditoria?${q}`);
    if (!res.ok) throw await leerError(res, 'No se pudo consultar el registro');
    const d = aud.datos = await res.json();
    if (!document.getElementById('aud-tbody')) return;
    const form = document.getElementById('form-aud');
    const llenar = (sel, opciones, valor) => {
      const primera = sel.options[0].outerHTML;
      sel.innerHTML = primera + opciones.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(valor) ? 'selected' : ''}>${esc(t)}</option>`).join('');
    };
    llenar(form.usuario, d.usuarios.map(u => [u.id, u.nombre]), aud.filtros.usuario);
    llenar(form.accion, d.acciones.map(a => [a, a]), aud.filtros.accion);
    llenar(form.modulo, d.modulos.map(m => [m, NOMBRES_MODULO[m] || m]), aud.filtros.modulo);

    const r = d.resumen;
    document.getElementById('aud-resumen').innerHTML = `
      <div><b>${r.total}</b><span>Registros</span></div>
      <div><b>${r.inicios}</b><span>Inicios de sesión</span></div>
      <div class="${r.iniciosFallidos ? 'warn' : ''}"><b>${r.iniciosFallidos}</b><span>Inicios fallidos</span></div>
      <div><b>${r.ventas}</b><span>Ventas</span></div>
      <div><b>${r.cambios}</b><span>Cambios en datos</span></div>
      <div class="${r.fallidos ? 'warn' : ''}"><b>${r.fallidos}</b><span>Acciones fallidas</span></div>`;
    tbody.innerHTML = d.logs.length ? d.logs.map(l => `
      <tr class="${l.resultado === 'Fallido' ? 'log-fallido' : ''}">
        <td class="mono">${fechaHora(l.fecha)}</td>
        <td>${esc(l.usuario_nombre || '—')}${l.ip ? `<div class="field-hint mono">${esc(l.ip)}</div>` : ''}</td>
        <td><b>${esc(l.accion)}</b></td>
        <td>${esc(NOMBRES_MODULO[l.modulo] || l.modulo)}</td>
        <td style="max-width:48ch">${esc(l.descripcion || '')}</td>
        <td><span class="status ${l.resultado === 'OK' ? 'status-ok' : 'status-out'}">${l.resultado === 'OK' ? 'Correcto' : 'Fallido'}</span></td>
      </tr>`).join('') : '<tr><td colspan="6"><div class="empty" style="padding:28px"><p>No hay registros con ese filtro.</p></div></td></tr>';
    const paginas = Math.max(1, Math.ceil(d.total / d.porPagina));
    document.getElementById('aud-foot').innerHTML = `${d.total} registro(s) · página ${d.pagina} de ${paginas}
      ${d.pagina > 1 ? '<button type="button" class="link" id="aud-ant">← Anterior</button>' : ''}
      ${d.pagina < paginas ? '<button type="button" class="link" id="aud-sig">Siguiente →</button>' : ''}`;
    document.getElementById('aud-ant')?.addEventListener('click', () => { aud.pagina--; buscarLogs(); });
    document.getElementById('aud-sig')?.addEventListener('click', () => { aud.pagina++; buscarLogs(); });
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6"><p class="list-empty">${esc(e.message)}</p></td></tr>`;
  }
}

/** Exporta la página actual del registro a CSV (Excel). */
function exportarLogs() {
  const d = aud.datos;
  if (!d?.logs.length) { window.showToast('No hay registros para exportar.', 'error'); return; }
  const celda = (v) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const filas = [['Fecha', 'Usuario', 'IP', 'Acción', 'Módulo', 'Detalle', 'Resultado'].join(';'),
    ...d.logs.map(l => [fechaHora(l.fecha), l.usuario_nombre, l.ip, l.accion, NOMBRES_MODULO[l.modulo] || l.modulo, l.descripcion, l.resultado].map(celda).join(';'))];
  const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `registro-actividad-pagina-${d.pagina}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------------------------------------------------------
   CONTEO CÍCLICO (RF12) · #inventario/conteo
   1. "Iniciar conteo": el sistema guarda una foto del stock de cada libro.
   2. Escribes lo que contaste en el estante: la diferencia aparece al instante.
   3. Para las diferencias escribes el motivo y "Ajustar stock" corrige el inventario
      (queda en el historial de movimientos con el motivo).
   4. "Cerrar conteo".
   --------------------------------------------------------------- */
async function vistaConteo(root) {
  root.innerHTML = '<div class="empty"><p>Cargando conteos…</p></div>';
  let conteos;
  try {
    const res = await window.fetchAPI('/api/inventario/conteos');
    if (!res.ok) throw await leerError(res, 'No se pudieron cargar los conteos');
    conteos = (await res.json()).conteos;
  } catch (e) {
    root.innerHTML = errorConexion('los conteos');
    return;
  }
  const abierto = conteos.find(c => c.estado === 'Abierto');
  if (abierto) return vistaConteoAbierto(root, abierto.id_conteo);
  const generos = [...new Set(estado.libros.map(l => l.genero).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  root.innerHTML = `
    <section class="admin-section">
      <header class="page-head">
        <div><a class="link" href="admin.html#inventario"><i class="fas fa-arrow-left" aria-hidden="true"></i> Inventario</a>
          <h1>Conteo cíclico</h1><p>Cuenta los libros del estante y compáralos con lo que dice el sistema.</p></div>
      </header>
      <form class="panel conteo-nuevo" id="form-conteo" data-requiere="inventario:editar" novalidate>
        <label class="field"><span class="field-label">¿Qué vas a contar?</span>
          <select class="select" name="genero"><option value="">Todo el inventario (${estado.libros.length} libros)</option>
            ${generos.map(g => `<option value="${esc(g)}">Solo ${esc(g)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Nota (opcional)</span><input class="input" name="nota" maxlength="200" placeholder="Ej. Conteo de fin de mes" /></label>
        <div><button type="submit" class="btn btn-primary"><i class="fas fa-clipboard-list" aria-hidden="true"></i> Iniciar conteo</button></div>
      </form>
      <section class="panel">
        <div class="panel-head"><h2>Conteos anteriores</h2></div>
        ${conteos.length ? `<ul class="list">${conteos.map(c => `
          <li><div class="grow"><b>Conteo ${window.numeroRegistro(c.id_conteo)}${c.nota ? ` · ${esc(c.nota)}` : ''}</b>
            <span>${fechaHora(c.fecha_inicio)} · ${esc(c.usuario || '—')} · ${c.contados}/${c.libros} contados · ${c.con_diferencia} con diferencia · ${c.ajustados} ajustados</span></div>
            <a class="btn btn-quiet btn-sm" href="#" onclick="event.preventDefault(); vistaConteoAbierto(document.getElementById('admin-root'), ${c.id_conteo})">Ver</a></li>`).join('')}</ul>`
          : '<p class="list-empty">Todavía no se ha hecho ningún conteo.</p>'}
      </section>
    </section>`;
  aplicarPermisos(root);
  document.getElementById('form-conteo')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await window.fetchAPI('/api/inventario/conteos', { method: 'POST', body: JSON.stringify({ genero: e.target.genero.value, nota: e.target.nota.value }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar el conteo');
      window.showToast(data.message);
      vistaConteoAbierto(root, data.idConteo);
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });
}

window.vistaConteoAbierto = async function(root, idConteo) {
  let d;
  try {
    const res = await window.fetchAPI(`/api/inventario/conteos/${idConteo}`);
    if (!res.ok) throw await leerError(res, 'No se pudo cargar el conteo');
    d = await res.json();
  } catch (e) {
    window.showToast(e.message, 'error');
    return;
  }
  const abierto = d.conteo.estado === 'Abierto';
  const editar = abierto && window.puede('inventario', 'editar');
  const contados = d.lineas.filter(l => l.cantidad_contada !== null).length;
  const conDif = d.lineas.filter(l => l.diferencia);
  const porAjustar = conDif.filter(l => !l.ajustado);
  const signo = (n) => (n > 0 ? `+${n}` : String(n));

  root.innerHTML = `
    <section class="admin-section">
      <header class="page-head">
        <div><a class="link" href="admin.html#inventario/conteo"><i class="fas fa-arrow-left" aria-hidden="true"></i> Conteos</a>
          <h1>Conteo ${window.numeroRegistro(idConteo)} <span class="status ${abierto ? 'status-bajo' : 'status-ok'}">${d.conteo.estado}</span></h1>
          <p>${d.conteo.nota ? `${esc(d.conteo.nota)} · ` : ''}iniciado el ${fechaHora(d.conteo.fecha_inicio)} por ${esc(d.conteo.usuario || '—')}</p></div>
        ${editar ? `<div class="actions"><button type="button" class="btn btn-secondary" id="conteo-cerrar"><i class="fas fa-lock" aria-hidden="true"></i> Cerrar conteo</button></div>` : ''}
      </header>
      <div class="summary-strip">
        <div><b>${contados}/${d.lineas.length}</b><span>Libros contados</span></div>
        <div class="${conDif.length ? 'warn' : ''}"><b>${conDif.length}</b><span>Con diferencia</span></div>
        <div><b>${porAjustar.length}</b><span>Por ajustar</span></div>
      </div>
      <p class="field-hint" style="margin-bottom:10px">«En sistema» es lo que había al iniciar el conteo. La diferencia se suma o resta al stock actual al ajustar, así no se pierden las ventas hechas mientras contabas.</p>
      <div class="table-wrap">
        <table class="table tabla-conteo">
          <thead><tr><th>Libro</th><th class="right">En sistema</th><th class="right">Contado</th><th class="right">Diferencia</th><th>Motivo del ajuste</th><th>Ajuste</th></tr></thead>
          <tbody>${d.lineas.map(l => `
            <tr data-libro="${l.id_libro}">
              <td><b>${esc(l.titulo)}</b><div class="field-hint">${esc(l.ISBN || l.autor || '')}</div></td>
              <td class="right num">${l.stock_sistema}</td>
              <td class="right">${editar && !l.ajustado
                ? `<input class="input num input-conteo" type="number" min="0" max="9999" step="1" value="${l.cantidad_contada ?? ''}" aria-label="Cantidad contada de ${esc(l.titulo)}" />`
                : `<span class="num">${l.cantidad_contada ?? '—'}</span>`}</td>
              <td class="right"><span class="dif num ${l.diferencia > 0 ? 'dif-mas' : (l.diferencia < 0 ? 'dif-menos' : '')}">${l.diferencia === null ? '—' : signo(l.diferencia)}</span></td>
              <td>${editar && !l.ajustado
                ? `<input class="input input-motivo" maxlength="150" placeholder="${l.diferencia ? 'Obligatorio' : '—'}" ${l.diferencia ? '' : 'disabled'} aria-label="Motivo del ajuste de ${esc(l.titulo)}" />`
                : esc(l.motivo || '—')}</td>
              <td>${l.ajustado ? '<span class="status status-ok">Ajustado</span>' : (l.diferencia ? '<span class="status status-bajo">Pendiente</span>' : '—')}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
      ${editar ? `<div class="conteo-pie"><button type="button" class="btn btn-primary" id="conteo-ajustar" ${porAjustar.length ? '' : 'disabled'}><i class="fas fa-scale-balanced" aria-hidden="true"></i> Ajustar stock de los libros con diferencia</button></div>` : ''}
    </section>`;
  if (!editar) return;

  // Guardar lo contado al salir del campo (o con Enter) y recalcular la diferencia
  root.querySelectorAll('.input-conteo').forEach(inp => {
    const guardar = async () => {
      const fila = inp.closest('tr');
      const v = inp.value.trim();
      const n = Number(v);
      if (v !== '' && (!Number.isInteger(n) || n < 0 || n > 9999)) { window.showToast('La cantidad debe ser un entero de 0 a 9999.', 'error'); return; }
      if (inp.dataset.guardado === v) return;
      try {
        const res = await window.fetchAPI(`/api/inventario/conteos/${idConteo}/libros/${fila.dataset.libro}`, { method: 'PUT', body: JSON.stringify({ cantidad: v === '' ? null : n }) });
        if (!res.ok) throw await leerError(res, 'No se pudo guardar');
        inp.dataset.guardado = v;
        const linea = d.lineas.find(l => String(l.id_libro) === fila.dataset.libro);
        linea.cantidad_contada = v === '' ? null : n;
        linea.diferencia = v === '' ? null : n - linea.stock_sistema;
        const dif = fila.querySelector('.dif');
        dif.textContent = linea.diferencia === null ? '—' : signo(linea.diferencia);
        dif.className = `dif num ${linea.diferencia > 0 ? 'dif-mas' : (linea.diferencia < 0 ? 'dif-menos' : '')}`;
        const motivo = fila.querySelector('.input-motivo');
        motivo.disabled = !linea.diferencia;
        motivo.placeholder = linea.diferencia ? 'Obligatorio' : '—';
        fila.lastElementChild.innerHTML = linea.diferencia ? '<span class="status status-bajo">Pendiente</span>' : '—';
        document.getElementById('conteo-ajustar').disabled = !d.lineas.some(l => l.diferencia && !l.ajustado);
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    };
    inp.dataset.guardado = inp.value;
    inp.addEventListener('change', guardar);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
  });

  document.getElementById('conteo-ajustar').addEventListener('click', async () => {
    const filas = [...root.querySelectorAll('tr[data-libro]')].filter(tr => {
      const l = d.lineas.find(x => String(x.id_libro) === tr.dataset.libro);
      return l.diferencia && !l.ajustado;
    });
    const sinMotivo = filas.find(tr => tr.querySelector('.input-motivo').value.trim().length < 3);
    if (sinMotivo) {
      window.showToast('Escribe el motivo de cada ajuste (mínimo 3 caracteres).', 'error');
      sinMotivo.querySelector('.input-motivo').focus();
      return;
    }
    const ok = await window.confirmar({
      titulo: '¿Ajustar el stock?',
      mensaje: `Se corregirá el stock de ${filas.length} libro(s) según lo contado. Queda registrado en el historial con el motivo.`,
      confirmar: 'Ajustar stock'
    });
    if (!ok) return;
    try {
      const lineas = filas.map(tr => ({ id_libro: Number(tr.dataset.libro), motivo: tr.querySelector('.input-motivo').value.trim() }));
      const res = await window.fetchAPI(`/api/inventario/conteos/${idConteo}/ajustar`, { method: 'POST', body: JSON.stringify({ lineas }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo ajustar');
      window.showToast(data.message);
      await cargarLibros();
      vistaConteoAbierto(root, idConteo);
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  });

  document.getElementById('conteo-cerrar').addEventListener('click', async () => {
    const pendientes = d.lineas.filter(l => l.diferencia && !l.ajustado).length;
    const ok = await window.confirmar({
      titulo: '¿Cerrar el conteo?',
      mensaje: pendientes ? `Hay ${pendientes} diferencia(s) sin ajustar: el stock de esos libros quedará como está.` : 'Ya no se podrá editar.',
      confirmar: 'Cerrar conteo', peligro: pendientes > 0
    });
    if (!ok) return;
    try {
      const res = await window.fetchAPI(`/api/inventario/conteos/${idConteo}/cerrar`, { method: 'POST' });
      if (!res.ok) throw await leerError(res, 'No se pudo cerrar');
      window.showToast('Conteo cerrado.');
      vistaConteo(root);
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  });
};

/* ---------------------------------------------------------------
   PROMOCIONES (RF26) · panel dentro de Configuración
   El correo les llega solo a los clientes que activaron "Promociones" en su perfil.
   --------------------------------------------------------------- */
function agregarPanelPromocion(root) {
  const seccion = root.querySelector('.admin-section');
  if (!seccion || !window.puede('configuracion', 'editar')) return;
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.style.marginTop = '26px';
  panel.innerHTML = `
    <div class="panel-head"><h2>Enviar una promoción</h2><span class="field-hint">Solo a los clientes suscritos a promociones</span></div>
    <form id="form-promo" class="review-form" style="padding:16px 20px" novalidate>
      <label class="field"><span class="field-label">Asunto</span><input class="input" name="asunto" maxlength="120" placeholder="Ej. 20% en clásicos este fin de semana" /></label>
      <label class="field"><span class="field-label">Mensaje</span><textarea class="textarea" name="mensaje" maxlength="2000" placeholder="Escribe la promoción"></textarea></label>
      <div><button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane" aria-hidden="true"></i> Enviar promoción</button></div>
    </form>`;
  seccion.appendChild(panel);
  panel.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const asunto = form.asunto.value.trim();
    const mensaje = form.mensaje.value.trim();
    if (asunto.length < 3 || mensaje.length < 5) { window.showToast('Escribe un asunto (3+ caracteres) y un mensaje (5+).', 'error'); return; }
    const ok = await window.confirmar({ titulo: '¿Enviar la promoción?', mensaje: `«${asunto}» se enviará por correo a los clientes suscritos.`, confirmar: 'Enviar' });
    if (!ok) return;
    try {
      const res = await window.fetchAPI('/api/suscripciones/promocion', { method: 'POST', body: JSON.stringify({ asunto, mensaje }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar');
      window.showToast(data.message);
      form.reset();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });
}
