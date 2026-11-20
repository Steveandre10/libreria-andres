/**
 * @file admin.js
 * @description Administración de Librería Andrés (personal interno, según los permisos de su rol · RF18).
 * Secciones por hash: #resumen, #libros, #libros/nuevo, #libros/:id, #usuarios, #usuarios/nuevo, #resenas, #roles, #roles/nuevo, #roles/:clave
 */

const esc = (v) => window.esc(v);
/** RF18 · Módulos de la administración y su nombre visible (mismos que en el backend). */
const NOMBRES_MODULO = { resumen: 'Resumen', libros: 'Libros', usuarios: 'Usuarios', resenas: 'Reseñas', roles: 'Roles y permisos' };
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
  await Promise.all([cargarLibros(), cargarUsuarios(), cargarResenas(), cargarRoles()]);
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
    const res = await fetch(`${window.API_BASE}/api/resenas`);
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
  // Sin sección en la URL: abre el primer módulo que este rol puede ver
  const seccion = hash || MODULOS.find(m => window.puede(m)) || 'resumen';

  const rail = document.getElementById('rail');
  rail.dataset.page = `admin:${seccion}`;
  window.renderShell();
  actualizarConteoRail();

  const root = document.getElementById('admin-root');
  const vistas = { resumen: vistaResumen, libros: vistaLibros, usuarios: vistaUsuarios, resenas: vistaResenas, roles: vistaRoles };

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
  const ultimasResenas = estado.resenas.slice(0, 5);
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
              <button type="button" class="btn btn-secondary btn-sm" data-requiere="libros:editar" onclick="cambiarDisponibilidad(${l.id_libro}, 'Disponible')">Marcar disponible</button>
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
            <thead><tr><th>Libro</th><th>Género</th><th class="right">Precio</th><th class="right">Nota</th><th>Disponibilidad</th><th><span class="sr-only">Acciones</span></th></tr></thead>
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

  // RF18: sin permiso de editar, la disponibilidad se muestra como texto
  const puedeEditar = window.puede('libros', 'editar');
  tbody.innerHTML = filas.map(l => {
    const disp = l.disponibilidad !== 'Agotado';
    return `
      <tr class="clickable ${l.id_libro === idSeleccionado ? 'selected' : ''}" data-id="${l.id_libro}">
        <td><div class="title-cell"><img src="${portada(l)}" alt="" loading="lazy" onerror="this.src=window.PORTADA_DEFECTO" /><div><b>${esc(l.titulo)}</b><span>${esc(l.autor)}</span></div></div></td>
        <td><span class="genre" style="--g:${window.genreColor(l.genero)}"><i aria-hidden="true"></i>${esc(l.genero || 'General')}</span></td>
        <td class="right"><b>${window.formatPrecio(l.precio)}</b></td>
        <td class="right">${window.ratingHTML(l.promedio_reseña)}</td>
        <td>${puedeEditar ? `
          <label class="switch">
            <input type="checkbox" ${disp ? 'checked' : ''} onchange="cambiarDisponibilidad(${l.id_libro}, this.checked ? 'Disponible' : 'Agotado', this)" aria-label="Disponibilidad de ${esc(l.titulo)}" />
            <span class="track" aria-hidden="true"></span><span class="lbl-on">Disponible</span><span class="lbl-off">Agotado</span>
          </label>` : `
          <span class="status ${disp ? 'status-ok' : 'status-out'}">${disp ? 'Disponible' : 'Agotado'}</span>`}
        </td>
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
          <label class="field"><span class="field-label">Disponibilidad</span><select class="select" name="disponibilidad">
            <option ${!l || l.disponibilidad !== 'Agotado' ? 'selected' : ''}>Disponible</option>
            <option ${l && l.disponibilidad === 'Agotado' ? 'selected' : ''}>Agotado</option></select></label>
          <label class="field"><span class="field-label">Género</span><input class="input" name="genero" list="dl-generos" maxlength="50" value="${v('genero')}" placeholder="Clásico" />
            <datalist id="dl-generos">${generos.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
          <label class="field"><span class="field-label">ISBN</span><input class="input mono" name="ISBN" maxlength="20" value="${v('ISBN')}" placeholder="978-…" /></label>
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
      disponibilidad: form.disponibilidad.value,
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
  const abierto = param === 'nuevo';

  root.innerHTML = `
    <section class="admin-section workspace">
      <div>
        <header class="page-head">
          <div><h1>Usuarios</h1><p>${estado.usuarios.length} cuentas · ${admins} ${admins === 1 ? 'administrador' : 'administradores'}</p></div>
          <div class="actions"><a class="btn btn-primary" href="admin.html#usuarios/nuevo" data-requiere="usuarios:editar"><i class="fas fa-user-plus" aria-hidden="true"></i> Nuevo usuario</a></div>
        </header>
        <div class="toolbar">
          <label class="search"><span class="sr-only">Buscar usuarios</span><i class="fas fa-magnifying-glass" aria-hidden="true"></i>
            <input type="search" class="input" id="u-q" placeholder="Nombre o correo" /></label>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Registro</th><th><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody id="usuarios-tbody"></tbody>
          </table>
        </div>
      </div>
      <aside class="workspace-side ${abierto ? '' : 'is-empty'}" id="usuario-side">
        ${abierto ? fichaUsuario() : `
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
          <td class="mono">${fecha(u.fecha_registro)}</td>
          <td><div class="row-actions">${esYo ? '' : `<button type="button" class="icon-btn danger" data-requiere="usuarios:editar" onclick="eliminarUsuario(${u.id})" aria-label="Eliminar a ${esc(u.nombre)}" title="Eliminar"><i class="fas fa-trash-can"></i></button>`}</div></td>
        </tr>`;
    }).join('') : '<tr><td colspan="5"><div class="empty" style="padding:28px"><p>Ningún usuario coincide.</p></div></td></tr>';
    aplicarPermisos(document.getElementById('usuarios-tbody')); // RF18
  };
  pintar();
  document.getElementById('u-q').addEventListener('input', pintar);

  const side = document.getElementById('usuario-side');
  side.addEventListener('click', (e) => { if (e.target === side) location.hash = 'usuarios'; });
  if (abierto) conectarFormUsuario();
}

