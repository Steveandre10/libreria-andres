/**
 * @file login.js
 * @description Maneja la interfaz de usuario y la lógica de autenticación (inicio de sesión y registro de usuarios) 
 * conectándose con el backend de Librería Andrés.
 */

/**
 * URL base de la API del backend para las operaciones de usuarios.
 * @type {string}
 */
const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:3000'
  : 'https://libreria-andres-api.onrender.com';
const API_URL = `${API_BASE}/api/usuarios`;

// Elementos del DOM del formulario de autenticación
const authForm = document.getElementById('auth-form');
const viewTitle = document.getElementById('view-title');
const viewSubtitle = document.getElementById('view-subtitle');
const groupName = document.getElementById('group-name');
const inputName = document.getElementById('input-name');
const inputEmail = document.getElementById('input-email');
const inputPassword = document.getElementById('input-password');
const extraOptions = document.getElementById('extra-options');
const submitBtn = document.getElementById('submit-btn');
const btnText = document.getElementById('btn-text');
const switchText = document.getElementById('switch-text');
const switchLink = document.getElementById('switch-link');
const alertBox = document.getElementById('alert-box');
const alertText = document.getElementById('alert-text');
const alertIcon = document.getElementById('alert-icon');

/**
 * Estado que determina si la vista actual es la de Login (true) o Registro (false).
 * @type {boolean}
 */
let isLoginView = true;

/**
 * Evento que alterna la vista entre "Iniciar Sesión" y "Crear Cuenta".
 * Modifica dinámicamente los textos, visibilidad de campos de formulario y clases CSS.
 */
switchLink.addEventListener('click', () => {
  isLoginView = !isLoginView;
  clearAlert();
  
  if (isLoginView) {
    viewTitle.textContent = 'Iniciar sesión';
    viewSubtitle.textContent = 'Entra para ver el catálogo y tu carrito.';
    groupName.classList.add('hidden');
    inputName.removeAttribute('required');
    extraOptions.classList.remove('hidden');
    btnText.textContent = 'Ingresar';
    const icon = submitBtn.querySelector('i');
    if (icon) icon.className = 'fas fa-arrow-right';
    switchText.textContent = '¿No tienes una cuenta?';
    switchLink.textContent = 'Regístrate';
  } else {
    viewTitle.textContent = 'Crear cuenta';
    viewSubtitle.textContent = 'Abre tu ficha de lector en un minuto.';
    groupName.classList.remove('hidden');
    inputName.setAttribute('required', 'true');
    extraOptions.classList.add('hidden');
    btnText.textContent = 'Crear cuenta';
    const icon = submitBtn.querySelector('i');
    if (icon) icon.className = 'fas fa-arrow-right';
    switchText.textContent = '¿Ya tienes una cuenta?';
    switchLink.textContent = 'Inicia sesión';
  }
});

/**
 * Muestra una caja de alerta en la interfaz con un mensaje y estilo específicos.
 * 
 * @function showAlert
 * @param {string} message - El mensaje de texto que se mostrará en la alerta.
 * @param {'error'|'success'} [type='error'] - El tipo de alerta que define el color y el icono.
 * @returns {void}
 */
function showAlert(message, type = 'error') {
  alertBox.style.display = 'flex';
  alertText.textContent = message;
  
  if (type === 'error') {
    alertBox.className = 'alert alert-error';
    alertIcon.className = 'fas fa-exclamation-circle';
  } else {
    alertBox.className = 'alert alert-success';
    alertIcon.className = 'fas fa-check-circle';
  }
}

/**
 * Oculta la caja de alerta y limpia su contenido de texto.
 * 
 * @function clearAlert
 * @returns {void}
 */
function clearAlert() {
  alertBox.style.display = 'none';
  alertText.textContent = '';
}

/**
 * Evento que maneja el envío (submit) del formulario de autenticación.
 * Envía peticiones POST al backend para iniciar sesión o registrar un usuario,
 * guarda la sesión en localStorage y redirige a la página principal.
 */
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  
  const email = inputEmail.value.trim();
  const password = inputPassword.value;
  
  if (isLoginView) {
    // INICIAR SESIÓN
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Error al iniciar sesión');
      }
      
      // Guardar token y datos del usuario en localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('usuario', JSON.stringify(data.usuario));
      
      showAlert('Listo, entrando a la tienda…', 'success');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1200);
      
    } catch (error) {
      showAlert(error.message);
    }
  } else {
    // REGISTRARSE
    const nombre = inputName.value.trim();
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ nombre, email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Error al registrar el usuario');
      }
      
      showAlert('Cuenta creada. Entrando a la tienda…', 'success');
      
      // Inicio de sesión automático tras registro exitoso
      setTimeout(async () => {
        try {
          const loginResponse = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
          });
          const loginData = await loginResponse.json();
          if (loginResponse.ok) {
            localStorage.setItem('token', loginData.token);
            localStorage.setItem('usuario', JSON.stringify(loginData.usuario));
            window.location.href = 'index.html';
          } else {
            // Si falla la autenticación automática, redirige a la vista de login estándar
            isLoginView = false;
            switchLink.click();
          }
        } catch (e) {
          isLoginView = false;
          switchLink.click();
        }
      }, 1200);
      
    } catch (error) {
      showAlert(error.message);
    }
  }
});
