/**
 * @file script.js
 * @description Tienda: catálogo con pestañas de género, ficha del libro con reseñas,
 * controles rápidos de disponibilidad para administradores y carga del perfil.
 */

let catalogoLibros = [];
let generoSeleccionado = 'Todos';
let libroDetalleActual = null;
let calificacionElegida = 5;

document.addEventListener('DOMContentLoaded', () => {
  const user = window.getCurrentUser();

  const welcome = document.getElementById('welcome');
  if (welcome && user && user.nombre) {
    welcome.textContent = `Hola de nuevo, ${user.nombre.split(' ')[0]}`;
  }

  const adminBtn = document.getElementById('btn-admin-new');
  if (adminBtn) adminBtn.hidden = !window.isAdmin();

  if (document.getElementById('books-container')) {
    inicializarCatalogo();
    inicializarFicha();
  }

  if (document.getElementById('profile-nombre') && user) {
    cargarDatosPerfil(user.id);
  }
});

/* ---------------------------------------------------------------
   CATÁLOGO
   --------------------------------------------------------------- */
async function cargarLibros() {
  try {
    const res = await fetch(`${window.API_BASE}/api/libros`);
    if (!res.ok) throw new Error('No se pudo obtener el catálogo');
    const data = await res.json();
    catalogoLibros = data.libros || [];
    return true;
  } catch (error) {
    console.warn('No fue posible conectar con la API:', error);
    catalogoLibros = [];
    return false;
  }
}

