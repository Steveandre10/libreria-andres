import express from 'express';
import routeUsuario from './app/routes/usuarios.routes.js';
import cors from 'cors';
import config from './app/config/environments/index.js';
import { verificarConexion } from './app/config/db.js';

const app = express();
app.use(cors({ origin: ['https://libreria-andres.onrender.com', 'http://localhost:5500', 'http://127.0.0.1:5500'] }));
const PORT = config.PORT;  

app.use(express.json());

/** Destino de MySQL según la configuración activa, sin exponer la contraseña. */
const destinoMysql = `${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`;

app.get('/', (req, res) => {
  res.json({ message: 'Servidor funcionando (Librería Andrés!)' });
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

app.use('/api/usuarios', routeUsuario);

app.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'developer'} | MySQL configurado en ${destinoMysql} (usuario: ${config.DB_USER})`);

  // El pool es perezoso: sin esta comprobación el arranque se vería
  // idéntico con o sin base de datos alcanzable.
  try {
    await verificarConexion();
    console.log(`MySQL conectado correctamente en ${destinoMysql}`);
  } catch (error) {
    console.error(`MySQL SIN conexión en ${destinoMysql} -> [${error.code}] ${error.message}`);
  }
});
