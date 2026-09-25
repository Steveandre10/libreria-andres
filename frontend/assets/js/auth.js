/**
 * @file auth.js
 * @description Script autoejecutable (IIFE) que gestiona de manera global el estado de la sesión,
 * protege las vistas restringidas y expone funciones globales de autenticación en la ventana (window).
 */

(function() {
  /**
   * Token de autenticación JWT recuperado de localStorage.
   * @type {string|null}
   */
  const token = localStorage.getItem('token');

  /**
   * Datos del usuario recuperados y parseados de localStorage.
   * @type {string|null}
   */
  const usuario = localStorage.getItem('usuario');
  
  /**
   * Ruta relativa de la página actual en el navegador.
   * @type {string}
   */
  const currentPath = window.location.pathname;

  /**
   * Determina si la página actual es la vista de inicio de sesión/registro.
   * @type {boolean}
   */
  const isLoginPage = currentPath.includes('login.html');

  // CONTROL DE ACCESO (Redirecciones automáticas basadas en sesión)
  
  // Si el usuario no tiene token ni datos de sesión y no está en login.html, redirige al login
  if (!token || !usuario) {
    if (!isLoginPage) {
      window.location.href = 'login.html';
      return;
    }
  } else {
    // Si el usuario ya está autenticado e intenta acceder a login.html, lo redirige al index.html
    if (isLoginPage) {
      window.location.href = 'index.html';
      return;
    }
  }

  /**
   * Vincula la lógica de cierre de sesión a todos los botones que contengan la clase '.logout-btn'
   * una vez que el DOM se ha cargado por completo.
   */
  document.addEventListener('DOMContentLoaded', () => {
    const logoutBtns = document.querySelectorAll('.logout-btn');
    logoutBtns.forEach(btn => {
      btn.setAttribute('href', '#');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    });
  });

  /**
   * Cierra la sesión activa del usuario.
   * Remueve las credenciales y el token de localStorage y redirige a la pantalla de login.
   * 
   * @global
   * @function logout
   * @returns {void}
   */
  window.logout = function() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
  };

  /**
   * Envoltura (wrapper) de fetch para realizar llamadas autenticadas al backend.
   * Adjunta automáticamente el token JWT en la cabecera 'Authorization'.
   * Si detecta un estado HTTP 401 (no autorizado), invoca automáticamente logout().
   * 
   * @global
   * @async
   * @function fetchAPI
   * @param {string} url - URL o endpoint al que se realizará la petición HTTP.
   * @param {RequestInit} [options={}] - Opciones de configuración adicionales de fetch.
   * @returns {Promise<Response>} Promesa que resuelve a la respuesta de la petición HTTP fetch.
   * @throws {Error} Lanza un error si la sesión expira o es inválida (HTTP 401).
   */
  window.fetchAPI = async function(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      // Si el servidor retorna 401 (No autorizado), cerramos sesión automáticamente
      logout();
      throw new Error('Sesión no autorizada o expirada');
    }

    return response;
  };
})();