async function inicializarCatalogo() {
  const ok = await cargarLibros();
  if (!ok) {
    document.getElementById('books-container').innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <i class="fas fa-plug-circle-xmark" aria-hidden="true"></i>
        <h2>No pudimos cargar el catálogo</h2>
        <p>El servidor no respondió. Revisa tu conexión e inténtalo de nuevo en unos segundos.</p>
        <button type="button" class="btn btn-secondary" onclick="location.reload()">Reintentar</button>
      </div>`;
    return;
  }

  renderizarPestanas();
  renderizarLibros();

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => renderizarLibros());

  // Abrir la ficha si llega con ?libro=ID
  const id = new URLSearchParams(location.search).get('libro');
  if (id) abrirDetalleLibro(Number(id));
}

function renderizarPestanas() {
  const tabs = document.getElementById('genre-tabs');
  const conteo = {};
  catalogoLibros.forEach(l => {
    const g = l.genero || 'General';
    conteo[g] = (conteo[g] || 0) + 1;
  });
  const generos = Object.keys(conteo).sort((a, b) => a.localeCompare(b, 'es'));

  tabs.innerHTML = [
    `<button type="button" class="index-tab" role="tab" data-genre="Todos" aria-selected="${generoSeleccionado === 'Todos'}">Todos <span class="n">${catalogoLibros.length}</span></button>`,
    ...generos.map(g => `
      <button type="button" class="index-tab" role="tab" data-genre="${window.esc(g)}" aria-selected="${generoSeleccionado === g}" style="--g:${window.genreColor(g)}">
        <i aria-hidden="true"></i>${window.esc(g)} <span class="n">${conteo[g]}</span>
      </button>`)
  ].join('');

  tabs.onclick = (e) => {
    const tab = e.target.closest('.index-tab');
    if (!tab) return;
    generoSeleccionado = tab.dataset.genre;
    tabs.querySelectorAll('.index-tab').forEach(t => t.setAttribute('aria-selected', String(t === tab)));
    renderizarLibros();
  };
}

function librosFiltrados() {
  const termino = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  return catalogoLibros.filter(libro => {
    const coincideGenero = generoSeleccionado === 'Todos' || (libro.genero || 'General') === generoSeleccionado;
    const texto = `${libro.titulo} ${libro.autor} ${libro.genero} ${libro.ISBN || ''}`.toLowerCase();
    return coincideGenero && (!termino || texto.includes(termino));
  });
}

function renderizarLibros() {
  const container = document.getElementById('books-container');
  const meta = document.getElementById('catalog-meta');
  const filtrados = librosFiltrados();
  const admin = window.isAdmin();

  if (meta) {
    meta.textContent = filtrados.length === catalogoLibros.length
      ? `${catalogoLibros.length} títulos`
      : `${filtrados.length} de ${catalogoLibros.length} títulos`;
  }

  if (catalogoLibros.length === 0) {
    container.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <i class="fas fa-book" aria-hidden="true"></i>
        <h2>El catálogo está vacío</h2>
        <p>${admin ? 'Agrega el primer libro desde la administración de la tienda.' : 'Pronto habrá libros disponibles.'}</p>
        ${admin ? '<a class="btn btn-primary" href="admin.html#libros/nuevo">Agregar libro</a>' : ''}
      </div>`;
    return;
  }

  if (filtrados.length === 0) {
    container.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
        <h2>Ningún libro coincide</h2>
        <p>Prueba con otro título, autor o ISBN, o cambia de género.</p>
      </div>`;
    return;
  }

  container.innerHTML = filtrados.map(libro => {
    const disponible = libro.disponibilidad !== 'Agotado';
    const titulo = window.esc(libro.titulo);
    return `
      <article class="book ${disponible ? '' : 'is-out'}" data-id="${libro.id_libro}">
        <button type="button" class="book-cover-btn" onclick="abrirDetalleLibro(${libro.id_libro})" aria-label="Ver ficha de ${titulo}">
          <img src="${window.esc(libro.portada || window.PORTADA_DEFECTO)}" alt="" loading="lazy" onerror="this.src=window.PORTADA_DEFECTO" />
          ${disponible ? '' : '<span class="stamp">AGOTADO</span>'}
        </button>
        <div class="book-body">
          <span class="genre" style="--g:${window.genreColor(libro.genero)}"><i aria-hidden="true"></i>${window.esc(libro.genero || 'General')}</span>
          <h3 class="book-title"><button type="button" onclick="abrirDetalleLibro(${libro.id_libro})">${titulo}</button></h3>
          <p class="book-author">${window.esc(libro.autor)}</p>
          <div class="book-meta">
            <span class="price">${window.formatPrecio(libro.precio)}</span>
            ${window.ratingHTML(libro.promedio_reseña)}
          </div>
          <div class="book-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-block" onclick="agregarAlCarritoPorId(${libro.id_libro})" ${disponible ? '' : 'disabled'}>
              ${disponible ? '<i class="fas fa-plus" aria-hidden="true"></i> Añadir al carrito' : 'Sin existencias'}
            </button>
          </div>
          ${admin ? `
          <div class="admin-strip">
            <label class="switch" title="Disponibilidad">
              <input type="checkbox" ${disponible ? 'checked' : ''} onchange="toggleDisponibilidad(${libro.id_libro}, this)" />
              <span class="track" aria-hidden="true"></span>
              <span class="lbl-on">Disponible</span><span class="lbl-off">Agotado</span>
            </label>
            <a href="admin.html#libros/${libro.id_libro}"><i class="fas fa-pen" aria-hidden="true"></i> Editar</a>
          </div>` : ''}
        </div>
      </article>`;
  }).join('');
}

function agregarAlCarritoPorId(idLibro) {
  const libro = catalogoLibros.find(l => l.id_libro === idLibro);
  if (libro) window.addToCart(libro);
}

/** Control rápido del dueño: cambia Disponible / Agotado desde el catálogo. */
async function toggleDisponibilidad(idLibro, input) {
  const nuevoEstado = input.checked ? 'Disponible' : 'Agotado';
  const label = input.closest('.switch');
  label.classList.add('busy');
  try {
    const res = await window.fetchAPI(`/api/libros/${idLibro}`, {
      method: 'PUT',
      body: JSON.stringify({ disponibilidad: nuevoEstado })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo actualizar la disponibilidad');
    }
    const libro = catalogoLibros.find(l => l.id_libro === idLibro);
    if (libro) libro.disponibilidad = nuevoEstado;
    window.showToast(`«${libro ? libro.titulo : 'Libro'}» ahora está ${nuevoEstado.toLowerCase()}.`);
    renderizarLibros();
  } catch (e) {
    input.checked = !input.checked;
    label.classList.remove('busy');
    window.showToast(e.message, 'error');
  }
}

/* ---------------------------------------------------------------
   FICHA DEL LIBRO
   --------------------------------------------------------------- */
function inicializarFicha() {
  const sheet = document.getElementById('book-sheet');

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('[data-close-sheet]')) cerrarFicha();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('active')) cerrarFicha();
  });

  // Selector de calificación
  const stars = document.getElementById('star-selector');
  stars.innerHTML = [1, 2, 3, 4, 5].map(n =>
    `<button type="button" role="radio" data-rating="${n}" aria-label="${n} de 5"><i class="fas fa-star" aria-hidden="true"></i></button>`
  ).join('');
  const pintarEstrellas = () => {
    stars.querySelectorAll('button').forEach(b => {
      const n = Number(b.dataset.rating);
      b.classList.toggle('on', n <= calificacionElegida);
      b.setAttribute('aria-checked', String(n === calificacionElegida));
    });
  };
  stars.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    calificacionElegida = Number(b.dataset.rating);
    pintarEstrellas();
  });
  pintarEstrellas();

  document.getElementById('detail-add').addEventListener('click', () => {
    if (libroDetalleActual) window.addToCart(libroDetalleActual);
  });

  document.getElementById('form-add-review').addEventListener('submit', enviarResena);
}

async function abrirDetalleLibro(idLibro) {
  const libro = catalogoLibros.find(l => l.id_libro === idLibro);
  if (!libro) return;
  libroDetalleActual = libro;

  const disponible = libro.disponibilidad !== 'Agotado';

  document.getElementById('detail-call').textContent = window.numeroRegistro(libro.id_libro);
  document.getElementById('detail-isbn').textContent = libro.ISBN ? `ISBN ${libro.ISBN}` : 'ISBN sin registrar';
  document.getElementById('detail-title').textContent = libro.titulo;
  document.getElementById('detail-author').textContent = libro.autor || 'Autor desconocido';
  const cover = document.getElementById('detail-cover');
  cover.src = libro.portada || window.PORTADA_DEFECTO;
  cover.alt = `Portada de ${libro.titulo}`;
  cover.onerror = () => { cover.src = window.PORTADA_DEFECTO; };
  document.getElementById('detail-genre').innerHTML = `<span class="genre" style="--g:${window.genreColor(libro.genero)}"><i aria-hidden="true"></i>${window.esc(libro.genero || 'General')}</span>`;
  document.getElementById('detail-rating').innerHTML = window.ratingHTML(libro.promedio_reseña, ' de 5');
  document.getElementById('detail-status').innerHTML = `<span class="status ${disponible ? 'status-ok' : 'status-out'}">${disponible ? 'Disponible' : 'Agotado'}</span>`;
  document.getElementById('detail-price').textContent = window.formatPrecio(libro.precio);
  document.getElementById('detail-desc').textContent = libro.descripcion || 'Este libro todavía no tiene sinopsis.';

  const addBtn = document.getElementById('detail-add');
  addBtn.disabled = !disponible;
  addBtn.innerHTML = disponible ? '<i class="fas fa-bag-shopping" aria-hidden="true"></i> Añadir al carrito' : 'Sin existencias';

  const edit = document.getElementById('detail-admin-edit');
  edit.hidden = !window.isAdmin();
  edit.href = `admin.html#libros/${libro.id_libro}`;

  const sheet = document.getElementById('book-sheet');
  sheet.classList.add('active');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  sheet.querySelector('.sheet-close').focus();

  cargarResenas(idLibro);
}

function cerrarFicha() {
  const sheet = document.getElementById('book-sheet');
  sheet.classList.remove('active');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

async function cargarResenas(idLibro) {
  const list = document.getElementById('detail-reviews-list');
  list.innerHTML = '<p class="field-hint">Cargando reseñas…</p>';
  try {
    const res = await fetch(`${window.API_BASE}/api/libros/${idLibro}/resenas`);
    const data = res.ok ? await res.json() : { resenas: [] };
    renderizarResenas(data.resenas || []);
  } catch {
    list.innerHTML = '<p class="field-hint">No se pudieron cargar las reseñas.</p>';
  }
}

function renderizarResenas(resenas) {
  const list = document.getElementById('detail-reviews-list');
  if (resenas.length === 0) {
    list.innerHTML = '<p class="field-hint">Aún no hay reseñas. Sé el primero en contar qué te pareció.</p>';
    return;
  }
  list.innerHTML = resenas.map(r => {
    const calif = parseFloat(r.calificacion || 0);
    const fecha = r.fecha ? new Date(r.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    return `
      <div class="review">
        <div class="review-top">
          <b>${window.esc(r.usuario_nombre || 'Lector')} <span class="rating" style="margin-left:6px"><i class="fas fa-star" aria-hidden="true"></i>${calif.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span></b>
          <time>${window.esc(fecha)}</time>
        </div>
        <p>${window.esc(r.reseña)}</p>
      </div>`;
  }).join('');
}

async function enviarResena(e) {
  e.preventDefault();
  if (!libroDetalleActual) return;
  const user = window.getCurrentUser();
  const textarea = document.getElementById('review-comment');
  const reseña = textarea.value.trim();
  if (!reseña) return;

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const res = await fetch(`${window.API_BASE}/api/libros/${libroDetalleActual.id_libro}/resenas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reseña, calificacion: calificacionElegida, id_usuario: user ? user.id : null })
    });
    if (!res.ok) throw new Error('No se pudo publicar la reseña. Inténtalo de nuevo.');
    window.showToast('Gracias, tu reseña ya está publicada.');
    textarea.value = '';
    await cargarResenas(libroDetalleActual.id_libro);
    await cargarLibros();
    renderizarLibros();
  } catch (err) {
    window.showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ---------------------------------------------------------------
   PERFIL
   --------------------------------------------------------------- */
async function cargarDatosPerfil(userId) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const pintar = (u, registro) => {
    set('profile-nombre', u.nombre || '');
    set('profile-email', u.email || '');
    set('profile-telefono', u.telefono || 'Sin registrar');
    set('profile-direccion', u.direccion || 'Sin registrar');
    set('profile-registro', registro);
    set('profile-call', window.numeroRegistro(u.id));
    set('profile-rol', u.rol === 'admin' ? 'Administrador' : 'Cliente');
  };

  try {
    const response = await fetch(`${window.API_BASE}/api/usuarios/${userId}`);
    if (!response.ok) throw new Error('Error al consultar el perfil');
    const { usuario } = await response.json();
    const registro = usuario.fecha_registro
      ? new Date(usuario.fecha_registro).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'Sin fecha';
    pintar(usuario, registro);
  } catch (error) {
    console.error(error);
    const local = window.getCurrentUser();
    if (local) pintar(local, 'No disponible sin conexión');
  }
}
