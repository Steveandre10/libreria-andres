import express from 'express';
import cors from 'cors';
import routeUsuario from './app/routes/usuarios.routes.js';
import routeLibros from './app/routes/libros.routes.js';
import routeResenas from './app/routes/resenas.routes.js';
import config from './app/config/environments/index.js';
import { verificarConexion } from './app/config/db.js';
import { inicializarBaseDeDatos } from './app/config/initDb.js';
import routeRoles from './app/routes/roles.routes.js';
import routePedidos from './app/routes/pedidos.routes.js';   // RF14: ventas y devoluciones
import routeInventario from './app/routes/inventario.routes.js'; // RF14: inventario en tiempo real
import routeTienda from './app/routes/tienda.routes.js';       // RF17: métodos de pago y envíos
import routeFacturas from './app/routes/facturas.routes.js';   // RF7: buscar y ver facturas
const app = express();

/**
 * RF23 · Conexión segura (HTTPS).
 * En Render el certificado HTTPS lo pone su proxy, que avisa con la cabecera
 * `x-forwarded-proto` si el visitante entró por http o por https.
 * - Si entró por http, se le redirige a la misma dirección con https.
 * - Si entró por https, se envía HSTS: el navegador recordará usar SIEMPRE https
 *   con este dominio durante 1 año (nadie puede "bajarlo" a http en el camino).
 * En localhost no existe esa cabecera, así que en desarrollo no cambia nada.
 */
app.set('trust proxy', 1);
app.use((req, res, next) => {
  const protocolo = req.headers['x-forwarded-proto'];
  if (protocolo === 'http') {
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  }
  if (protocolo === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

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
app.use('/api/roles', routeRoles);
app.use('/api/pedidos', routePedidos);
app.use('/api/inventario', routeInventario);
app.use('/api/tienda', routeTienda);
app.use('/api/facturas', routeFacturas);

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

