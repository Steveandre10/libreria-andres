/**
 * @file admin.js
 * @description Administración de Librería Andrés (personal interno, según los permisos de su rol · RF18).
 * Secciones por hash: #resumen, #libros, #libros/nuevo, #libros/:id, #inventario, #usuarios, #usuarios/nuevo, #resenas, #roles, #roles/nuevo, #roles/:clave
 */

const esc = (v) => window.esc(v);
/** RF18 · Módulos de la administración y su nombre visible (mismos que en el backend). */
const NOMBRES_MODULO = { resumen: 'Resumen', libros: 'Libros', inventario: 'Inventario', facturas: 'Facturas', usuarios: 'Usuarios', resenas: 'Reseñas', roles: 'Roles y permisos', configuracion: 'Configuración' }; // RF14: + inventario · RF17: + configuracion
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
  await Promise.all([cargarLibros(), cargarUsuarios(), cargarResenas(), cargarRoles(), cargarSolicitudes()]);
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
  detenerInventarioEnVivo(); // RF14: al cambiar de sección se apaga la actualización automática
  // Sin sección en la URL: abre el primer módulo que este rol puede ver
  const seccion = hash || MODULOS.find(m => window.puede(m)) || 'resumen';

  const rail = document.getElementById('rail');
  rail.dataset.page = `admin:${seccion}`;
  window.renderShell();
  actualizarConteoRail();

  const root = document.getElementById('admin-root');
  const vistas = { resumen: vistaResumen, libros: vistaLibros, inventario: vistaInventario, facturas: vistaFacturas, usuarios: vistaUsuarios, resenas: vistaResenas, roles: vistaRoles, configuracion: vistaConfiguracion };

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
/** Un libro con esta cantidad o menos se marca como "stock bajo". */
const STOCK_BAJO = 3;