function fichaUsuario() {
  return `
    <form class="ficha" id="form-usuario">
      <div class="ficha-head">
        <div class="ficha-call"><span>N.º nueva</span><span>Alta de cuenta</span></div>
        <h2>Nuevo usuario</h2><p>La persona podrá entrar con este correo y contraseña.</p>
        <a class="icon-btn sheet-close" href="admin.html#usuarios" aria-label="Cerrar"><i class="fas fa-xmark"></i></a>
      </div>
      <div class="ficha-body">
        <div class="form-grid">
          <label class="field full"><span class="field-label">Nombre completo *</span><input class="input" name="nombre" required autocomplete="off" /></label>
          <label class="field full"><span class="field-label">Correo *</span><input class="input" name="email" type="email" required autocomplete="off" /></label>
          <label class="field full"><span class="field-label">Contraseña inicial *</span><input class="input" name="password" type="password" required minlength="6" autocomplete="new-password" /><span class="field-hint">Mínimo 6 caracteres. Pídele que la cambie al entrar.</span></label>
          <label class="field full"><span class="field-label">Rol</span><select class="select" name="rol">${opcionesRol('usuario', true)}</select></label>
          <label class="field"><span class="field-label">Teléfono</span><input class="input" name="telefono" type="tel" /></label>
          <label class="field"><span class="field-label">Dirección</span><input class="input" name="direccion" /></label>
        </div>
        <div class="ficha-actions">
          <button type="submit" class="btn btn-primary">Crear usuario</button>
          <a class="btn btn-secondary" href="admin.html#usuarios">Cancelar</a>
        </div>
      </div>
    </form>`;
}

