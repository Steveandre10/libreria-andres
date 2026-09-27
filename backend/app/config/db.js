import mysql from 'mysql2/promise';
import config from './environments/index.js';
import fs from 'fs';
/**
 * Pool de conexiones a la base de datos MySQL.
 * Utiliza promesas para el manejo asíncrono de consultas.
 * 
 * @type {import('mysql2/promise').Pool}
 */
const pool = mysql.createPool({
  host: config.DB_HOST,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
  port: config.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
    ssl: process.env.DB_CA_PATH ? { ca: fs.readFileSync(process.env.DB_CA_PATH) } : undefined
});

export default pool;

/**
 * Abre una conexión real contra MySQL y ejecuta una consulta trivial.
 * Es necesaria porque `createPool` no conecta al crearse: sin esta
 * verificación el servidor arranca igual aunque el host o el puerto
 * configurados sean inalcanzables.
 *
 * @async
 * @function verificarConexion
 * @returns {Promise<{host: string, port: number, database: string, user: string}>} Datos del destino al que se conectó (sin la contraseña).
 * @throws {Error} Si no se puede establecer la conexión.
 */
export const verificarConexion = async () => {
  const conexion = await pool.getConnection();
  try {
    await conexion.query('SELECT 1');
    return {
      host: config.DB_HOST,
      port: Number(config.DB_PORT),
      database: config.DB_NAME,
      user: config.DB_USER
    };
  } finally {
    conexion.release();
  }
};
