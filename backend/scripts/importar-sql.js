/**
 * @file scripts/importar-sql.js
 * @description Sube un archivo .sql (por ejemplo la exportación de phpMyAdmin) a una base MySQL en la nube (Aiven).
 *
 * Uso (desde la carpeta backend, en PowerShell):
 *   node scripts/importar-sql.js --host HOST --port PUERTO --user avnadmin --db defaultdb --ca "RUTA\ca.pem" --sql "RUTA\proyecto.sql"
 *
 * La contraseña NO va en el comando: el script la pide y no se ve al escribirla.
 * Al final muestra cuántas tablas y filas quedaron, para comprobar que todo llegó.
 */
import fs from 'fs';
import mysql from 'mysql2/promise';

/** Lee --clave valor de la línea de comandos. */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pares, v, i, arr) => (v.startsWith('--') ? [...pares, [v.slice(2), arr[i + 1]]] : pares), [])
);
const faltan = ['host', 'port', 'user', 'db', 'ca', 'sql'].filter(k => !args[k]);
if (faltan.length) {
  console.error(`Faltan datos: ${faltan.map(k => '--' + k).join(', ')}`);
  process.exit(1);
}
for (const k of ['ca', 'sql']) {
  if (!fs.existsSync(args[k])) {
    console.error(`No encuentro el archivo de --${k}: ${args[k]}`);
    process.exit(1);
  }
}

/** Pide la contraseña sin mostrarla en pantalla. */
const pedirContrasena = () => new Promise((resolve) => {
  process.stdout.write('Contraseña de la base (no se verá al escribir): ');
  let clave = '';
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  const alTeclear = (c) => {
    if (c === '\r' || c === '\n') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('data', alTeclear);
      process.stdout.write('\n');
      resolve(clave);
    } else if (c === '\u0003') {          // Ctrl+C
      process.exit(1);
    } else if (c === '\u0008' || c === '\u007f') {   // Borrar
      clave = clave.slice(0, -1);
    } else {
      clave += c;
    }
  };
  process.stdin.on('data', alTeclear);
});

const main = async () => {
  const password = await pedirContrasena();
  console.log(`Conectando a ${args.host}:${args.port} …`);
  const conn = await mysql.createConnection({
    host: args.host,
    port: Number(args.port),
    user: args.user,
    password,
    database: args.db,
    ssl: { ca: fs.readFileSync(args.ca) },
    multipleStatements: true,      // el .sql trae muchas instrucciones seguidas
    charset: 'utf8mb4'
  });
  const [[{ version }]] = await conn.query('SELECT VERSION() AS version');
  console.log(`Conectado (MySQL ${version}).`);

  // Si la base ya tiene tablas, no se mezcla nada (salvo que se pida --reemplazar)
  const [existentes] = await conn.query(
    'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?', [args.db]
  );
  if (existentes.length && !process.argv.includes('--reemplazar')) {
    console.error(`La base "${args.db}" ya tiene ${existentes.length} tabla(s). No importo encima para no mezclar datos.`);
    console.error('Si quieres borrarlas y subir todo de nuevo, agrega --reemplazar al final del comando.');
    process.exit(1);
  }
  if (existentes.length) {
    console.log(`Borrando ${existentes.length} tabla(s) anteriores (--reemplazar) …`);
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { t } of existentes) await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  // phpMyAdmin crea cada tabla SIN llave primaria y se la agrega al final del archivo.
  // Aiven exige llave primaria desde el inicio (sql_require_primary_key), así que se apaga
  // SOLO en esta conexión mientras se importa. Al terminar, todas las tablas tienen su llave.
  try {
    await conn.query('SET SESSION sql_require_primary_key = 0');
  } catch (error) {
    console.error('Aiven no dejó desactivar sql_require_primary_key en esta sesión:', error.message);
    console.error('Solución: en Aiven -> tu servicio -> Service settings -> Advanced configuration ->');
    console.error('  "Configure" -> agrega "mysql.sql_require_primary_key" y apágalo (false) -> Save. Luego corre de nuevo este comando.');
    process.exit(1);
  }

  console.log(`Importando ${args.sql} …`);
  const sql = fs.readFileSync(args.sql, 'utf8');
  await conn.query(sql);

  // Comprobación: ninguna tabla debe quedar sin llave primaria
  const [sinLlave] = await conn.query(
    `SELECT t.table_name AS t FROM information_schema.tables t
     LEFT JOIN information_schema.table_constraints c
       ON c.table_schema = t.table_schema AND c.table_name = t.table_name AND c.constraint_type = 'PRIMARY KEY'
     WHERE t.table_schema = ? AND c.constraint_name IS NULL`, [args.db]
  );
  if (sinLlave.length) console.warn('Ojo: estas tablas quedaron sin llave primaria:', sinLlave.map(x => x.t).join(', '));

  const [tablas] = await conn.query(
    `SELECT table_name AS tabla, table_rows AS filas FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
    [args.db]
  );
  console.log(`\nListo: ${tablas.length} tablas en "${args.db}".`);
  for (const t of ['libros', 'usuarios', 'pedidos', 'inventarios']) {
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``).catch(() => [[{ n: '¿?' }]]);
    console.log(`  ${t}: ${n} filas`);
  }
  await conn.end();
};

main().catch((error) => {
  console.error('\nNo se pudo importar:', error.message);
  if (/already exists/i.test(error.message)) {
    console.error('Parece que la base ya tiene esas tablas (¿lo corriste dos veces?). Avísale a Claude antes de repetir.');
  }
  process.exit(1);
});
