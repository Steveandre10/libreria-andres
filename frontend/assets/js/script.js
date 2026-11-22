/**
 * @file script.js
 * @description Tienda: catálogo con pestañas de género, ficha del libro con reseñas,
 * controles rápidos de disponibilidad para administradores y carga del perfil.
 */

let catalogoLibros = [];
let generoSeleccionado = 'Todos';
let libroDetalleActual = null;
let calificacionElegida = 5;
let favoritos = new Set();   // RF24: ids de los libros en la lista de deseos del usuario

document.addEventListener('DOMContentLoaded', () => {
  const user = window.getCurrentUser();

  const welcome = document.getElementById('welcome');
  if (welcome && user && user.nombre) {
    welcome.textContent = `Hola de nuevo, ${user.nombre.split(' ')[0]}`;
  }

  const adminBtn = document.getElementById('btn-admin-new');
  if (adminBtn) adminBtn.hidden = !window.puede('libros'); // RF18

  if (document.getElementById('books-container')) {
    inicializarCatalogo();
    inicializarFicha();
  }

  if (document.getElementById('profile-nombre') && user) {
    cargarDatosPerfil(user.id);
    if (document.getElementById('pref-notificaciones')) cargarPreferencias();   // RF26
  }

  if (document.getElementById('lista-deseos')) cargarListaDeseos();   // RF24
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

  await cargarFavoritos();     // RF24: para pintar los corazones llenos
  renderizarPestanas();
  renderizarLibros();
  cargarRecomendaciones();     // RF25

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => renderizarLibros());
  // RF22: volver a pintar el catálogo cada vez que cambia un filtro
  ['precio-min', 'precio-max', 'solo-disponibles'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => renderizarLibros());
  });
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

/**
 * RF22 · Devuelve los libros que cumplen TODOS los filtros activos a la vez:
 * texto (título o autor), género, rango de precio y "solo disponibles".
 * @returns {Array<Object>} Libros filtrados.
 */
function librosFiltrados() {
  const termino = (document.getElementById('search-input')?.value || '').trim().toLowerCase();

  // Si el campo está vacío, parseFloat devuelve NaN y ese límite no se aplica
  const min = parseFloat(document.getElementById('precio-min')?.value);
  const max = parseFloat(document.getElementById('precio-max')?.value);
  const soloDisponibles = document.getElementById('solo-disponibles')?.checked;

  return catalogoLibros.filter(libro => {
    const precio = parseFloat(libro.precio) || 0;

    const coincideTexto = !termino ||
      `${libro.titulo} ${libro.autor}`.toLowerCase().includes(termino);
    const coincideGenero = generoSeleccionado === 'Todos' ||
      (libro.genero || 'General') === generoSeleccionado;
    const coincideMin = isNaN(min) || precio >= min;
    const coincideMax = isNaN(max) || precio <= max;
    const coincideDisponible = !soloDisponibles || libro.disponibilidad === 'Disponible';

    // Con && el libro tiene que pasar todos los filtros (así se combinan)
    return coincideTexto && coincideGenero && coincideMin && coincideMax && coincideDisponible;
  });
}

