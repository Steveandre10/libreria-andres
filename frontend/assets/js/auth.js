/**
 * @file auth.js
 * @description Estado global de sesión, protección de vistas, armazón de navegación (riel),
 * utilidades compartidas (escape de HTML, color de género, avisos) y carrito en localStorage.
 */

(function() {
  /** URL base de la API: localhost en desarrollo, Render en producción. */
  window.API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : 'https://libreria-andres-api.onrender.com';

  window.PORTADA_DEFECTO = 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=400';

  const token = localStorage.getItem('token');
  const usuario = localStorage.getItem('usuario');
  const currentPath = window.location.pathname;
  const isLoginPage = currentPath.includes('login.html');
  const isAdminPage = currentPath.includes('admin.html');

  // CONTROL DE ACCESO
  if (!token || !usuario) {
    if (!isLoginPage) {
      window.location.href = 'login.html';
      return;
    }
  } else if (isLoginPage) {
    window.location.href = 'index.html';
    return;
  }

  /** Retorna el usuario actual parseado. */
  window.getCurrentUser = function() {
    try {
      return JSON.parse(localStorage.getItem('usuario')) || null;
    } catch {
      return null;
    }
  };

  window.isAdmin = function() {
    const u = window.getCurrentUser();
    return !!(u && u.rol === 'admin');
  };

  // La sección de administración es exclusiva del rol admin
  if (isAdminPage && !window.isAdmin()) {
    window.location.href = 'index.html';
    return;
  }

  /** Escapa texto para insertarlo de forma segura en HTML. */
  window.esc = function(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  };

  /** Formatea un precio con dos decimales. */
  window.formatPrecio = function(valor) {
    return '$' + (parseFloat(valor) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /** Valoración en escala fija: estrella + nota con un decimal; sin reseñas muestra "Sin reseñas". */
  window.ratingHTML = function(valor, sufijo = '') {
    const n = parseFloat(valor) || 0;
    if (n <= 0) return '<span class="rating rating-none">Sin reseñas</span>';
    const txt = n.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `<span class="rating" title="Valoración media"><i class="fas fa-star" aria-hidden="true"></i>${txt}${sufijo}</span>`;
  };

  /** Color de pestaña índice para un género (siempre el mismo color para el mismo género). */
  window.genreColor = function(genero) {
    const texto = String(genero || 'General');
    let h = 0;
    for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
    return `var(--tab-${(h % 7) + 1})`;
  };

  /** Número de registro de la ficha: N.º 0007 */
  window.numeroRegistro = function(id) {
    return `N.º ${String(id || 0).padStart(4, '0')}`;
  };

  /** Envoltura de fetch para llamadas autenticadas al backend. */
  window.fetchAPI = async function(url, options = {}) {
    const tk = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (tk) headers['Authorization'] = `Bearer ${tk}`;

    const fullUrl = url.startsWith('http') ? url : `${window.API_BASE}${url}`;
    const response = await fetch(fullUrl, { ...options, headers });

    if (response.status === 401) {
      logout();
      throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
    }
    return response;
  };

  window.logout = function() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
  };

  /* ---------------------------------------------------------------
     RIEL DE NAVEGACIÓN (se dibuja en <nav id="rail" data-page="...">)
     --------------------------------------------------------------- */
  function iniciales(nombre) {
    return String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  function link(href, icon, label, active, extra = '') {
    return `<a class="rail-link" href="${href}" ${active ? 'aria-current="page"' : ''}>
      <i class="fas ${icon}" aria-hidden="true"></i><span class="lbl">${label}</span>${extra}</a>`;
  }

  window.renderShell = function() {
    const rail = document.getElementById('rail');
    if (!rail) return;
    const page = rail.dataset.page || '';
    const user = window.getCurrentUser() || {};
    const admin = window.isAdmin();
    let html = '';

    if (page.startsWith('admin')) {
      const seccion = page.split(':')[1] || 'resumen';
      html = `
        <a class="rail-brand" href="admin.html#resumen"><strong>Librería Andrés</strong><span>Administración</span></a>
        ${link('admin.html#resumen', 'fa-chart-simple', 'Resumen', seccion === 'resumen')}
        ${link('admin.html#libros', 'fa-book', 'Libros', seccion === 'libros', '<span class="count" data-count="libros" hidden></span>')}
        ${link('admin.html#usuarios', 'fa-users', 'Usuarios', seccion === 'usuarios')}
        ${link('admin.html#resenas', 'fa-comment', 'Reseñas', seccion === 'resenas')}
        <div class="rail-group">Tienda</div>
        ${link('index.html', 'fa-store', 'Ver catálogo', false)}`;
    } else {
      html = `
        <a class="rail-brand" href="index.html"><strong>Librería Andrés</strong><span>Cultivando el saber literario</span></a>
        ${link('index.html', 'fa-book-open', 'Catálogo', page === 'catalogo')}
        ${link('cart.html', 'fa-bag-shopping', 'Mi carrito', page === 'carrito', '<span class="count cart-count" hidden></span>')}
        ${link('wishlist.html', 'fa-heart', 'Lista de deseos', page === 'deseos')}
        ${link('purchases.html', 'fa-box', 'Mis compras', page === 'compras')}
        ${link('profile.html', 'fa-user', 'Mi perfil', page === 'perfil')}
        ${admin ? `<div class="rail-group">Dueño</div>${link('admin.html', 'fa-sliders', 'Administrar tienda', false)}` : ''}`;
    }

    html += `
      <div class="rail-foot">
        <div class="rail-user">
          <span class="avatar" aria-hidden="true">${window.esc(iniciales(user.nombre))}</span>
          <div><b>${window.esc(user.nombre || 'Lector')}</b><small>${admin ? 'Administrador' : 'Cliente'}</small></div>
        </div>
        <a href="#" class="rail-logout logout-btn"><i class="fas fa-arrow-right-from-bracket" aria-hidden="true"></i><span>Cerrar sesión</span></a>
      </div>`;

    rail.innerHTML = html;
    rail.setAttribute('aria-label', 'Navegación principal');
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.renderShell();
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.logout-btn');
      if (btn) {
        e.preventDefault();
        logout();
      }
    });
    window.updateCartBadge();
  });

  /* ---------------------------------------------------------------
     CARRITO (localStorage)
     --------------------------------------------------------------- */
  window.getCart = function() {
    try {
      return JSON.parse(localStorage.getItem('libreria_carrito') || '[]');
    } catch {
      return [];
    }
  };

  window.saveCart = function(cart) {
    localStorage.setItem('libreria_carrito', JSON.stringify(cart));
    window.updateCartBadge();
  };

  window.addToCart = function(libro) {
    const cart = window.getCart();
    const existente = cart.findIndex(item => item.id_libro === libro.id_libro);

    if (existente > -1) {
      cart[existente].cantidad = (cart[existente].cantidad || 1) + 1;
    } else {
      cart.push({
        id_libro: libro.id_libro,
        titulo: libro.titulo || 'Libro sin título',
        autor: libro.autor || 'Autor desconocido',
        precio: parseFloat(libro.precio) || 0,
        portada: libro.portada || window.PORTADA_DEFECTO,
        genero: libro.genero || 'General',
        cantidad: 1
      });
    }

    window.saveCart(cart);
    window.showToast(`«${libro.titulo}» está en tu carrito.`);
  };

  window.updateCartBadge = function() {
    const count = window.getCart().reduce((sum, item) => sum + (item.cantidad || 1), 0);
    document.querySelectorAll('.cart-count, .cart-badge').forEach(badge => {
      badge.textContent = count;
      badge.hidden = count === 0;
      badge.style.display = '';
    });
  };

  /* ---------------------------------------------------------------
     AVISOS
     --------------------------------------------------------------- */
  window.showToast = function(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info');
    toast.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i><span>${window.esc(message)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }, 3600);
  };

  /**
   * Diálogo de confirmación con estilo de ficha. Devuelve una promesa booleana.
   * @param {{titulo:string, mensaje:string, confirmar?:string, peligro?:boolean}} opciones
   */
  window.confirmar = function({ titulo, mensaje, confirmar = 'Confirmar', peligro = false }) {
    return new Promise(resolve => {
      const dlg = document.createElement('dialog');
      dlg.className = 'confirm';
      dlg.innerHTML = `
        <div class="ficha">
          <div class="ficha-head"><h2>${window.esc(titulo)}</h2></div>
          <div class="ficha-body">
            <p>${window.esc(mensaje)}</p>
            <div class="confirm-actions">
              <button type="button" class="btn btn-secondary" data-r="0">Cancelar</button>
              <button type="button" class="btn ${peligro ? 'btn-danger-solid' : 'btn-primary'}" data-r="1">${window.esc(confirmar)}</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(dlg);
      const cerrar = (valor) => { dlg.close(); dlg.remove(); resolve(valor); };
      dlg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (b) cerrar(b.dataset.r === '1');
        else if (e.target === dlg) cerrar(false);
      });
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(false); });
      dlg.showModal();
      dlg.querySelector('[data-r="0"]').focus();
    });
  };
})();