function conectarFormUsuario() {
  const form = document.getElementById('form-usuario');
  form.nombre.focus({ preventScroll: true });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const datos = {
      nombre: form.nombre.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value,
      rol: form.rol.value,
      telefono: form.telefono.value.trim() || null,
      direccion: form.direccion.value.trim() || null
    };
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const res = await window.fetchAPI('/api/usuarios', { method: 'POST', body: JSON.stringify(datos) });
      if (!res.ok) throw await leerError(res, 'No se pudo crear el usuario');
      await cargarUsuarios();
      window.showToast(`Creaste la cuenta de ${datos.nombre}.`);
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
    mensaje: `${u.email} ya no podrá iniciar sesión. Esta acción no se puede deshacer.`,
    confirmar: 'Eliminar cuenta',
    peligro: true
  });
  if (!ok) return;
  try {
    const res = await window.fetchAPI(`/api/usuarios/${id}`, { method: 'DELETE' });
    if (!res.ok) throw await leerError(res, 'No se pudo eliminar el usuario');
    estado.usuarios = estado.usuarios.filter(x => x.id !== id);
    window.showToast(`Eliminaste la cuenta de ${u.nombre}.`);
    enrutar();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
};

/* ---------------------------------------------------------------
   RESEÑAS
   --------------------------------------------------------------- */
function vistaResenas(root) {
  if (!estado.cargado.resenas) { root.innerHTML = errorConexion('las reseñas'); return; }
  const f = estado.filtros.resenas;
  const libros = [...new Set(estado.resenas.map(r => r.libro_titulo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const media = estado.resenas.length
    ? nota(estado.resenas.reduce((s, r) => s + parseFloat(r.calificacion || 0), 0) / estado.resenas.length)
    : '—';

  root.innerHTML = `
    <section class="admin-section">
      <header class="page-head">
        <div><h1>Reseñas</h1><p>${estado.resenas.length} reseñas · calificación media ${media}</p></div>
      </header>
      <div class="toolbar">
        <label class="search"><span class="sr-only">Buscar reseñas</span><i class="fas fa-magnifying-glass" aria-hidden="true"></i>
          <input type="search" class="input" id="r-q" placeholder="Texto o lector" value="${esc(f.q)}" /></label>
        <label><span class="sr-only">Libro</span><select class="select" id="r-libro">
          <option value="">Todos los libros</option>
          ${libros.map(t => `<option ${f.libro === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select></label>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Libro</th><th>Lector</th><th class="right">Nota</th><th>Fecha</th><th>Reseña</th><th><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody id="resenas-tbody"></tbody>
        </table>
      </div>
    </section>`;

  const pintar = () => {
    f.q = document.getElementById('r-q').value;
    f.libro = document.getElementById('r-libro').value;
    const q = f.q.trim().toLowerCase();
    const filas = estado.resenas.filter(r =>
      (!q || `${r.reseña} ${r.usuario_nombre}`.toLowerCase().includes(q)) &&
      (!f.libro || r.libro_titulo === f.libro));
    document.getElementById('resenas-tbody').innerHTML = filas.length ? filas.map(r => `
      <tr>
        <td><b>${esc(r.libro_titulo || 'Libro eliminado')}</b></td>
        <td>${esc(r.usuario_nombre)}</td>
        <td class="right"><span class="rating"><i class="fas fa-star" aria-hidden="true"></i>${nota(r.calificacion)}</span></td>
        <td class="mono">${fecha(r.fecha)}</td>
        <td style="max-width:48ch; color:var(--text-2)">${esc(r.reseña)}</td>
        <td><div class="row-actions"><button type="button" class="icon-btn danger" data-requiere="resenas:editar" onclick="eliminarResena(${r.id_reseña})" aria-label="Eliminar reseña" title="Eliminar"><i class="fas fa-trash-can"></i></button></div></td>
      </tr>`).join('') : `<tr><td colspan="6"><div class="empty" style="padding:28px"><p>${estado.resenas.length ? 'Ninguna reseña coincide.' : 'Todavía no hay reseñas de lectores.'}</p></div></td></tr>`;
  };
  pintar();
  document.getElementById('r-q').addEventListener('input', pintar);
  document.getElementById('r-libro').addEventListener('input', pintar);
}

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