function renderizarLibros() {
  const container = document.getElementById('books-container');
  const meta = document.getElementById('catalog-meta');
  const filtrados = librosFiltrados();
  const admin = window.puede('libros', 'editar'); // RF18: controles rápidos solo si puede editar libros

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
  // RF22: avisar si el rango de precio está al revés
  const min = parseFloat(document.getElementById('precio-min').value);
  const max = parseFloat(document.getElementById('precio-max').value);
  if (!isNaN(min) && !isNaN(max) && min > max) {
    container.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <h2>Revisa el rango de precio</h2>
      <p>El precio mínimo no puede ser mayor que el máximo.</p></div>`;
    return;
  }
  if (filtrados.length === 0) {
    container.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
        <h2>Ningún libro coincide</h2>
        <p>Ningún libro cumple todos los filtros. Prueba quitando alguno.</p>
        <button type="button" class="btn btn-secondary" onclick="limpiarFiltros()">Limpiar filtros</button>
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
          ${disponible && libro.stock <= 3 ? `<p class="pocas-unidades">Quedan ${libro.stock}</p>` : ''}  
          <div class="book-actions">
            ${disponible
              ? `<button type="button" class="btn btn-secondary btn-sm btn-block" onclick="agregarAlCarritoPorId(${libro.id_libro})"><i class="fas fa-plus" aria-hidden="true"></i> Añadir al carrito</button>`
              : `<button type="button" class="btn btn-quiet btn-sm btn-block" onclick="avisarmeCuandoLlegue(${libro.id_libro})"><i class="far fa-bell" aria-hidden="true"></i> Avisarme cuando llegue</button>`}
            ${botonFavorito(libro)}
          </div>
            ${admin ? `
                      <div class="admin-strip">
              <span class="${libro.stock > 0 ? '' : 'stock-cero'}"><b>${libro.stock}</b> en stock</span>
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

/**
 * RF22 · Deja todos los filtros en su valor inicial y vuelve a mostrar el catálogo completo.
 */
function limpiarFiltros() {
  document.getElementById('search-input').value = '';
  document.getElementById('precio-min').value = '';
  document.getElementById('precio-max').value = '';
  document.getElementById('solo-disponibles').checked = false;
  generoSeleccionado = 'Todos';
  renderizarPestanas(); // vuelve a marcar la pestaña "Todos"
  renderizarLibros();
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
    if (!libroDetalleActual) return;
    if (libroDetalleActual.disponibilidad === 'Agotado') avisarmeCuandoLlegue(libroDetalleActual.id_libro);
    else window.addToCart(libroDetalleActual);
  });
  document.getElementById('detail-fav').addEventListener('click', () => {
    if (libroDetalleActual) alternarFavorito(libroDetalleActual.id_libro);
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
  // RF26: si está agotado, el botón principal pasa a ser "Avisarme cuando llegue"
  addBtn.innerHTML = disponible ? '<i class="fas fa-bag-shopping" aria-hidden="true"></i> Añadir al carrito' : '<i class="far fa-bell" aria-hidden="true"></i> Avisarme cuando llegue';
  pintarFavoritoFicha();
  registrarVista(libro.id_libro);   // RF25: historial de navegación

  const edit = document.getElementById('detail-admin-edit');
  edit.hidden = !window.puede('libros', 'editar'); // RF18
  edit.href = `admin.html#libros/${libro.id_libro}`;

  const sheet = document.getElementById('book-sheet');
  sheet.classList.add('active');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  sheet.querySelector('.sheet-close').focus();

  cargarResenas(idLibro);
  revisarPermisoResena(idLibro);   // RF29
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
  const textarea = document.getElementById('review-comment');
  const reseña = textarea.value.trim();   // RF29: el comentario es opcional

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    // RF29: se manda con el token; el servidor sabe quién es y revisa que haya comprado el libro
    const res = await window.fetchAPI(`/api/libros/${libroDetalleActual.id_libro}/resenas`, {
      method: 'POST',
      body: JSON.stringify({ reseña, calificacion: calificacionElegida })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo enviar la reseña. Inténtalo de nuevo.');
    window.showToast(data.message);
    textarea.value = '';
    await revisarPermisoResena(libroDetalleActual.id_libro);
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
    // RF16: la ficha de un usuario ya no es pública; se pide con el token de la sesión
    const response = await window.fetchAPI(`/api/usuarios/${userId}`);
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


/* ---------------------------------------------------------------
   RF24 · LISTA DE DESEOS (FAVORITOS)
   El corazón de cada libro agrega o quita el libro de /api/favoritos.
   La lista completa se ve en wishlist.html ("Lista de deseos" en el menú).
   --------------------------------------------------------------- */
async function cargarFavoritos() {
  if (!window.getCurrentUser()) return;
  try {
    const res = await window.fetchAPI('/api/favoritos');
    if (res.ok) favoritos = new Set((await res.json()).favoritos.map(f => f.id_libro));
  } catch {
    // sin conexión: los corazones salen vacíos
  }
}

/** Botón de corazón para la tarjeta del catálogo. */
function botonFavorito(libro) {
  const esFav = favoritos.has(libro.id_libro);
  return `<button type="button" class="icon-btn fav-btn ${esFav ? 'on' : ''}" aria-pressed="${esFav}"
            onclick="alternarFavorito(${libro.id_libro})" aria-label="${esFav ? 'Quitar de' : 'Agregar a'} favoritos: ${window.esc(libro.titulo)}"
            title="${esFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}"><i class="${esFav ? 'fas' : 'far'} fa-heart" aria-hidden="true"></i></button>`;
}

function pintarFavoritoFicha() {
  const btn = document.getElementById('detail-fav');
  if (!btn || !libroDetalleActual) return;
  const esFav = favoritos.has(libroDetalleActual.id_libro);
  btn.setAttribute('aria-pressed', String(esFav));
  btn.classList.toggle('on', esFav);
  btn.innerHTML = `<i class="${esFav ? 'fas' : 'far'} fa-heart" aria-hidden="true"></i> <span>${esFav ? 'En tus favoritos' : 'Agregar a favoritos'}</span>`;
}

/** Agrega o quita un libro de favoritos (pide iniciar sesión si no hay). */
async function alternarFavorito(idLibro) {
  if (!window.getCurrentUser()) {
    window.showToast('Inicia sesión para guardar libros en tu lista de deseos.', 'error');
    return;
  }
  const quitar = favoritos.has(idLibro);
  try {
    const res = quitar
      ? await window.fetchAPI(`/api/favoritos/${idLibro}`, { method: 'DELETE' })
      : await window.fetchAPI('/api/favoritos', { method: 'POST', body: JSON.stringify({ id_libro: idLibro }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo actualizar tu lista de deseos');
    if (quitar) favoritos.delete(idLibro); else favoritos.add(idLibro);
    window.showToast(data.message);
    if (document.getElementById('books-container')) renderizarLibros();
    pintarFavoritoFicha();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
}

/** wishlist.html · Pinta la lista con "Mover al carrito" y "Quitar". */
async function cargarListaDeseos() {
  const caja = document.getElementById('lista-deseos');
  if (!window.getCurrentUser()) {
    caja.innerHTML = `<div class="panel"><div class="empty"><i class="fas fa-heart" aria-hidden="true"></i>
      <h2>Inicia sesión para ver tu lista de deseos</h2><a href="login.html" class="btn btn-primary">Iniciar sesión</a></div></div>`;
    return;
  }
  let lista = [];
  try {
    const res = await window.fetchAPI('/api/favoritos');
    if (!res.ok) throw new Error();
    lista = (await res.json()).favoritos;
  } catch {
    caja.innerHTML = '<div class="panel"><div class="empty"><h2>No pudimos cargar tu lista</h2><p>Revisa tu conexión e inténtalo de nuevo.</p></div></div>';
    return;
  }
  if (!lista.length) {
    caja.innerHTML = `<div class="panel"><div class="empty"><i class="fas fa-heart" aria-hidden="true"></i>
      <h2>Tu lista de deseos está vacía</h2><p>Toca el corazón de cualquier libro del catálogo para guardarlo aquí.</p>
      <a href="index.html" class="btn btn-primary">Ir al catálogo</a></div></div>`;
    return;
  }
  caja.innerHTML = `<p class="field-hint" style="margin-bottom:12px">${lista.length} libro(s) guardado(s)</p>
    <ul class="panel list deseos">${lista.map(l => {
      const disponible = l.stock > 0;
      return `
      <li>
        <img class="thumb" src="${window.esc(l.portada || window.PORTADA_DEFECTO)}" alt="" onerror="this.src=window.PORTADA_DEFECTO" />
        <div class="grow">
          <a class="link" href="index.html?libro=${l.id_libro}"><b>${window.esc(l.titulo)}</b></a>
          <span>${window.esc(l.autor)} · ${window.formatPrecio(l.precio)}</span>
          <span><span class="status ${disponible ? 'status-ok' : 'status-out'}">${disponible ? 'Disponible' : 'Agotado'}</span></span>
        </div>
        ${disponible
          ? `<button type="button" class="btn btn-primary btn-sm" onclick="moverAlCarrito(${l.id_libro})"><i class="fas fa-bag-shopping" aria-hidden="true"></i> Mover al carrito</button>`
          : `<button type="button" class="btn btn-secondary btn-sm" onclick="avisarmeCuandoLlegue(${l.id_libro})"><i class="far fa-bell" aria-hidden="true"></i> Avisarme</button>`}
        <button type="button" class="icon-btn danger" onclick="quitarDeseo(${l.id_libro})" aria-label="Quitar ${window.esc(l.titulo)} de la lista" title="Quitar"><i class="fas fa-trash-can"></i></button>
      </li>`; }).join('')}</ul>`;
  window._deseos = lista;
}

/** RF24 · Pasa el libro al carrito y lo quita de la lista. */
async function moverAlCarrito(idLibro) {
  const libro = (window._deseos || []).find(l => l.id_libro === idLibro);
  if (!libro) return;
  const unidades = () => window.getCart().reduce((s, i) => s + (i.cantidad || 1), 0);
  const antes = unidades();
  window.addToCart(libro);
  if (unidades() === antes) return;   // no se pudo (sin stock): se queda en la lista
  await window.fetchAPI(`/api/favoritos/${idLibro}`, { method: 'DELETE' }).catch(() => {});
  cargarListaDeseos();
}

async function quitarDeseo(idLibro) {
  try {
    const res = await window.fetchAPI(`/api/favoritos/${idLibro}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo quitar el libro');
    window.showToast('Libro quitado de tu lista de deseos.');
    cargarListaDeseos();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
}

/* ---------------------------------------------------------------
   RF26 · "AVISARME CUANDO LLEGUE" Y PREFERENCIAS DE NOTIFICACIÓN
   --------------------------------------------------------------- */
async function avisarmeCuandoLlegue(idLibro) {
  if (!window.getCurrentUser()) {
    window.showToast('Inicia sesión para que te avisemos cuando llegue.', 'error');
    return;
  }
  try {
    const res = await window.fetchAPI(`/api/suscripciones/avisos/${idLibro}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar el aviso');
    window.showToast(data.message);
  } catch (e) {
    window.showToast(e.message, 'error');
  }
}

/** profile.html · Interruptores de promociones, novedades y reposición + libros que espera. */
async function cargarPreferencias() {
  const caja = document.getElementById('pref-notificaciones');
  try {
    const res = await window.fetchAPI('/api/suscripciones');
    if (!res.ok) throw new Error();
    const { preferencias, avisos } = await res.json();
    const opciones = [
      ['promociones', 'Promociones', 'Descuentos y ofertas de la librería.'],
      ['novedades', 'Novedades editoriales', 'Cuando llega un libro nuevo al catálogo.'],
      ['reposicion', 'Reposición de stock', 'Cuando vuelve un libro agotado que pediste con «Avisarme cuando llegue».']
    ];
    const esperando = avisos.filter(a => !a.fecha_aviso);
    caja.innerHTML = `
      <div class="pref-lista">
        ${opciones.map(([clave, titulo, ayuda]) => `
          <label class="pref">
            <input type="checkbox" data-pref="${clave}" ${preferencias[clave] ? 'checked' : ''} />
            <span><b>${titulo}</b><span class="field-hint">${ayuda}</span></span>
          </label>`).join('')}
      </div>
      <p class="field-hint" style="margin-top:10px">Las notificaciones llegan a tu correo.</p>
      ${esperando.length ? `<h3 class="field-label" style="margin-top:16px">Libros que esperas</h3>
        <ul class="list list-compacta">${esperando.map(a => `<li><div class="grow"><b>${window.esc(a.titulo)}</b><span>Pedido el ${new Date(a.fecha).toLocaleDateString('es-CO')}</span></div>
          <button type="button" class="btn btn-quiet btn-sm" onclick="cancelarAviso(${a.id_libro})">No avisarme</button></li>`).join('')}</ul>` : ''}`;
    caja.querySelectorAll('[data-pref]').forEach(chk => chk.addEventListener('change', async () => {
      try {
        const r = await window.fetchAPI('/api/suscripciones', { method: 'PUT', body: JSON.stringify({ [chk.dataset.pref]: chk.checked }) });
        if (!r.ok) throw new Error();
        window.showToast(`${chk.checked ? 'Activaste' : 'Desactivaste'}: ${chk.closest('label').querySelector('b').textContent}.`);
      } catch {
        chk.checked = !chk.checked;
        window.showToast('No se pudo guardar tu preferencia.', 'error');
      }
    }));
  } catch {
    caja.innerHTML = '<p class="field-hint">No pudimos cargar tus preferencias.</p>';
  }
}

async function cancelarAviso(idLibro) {
  await window.fetchAPI(`/api/suscripciones/avisos/${idLibro}`, { method: 'DELETE' }).catch(() => {});
  window.showToast('Ya no te avisaremos de ese libro.');
  cargarPreferencias();
}

/* ---------------------------------------------------------------
   RF29 · ¿PUEDE ESTE USUARIO RESEÑAR EL LIBRO?
   El formulario solo aparece si compró el libro y no tiene una reseña pendiente o aprobada.
   --------------------------------------------------------------- */
async function revisarPermisoResena(idLibro) {
  const aviso = document.getElementById('review-estado');
  const form = document.getElementById('form-add-review');
  const mostrar = (texto, conForm = false) => {
    aviso.innerHTML = texto;
    aviso.hidden = !texto;
    form.hidden = !conForm;
  };
  if (!window.getCurrentUser()) return mostrar('<i class="fas fa-lock" aria-hidden="true"></i> <a class="link" href="login.html">Inicia sesión</a> para reseñar los libros que compraste.');
  mostrar('');
  try {
    const res = await window.fetchAPI(`/api/libros/${idLibro}/resenas/mia`);
    if (!res.ok) throw new Error();
    const { compro, resena } = await res.json();
    if (libroDetalleActual?.id_libro !== idLibro) return;
    if (!compro) return mostrar('<i class="fas fa-bag-shopping" aria-hidden="true"></i> Solo quienes compraron este libro pueden reseñarlo.');
    if (resena?.estado === 'Pendiente') return mostrar('<i class="fas fa-hourglass-half" aria-hidden="true"></i> Tu reseña está pendiente: se publicará cuando el administrador la apruebe.');
    if (resena?.estado === 'Aprobada') return mostrar('<i class="fas fa-circle-check" aria-hidden="true"></i> Ya reseñaste este libro. ¡Gracias!');
    if (resena?.estado === 'Rechazada') return mostrar(`<i class="fas fa-circle-xmark" aria-hidden="true"></i> Tu reseña anterior no fue aprobada${resena.motivo_moderacion ? ` (${window.esc(resena.motivo_moderacion)})` : ''}. Puedes escribir otra.`, true);
    mostrar('', true);
  } catch {
    mostrar('No pudimos revisar si puedes reseñar este libro.');
  }
}

/* ---------------------------------------------------------------
   RF25 · RECOMENDADOS PARA TI
   --------------------------------------------------------------- */
/** Guarda que el usuario abrió la ficha (solo con sesión; si falla, no pasa nada). */
function registrarVista(idLibro) {
  if (!window.getCurrentUser()) return;
  window.fetchAPI('/api/recomendaciones/vista', { method: 'POST', body: JSON.stringify({ id_libro: idLibro }) }).catch(() => {});
}

async function cargarRecomendaciones() {
  const caja = document.getElementById('recomendados');
  if (!caja) return;
  try {
    const res = await window.fetchAPI('/api/recomendaciones');
    if (!res.ok) throw new Error();
    const { tipo, libros } = await res.json();
    if (!libros.length) return;
    document.getElementById('reco-sub').textContent = tipo === 'personal'
      ? 'Según los libros que viste y compraste.'
      : 'Los más vendidos de la librería. Mientras más explores, más personales serán.';
    document.getElementById('reco-lista').innerHTML = libros.map(l => `
      <button type="button" class="reco" onclick="abrirDetalleLibro(${l.id_libro})" aria-label="Ver ${window.esc(l.titulo)}">
        <img src="${window.esc(l.portada || window.PORTADA_DEFECTO)}" alt="" loading="lazy" onerror="this.src=window.PORTADA_DEFECTO" />
        <b>${window.esc(l.titulo)}</b>
        <span class="reco-razon">${window.esc(l.razon)}</span>
        <span class="price">${window.formatPrecio(l.precio)}${l.stock > 0 ? '' : ' · Agotado'}</span>
      </button>`).join('');
    caja.hidden = false;
  } catch {
    // las recomendaciones son un extra: si fallan, no se muestra la sección
  }
}