const inv = {
  libros: [],
  movimientos: [],
  pedidos: [],
  solicitudes: [],       // RF14: solicitudes de devolución de los clientes
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
async function vistaInventario(root) {
  root.innerHTML = `
    <section class="admin-section">
      <header class="page-head">
        <div>
          <h1>Inventario</h1>
          <p><span class="en-vivo" aria-hidden="true"></span> En tiempo real · <span id="inv-hora">consultando…</span></p>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-secondary" id="inv-refrescar"><i class="fas fa-rotate" aria-hidden="true"></i> Actualizar ahora</button>
        </div>
      </header>

      <div class="summary-strip" id="inv-resumen"></div>

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
          <thead><tr><th>Libro</th><th>ISBN</th><th class="right">En stock</th><th class="right">Vendidos</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody id="inv-tbody"><tr><td colspan="6"><p class="list-empty">Cargando inventario…</p></td></tr></tbody>
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
  const bajos = inv.libros.filter(l => l.stock > 0 && l.stock <= STOCK_BAJO).length;
  const vendidas = inv.libros.reduce((s, l) => s + l.vendidos, 0);
  document.getElementById('inv-resumen').innerHTML = `
    <div><b>${unidades}</b><span>Unidades en stock</span></div>
    <div><b>${inv.libros.length}</b><span>Títulos</span></div>
    <div class="${agotados ? 'warn' : ''}"><b>${agotados}</b><span>Agotados</span></div>
    <div class="${bajos ? 'warn' : ''}"><b>${bajos}</b><span>Stock bajo (≤ ${STOCK_BAJO})</span></div>
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
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty" style="padding:28px"><p>${inv.libros.length ? 'Ningún libro coincide con ese título o ISBN.' : 'Aún no hay libros en el inventario.'}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filas.map(l => {
    const antes = inv.anterior.get(l.id_libro);
    const cambio = antes !== undefined && antes !== l.stock;   // ¿cambió desde la última consulta?
    const nivel = l.stock === 0 ? 'stock-cero' : (l.stock <= STOCK_BAJO ? 'stock-bajo' : '');
    return `
      <tr>
        <td><div class="title-cell"><img src="${portada(l)}" alt="" loading="lazy" onerror="this.src=window.PORTADA_DEFECTO" /><div><b>${esc(l.titulo)}</b><span>${esc(l.autor)}</span></div></div></td>
        <td class="mono">${esc(l.ISBN || '—')}</td>
        <td class="right"><span class="stock-num ${nivel} ${cambio ? 'cambio' : ''}" title="${cambio ? `Antes: ${antes}` : ''}">${l.stock}</span></td>
        <td class="right">${l.vendidos}</td>
        <td><span class="status ${l.stock === 0 ? 'status-out' : (l.stock <= STOCK_BAJO ? 'status-bajo' : 'status-ok')}">${l.stock > 0 ? (l.stock <= STOCK_BAJO ? 'Stock bajo' : 'Disponible') : 'Agotado'}</span></td>
        <td><div class="row-actions">
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
  const ok = await window.confirmar({
    titulo: `¿Registrar la devolución del ${window.numeroRegistro(idPedido)}?`,
    mensaje: `Las ${p.items.reduce((s, i) => s + i.cantidad, 0)} unidad(es) vuelven al inventario y el pedido queda como Devuelto.`,
    confirmar: 'Registrar devolución'
  });
  if (!ok) return;
  try {
    const res = await window.fetchAPI(`/api/pedidos/${idPedido}/devolucion`, { method: 'POST' });
    if (!res.ok) throw await leerError(res, 'No se pudo registrar la devolución');
    window.showToast('Devolución registrada. El stock ya se repuso.');
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
          <span>${esc(libros)} · pedida ${fechaHora(sol.fecha_solicitud)}${!pendiente ? ` · respondida por ${esc(sol.revisor || '—')}` : ''}</span>
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

  if (decision === 'aprobar') {
    const ok = await window.confirmar({
      titulo: `¿Aprobar la devolución del ${window.numeroRegistro(sol.id_pedido)}?`,
      mensaje: `Las ${unidades} unidad(es) vuelven al inventario y ${sol.cliente || 'el cliente'} verá su pedido como devuelto.`,
      confirmar: 'Aprobar devolución'
    });
    if (!ok) return;
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
      body: JSON.stringify({ decision, respuesta })
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

const fact = { filtros: { pedido: '', desde: '', hasta: '' }, resultados: [] };

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
          <thead><tr><th>Factura</th><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th class="right">Total</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead>
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
    buscarFacturas();
  });
  document.getElementById('facturas-limpiar').addEventListener('click', () => {
    fact.filtros = { pedido: '', desde: '', hasta: '' };
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
  const { pedido, desde, hasta } = fact.filtros;
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

  try {
    const res = await window.fetchAPI(`/api/facturas?${params}`);
    if (!res.ok) throw await leerError(res, 'No se pudieron buscar las facturas');
    fact.resultados = (await res.json()).facturas;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty" style="padding:28px"><p>${esc(e.message)}</p></div></td></tr>`;
    return;
  }

  const hayFiltro = pedido || desde || hasta;
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
      <td>${esc(x.metodo_pago || '—')}</td>
      <td class="right"><b>${window.formatPrecio(x.total)}</b></td>
      <td><span class="status ${x.estado_pedido === 'Devuelto' ? 'status-out' : 'status-ok'}">${x.estado_pedido === 'Devuelto' ? 'Anulada (devuelto)' : 'Vigente'}</span></td>
      <td><div class="row-actions">
        <a class="icon-btn" href="factura.html?id=${x.id_factura}" target="_blank" rel="noopener" aria-label="Abrir factura ${window.numeroRegistro(x.id_factura)}" title="Abrir"><i class="fas fa-eye"></i></a>
        <a class="icon-btn" href="factura.html?id=${x.id_factura}&descargar=1" target="_blank" rel="noopener" aria-label="Descargar factura ${window.numeroRegistro(x.id_factura)} en PDF" title="Descargar PDF"><i class="fas fa-file-arrow-down"></i></a>
      </div></td>
    </tr>`).join('');
}
