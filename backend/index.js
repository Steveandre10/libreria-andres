import express from 'express';
import cors from 'cors';
import routeUsuario from './app/routes/usuarios.routes.js';
import routeLibros from './app/routes/libros.routes.js';
import routeResenas from './app/routes/resenas.routes.js';
import config from './app/config/environments/index.js';
import { verificarConexion } from './app/config/db.js';
import { inicializarBaseDeDatos } from './app/config/initDb.js';

const app = express();

// Configuración flexible de CORS para permitir Render y cualquier puerto de localhost durante desarrollo
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === 'https://libreria-andres.onrender.com') {
      callback(null, true);
    } else {
      callback(null, true); // Permisivo para pruebas
    }
  },
  credentials: true
}));

const PORT = config.PORT;  

app.use(express.json());

/** Destino de MySQL según la configuración activa, sin exponer la contraseña. */
const destinoMysql = `${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`;

app.get('/', (req, res) => {
  res.json({ message: 'Servidor funcionando (Librería Andrés!)', version: '2.0.0' });
});

/**
 * GET /api/health/db
 * Comprueba contra el motor si la conexión a MySQL está viva y
 * devuelve a qué host y puerto se está intentando conectar.
 */
app.get('/api/health/db', async (req, res) => {
  try {
    const destino = await verificarConexion();
    res.json({ ok: true, mysql: 'conectado', ...destino });
  } catch (error) {
    res.status(503).json({
      ok: false,
      mysql: 'sin conexión',
      destino: destinoMysql,
      code: error.code,
      message: error.message
    });
  }
});

// Rutas principales de la API
app.use('/api/usuarios', routeUsuario);
app.use('/api/libros', routeLibros);
app.use('/api/resenas', routeResenas);

app.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'developer'} | MySQL configurado en ${destinoMysql} (usuario: ${config.DB_USER})`);

  // Verificar conexión e inicializar tablas/datos si es necesario
  try {
    await verificarConexion();
    console.log(`MySQL conectado correctamente en ${destinoMysql}`);
    await inicializarBaseDeDatos();
  } catch (error) {
    console.error(`MySQL SIN conexión en ${destinoMysql} -> [${error.code}] ${error.message}`);
  }
});

