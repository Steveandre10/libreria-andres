/**
 * @file script.js
 * @description Lógica dinámica para la interfaz de usuario en el frontend.
 * Se encarga de mostrar la información de sesión activa (nombre de usuario) y cargar datos adicionales
 * de perfil directamente desde el backend.
 */

/**
 * Evento DOMContentLoaded para inicializar la personalización visual
 * de la interfaz con los datos del usuario logueado en la sesión.
 */
document.addEventListener('DOMContentLoaded', () => {
  const user = JSON.parse(localStorage.getItem('usuario'));
  if (!user) return;
  
  // 1. Mostrar el nombre del usuario en el encabezado (Navbar, Menús, etc.)
  const userNameElements = document.querySelectorAll('.user-name');
  userNameElements.forEach(el => {
    el.textContent = user.nombre;
  });
  
  // 2. Personalizar banner de bienvenida (específico de index.html)
  const welcomeHeader = document.querySelector('.welcome-text h1');
  if (welcomeHeader) {
    const primerNombre = user.nombre.split(' ')[0];
    welcomeHeader.textContent = `¡Hola de nuevo, ${primerNombre}!`;
  }
  
  // 3. Cargar datos del perfil del usuario (específico de profile.html)
  const profileSection = document.querySelector('.profile-section');
  if (profileSection) {
    cargarDatosPerfil(user.id);
  }
});

/**
 * Obtiene del backend y renderiza en el DOM la información de perfil de un usuario específico.
 * En caso de que falle la petición de red, realiza un fallback mostrando la información local básica
 * almacenada en localStorage.
 * 
 * @async
 * @function cargarDatosPerfil
 * @param {number|string} userId - El identificador único del usuario a consultar.
 * @returns {Promise<void>}
 */
async function cargarDatosPerfil(userId) {
  const nombreEl = document.getElementById('profile-nombre');
  const emailEl = document.getElementById('profile-email');
  const telefonoEl = document.getElementById('profile-telefono');
  const direccionEl = document.getElementById('profile-direccion');
  const registroEl = document.getElementById('profile-registro');
  
  try {
    const response = await fetch(`http://localhost:3000/api/usuarios/${userId}`);
    if (!response.ok) {
      throw new Error('Error al consultar datos del usuario');
    }
    const data = await response.json();
    const usuario = data.usuario;
    
    if (usuario) {
      if (nombreEl) nombreEl.textContent = usuario.nombre;
      if (emailEl) emailEl.textContent = usuario.email;
      if (telefonoEl) telefonoEl.textContent = usuario.telefono || 'No registrado';
      if (direccionEl) direccionEl.textContent = usuario.direccion || 'No registrada';
      
      if (registroEl) {
        if (usuario.fecha_registro) {
          const fecha = new Date(usuario.fecha_registro);
          const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
          registroEl.textContent = fecha.toLocaleDateString('es-ES', opciones);
        } else {
          registroEl.textContent = 'Reciente';
        }
      }
    }
  } catch (error) {
    console.error('Error al cargar datos del perfil:', error);
    // Mostrar datos locales si la BD no responde (Offline Fallback)
    const localUser = JSON.parse(localStorage.getItem('usuario'));
    if (localUser) {
      if (nombreEl) nombreEl.textContent = localUser.nombre;
      if (emailEl) emailEl.textContent = localUser.email;
      if (telefonoEl) telefonoEl.textContent = localUser.telefono || 'No registrado';
      if (direccionEl) direccionEl.textContent = localUser.direccion || 'No registrada';
      if (registroEl) registroEl.textContent = 'Local (Offline)';
    }
  }
}

