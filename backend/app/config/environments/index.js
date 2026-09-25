import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const environment = process.env.NODE_ENV || 'developer';

dotenv.config({
  path: path.resolve(path.join(__dirname, `${environment}.env`))
});

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
