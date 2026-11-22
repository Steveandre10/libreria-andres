/**
 * @file test/casos_prueba.mjs
 * @description Casos de prueba funcionales de la API (matriz QA de la sustentación).
 *
 * Uso (con la API corriendo, desde la carpeta backend):
 *   node test/casos_prueba.mjs
 *   API_URL=http://localhost:3000/api node test/casos_prueba.mjs   (otra dirección)
 *
 * Usa las cuentas de prueba del proyecto (initDb.js): admin@libreria.com / admin123.
 * Para probar el rol "cliente" registra (una sola vez) la cuenta cliente.qa@libreria.test;
 * si ya existe, solo inicia sesión con ella.
 * Ningún caso deja pedidos ni libros nuevos: todos son intentos que el sistema debe rechazar.
 * Termina con código 1 si algún caso falla.
 */
const API = process.env.API_URL || 'http://localhost:3000/api';
const CLIENTE = { nombre: 'Cliente QA', email: 'cliente.qa@libreria.test', password: 'qa123456' };

const pedir = async (ruta, { metodo = 'GET', token, body } = {}) => {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let d = null;
  try { d = await r.json(); } catch { /* respuesta sin JSON */ }
  return { s: r.status, d };
};

let fallidos = 0;
const caso = (cp, ok, detalle) => {
  if (!ok) fallidos++;
  console.log(`${cp.padEnd(7)} ${ok ? 'APROBADO' : 'FALLÓ   '} · ${detalle}`);
};
const inicio = Date.now();

try {
  await fetch(API + '/libros');
} catch {
  console.error(`No hay respuesta de la API en ${API}. Enciende el backend (npm run dev) y vuelve a intentar.`);
  process.exit(1);
}

// CP-01 · Autenticación: contraseña incorrecta
let r = await pedir('/usuarios/login', { metodo: 'POST', body: { email: 'admin@libreria.com', password: 'clave-equivocada' } });
caso('CP-01', r.s === 401 && !r.d?.token, `login con clave incorrecta → ${r.s} "${r.d?.error}"`);

// CP-02 · Registro con campos vacíos
r = await pedir('/usuarios', { metodo: 'POST', body: { nombre: '', email: '', password: '' } });
caso('CP-02', r.s === 400, `registro vacío → ${r.s} "${r.d?.error}"`);

// CP-03 · Duplicados: correo ya registrado e ISBN repetido
r = await pedir('/usuarios', { metodo: 'POST', body: { nombre: 'Prueba', email: 'admin@libreria.com', password: 'x12345' } });
caso('CP-03a', r.s === 409, `correo duplicado → ${r.s} "${r.d?.error}"`);

const admin = (await pedir('/usuarios/login', { metodo: 'POST', body: { email: 'admin@libreria.com', password: 'admin123' } })).d?.token;
const { d: respLibros } = await pedir('/libros');
const libros = respLibros.libros || respLibros.data || respLibros;
const conIsbn = libros.find(l => l.ISBN);
if (conIsbn) {
  r = await pedir('/libros', { metodo: 'POST', token: admin, body: { titulo: 'Duplicado de prueba', autor: 'Prueba QA', ISBN: conIsbn.ISBN, precio: 1000, stock: 1 } });
  caso('CP-03b', r.s === 409, `libro con ISBN repetido (${conIsbn.ISBN}) → ${r.s} "${r.d?.error}"`);
}

// Cuenta de cliente para CP-04 y CP-05
await pedir('/usuarios', { metodo: 'POST', body: CLIENTE });            // 201 la primera vez, 409 si ya existe
const cliente = (await pedir('/usuarios/login', { metodo: 'POST', body: { email: CLIENTE.email, password: CLIENTE.password } })).d?.token;

// CP-04 · Transacción: comprar más unidades de las que hay; se rechaza todo y el stock no cambia
const libro = libros.find(l => Number(l.stock ?? l.stock_actual) > 0 && Number(l.stock ?? l.stock_actual) < 99);
if (libro && cliente) {
  const antes = Number(libro.stock ?? libro.stock_actual);
  r = await pedir('/pedidos', {
    metodo: 'POST', token: cliente,
    body: { items: [{ id_libro: libro.id_libro, cantidad: antes + 1 }], entrega: { nombre: 'Prueba', direccion: 'Calle 1', telefono: '3000000000' }, metodo: 1, envio: 1 }
  });
  const { d: l2 } = await pedir('/libros/' + libro.id_libro);
  const despues = Number((l2.libro || l2).stock ?? (l2.libro || l2).stock_actual);
  caso('CP-04', r.s === 409 && antes === despues, `comprar ${antes + 1} de ${antes} → ${r.s} "${r.d?.error}" · stock antes ${antes}, después ${despues}`);
}

// CP-05 · Permisos: inventario sin sesión, como cliente y como administrador
r = await pedir('/inventario');
caso('CP-05a', r.s === 401, `inventario sin token → ${r.s} "${r.d?.error || r.d?.message}"`);
if (cliente) {
  r = await pedir('/inventario', { token: cliente });
  caso('CP-05b', r.s === 403, `inventario como cliente → ${r.s} "${r.d?.error || r.d?.message}"`);
}
r = await pedir('/inventario', { token: admin });
caso('CP-05c', r.s === 200, `inventario como administrador → ${r.s}`);

console.log(`\n${fallidos === 0 ? 'Todos los casos aprobados' : `${fallidos} caso(s) fallaron`} · ${Date.now() - inicio} ms`);
process.exit(fallidos ? 1 : 0);
