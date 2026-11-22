import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const environment = process.env.NODE_ENV || 'developer';

/*
 * Carga `<entorno>.env` si existe (en tu PC: developer.env).
 * override: false -> las variables que ya existen GANAN sobre el archivo.
 * Así, en Render mandan las variables del panel "Environment" y no un archivo del repositorio
 * (production.env ya no se sube a GitHub porque tenía contraseñas).
 */
const archivo = path.resolve(path.join(__dirname, `${environment}.env`));
if (fs.existsSync(archivo)) {
  dotenv.config({ path: archivo, override: false });
}

// En producción no se arranca con la clave de ejemplo: cualquiera podría falsificar sesiones.
if (environment === 'production' && !process.env.JWT_SECRET) {
  console.error('Falta la variable JWT_SECRET en Render (Environment). El servidor no arranca sin ella.');
  process.exit(1);
}

const config = {
  PORT: process.env.PORT || 3000,
  DB_HOST: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  DB_USER: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQLPASSWORD || ''),
  DB_NAME: process.env.DB_NAME || process.env.MYSQLDATABASE || 'libreria',
  DB_PORT: process.env.DB_PORT || process.env.MYSQLPORT || 3306,
  JWT_SECRET: process.env.JWT_SECRET || 'secretKeyLibreria'
};

export default config;
