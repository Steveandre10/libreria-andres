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
  ssl: certificadoSSL()
});

/**
 * Conexión cifrada (SSL), obligatoria en Aiven. El certificado "CA" de Aiven se puede dar de dos formas:
 *  - DB_SSL_CA: el texto del certificado pegado en la variable de Render (-----BEGIN CERTIFICATE----- …)
 *  - DB_CA_PATH: la ruta a un archivo ca.pem (útil en tu PC)
 * Sin ninguna de las dos (XAMPP local), se conecta sin SSL.
 */
function certificadoSSL() {
  if (process.env.DB_SSL_CA) {
    const ca = normalizarPEM(process.env.DB_SSL_CA);
    if (!ca) {
      console.error('SSL: DB_SSL_CA no parece un certificado (debe empezar con -----BEGIN CERTIFICATE-----).');
      return undefined;
    }
    console.log(`SSL: certificado CA cargado desde DB_SSL_CA (${ca.match(/BEGIN CERTIFICATE/g).length} certificado/s).`);
    return { ca };
  }
  if (process.env.DB_CA_PATH) return { ca: fs.readFileSync(process.env.DB_CA_PATH) };
  return undefined;
}

/**
 * Repara el certificado si al pegarlo en Render los saltos de línea se volvieron espacios o "\n".
 * Un PEM válido es: -----BEGIN CERTIFICATE----- / líneas de 64 caracteres en base64 / -----END CERTIFICATE-----
 */
function normalizarPEM(texto) {
  const bloques = [...String(texto).replace(/\\n/g, '\n').matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g)];
  if (!bloques.length) return null;
  return bloques.map(([, cuerpo]) => {
    const base64 = cuerpo.replace(/[^A-Za-z0-9+/=]/g, '');   // quita espacios y saltos
    return `-----BEGIN CERTIFICATE-----\n${base64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
  }).join('');
}

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
