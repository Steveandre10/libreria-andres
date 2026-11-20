import pool from '../config/db.js';

/**
 * @file inventario.model.js
 * @description RF14 · Todo lo que toca el stock pasa por aquí: ventas, devoluciones,
 * altas y ajustes manuales. Así el número de `inventarios.stock_actual` y su historial
 * (`movimientos`) nunca se desincronizan.
 */

/** RF13 · Librería dueña del inventario (la fila id 1 de la tabla librerias). */
export const ID_LIBRERIA = 1;

/** RF13 · La disponibilidad sale del stock: con unidades = Disponible, sin unidades = Agotado. */
export const estadoPorStock = (stock) => (stock > 0 ? 'Disponible' : 'Agotado');

/**
 * Error de negocio con código y estado HTTP, para que el controlador
 * responda un mensaje claro (por ejemplo 409 "no hay stock") en vez de un 500.
 */
export class ErrorInventario extends Error {
  constructor(mensaje, status = 409) {
    super(mensaje);
    this.status = status;
  }
}

/**
 * RF14 · Mueve el stock de UN libro y deja el movimiento registrado.
 * Debe llamarse DENTRO de una transacción (recibe la conexión `conn`).
 *
 * `SELECT ... FOR UPDATE` bloquea la fila del inventario hasta el commit:
 * si dos clientes compran el último ejemplar al mismo tiempo, el segundo
 * espera, ve stock 0 y recibe "no hay stock" en vez de dejar el stock en -1.
 *
 * @param {import('mysql2/promise').PoolConnection} conn - Conexión con la transacción abierta.
 * @param {Object} mov
 * @param {number} mov.idLibro
 * @param {number} [mov.cambio]      - Unidades a sumar (+) o restar (−). Usar esto o `nuevoStock`.
 * @param {number} [mov.nuevoStock]  - Cantidad final exacta (ajuste manual desde la ficha del libro).
 * @param {'Venta'|'Devolución'|'Ajuste'|'Alta'} mov.tipo
 * @param {number|null} [mov.idUsuario] - Quién lo hizo.
 * @param {number|null} [mov.idPedido]  - Pedido de origen (ventas y devoluciones).
 * @returns {Promise<{anterior:number, nuevo:number}>}
 */
export const moverStock = async (conn, { idLibro, cambio, nuevoStock, tipo, idUsuario = null, idPedido = null }) => {
  // Si el libro todavía no tiene fila de inventario, se crea en 0
  await conn.query(
    `INSERT IGNORE INTO inventarios (stock_actual, stock_minimo, id_libreria, id_libro) VALUES (0, 0, ?, ?)`,
    [ID_LIBRERIA, idLibro]
  );

  const [[fila]] = await conn.query(
    `SELECT i.id_inventario, i.stock_actual, l.titulo
     FROM inventarios i JOIN libros l ON l.id_libro = i.id_libro
     WHERE i.id_libro = ? AND i.id_libreria = ? FOR UPDATE`,
    [idLibro, ID_LIBRERIA]
  );
  if (!fila) throw new ErrorInventario('El libro no existe', 404);

  const anterior = fila.stock_actual;
  const nuevo = nuevoStock !== undefined ? nuevoStock : anterior + cambio;
  if (nuevo < 0) {
    throw new ErrorInventario(
      anterior === 0
        ? `«${fila.titulo}» está agotado.`
        : `Solo quedan ${anterior} unidad(es) de «${fila.titulo}».`
    );
  }
  if (nuevo === anterior) return { anterior, nuevo };   // sin cambios, sin movimiento

  await conn.query('UPDATE inventarios SET stock_actual = ? WHERE id_inventario = ?', [nuevo, fila.id_inventario]);
  await conn.query('UPDATE libros SET disponibilidad = ? WHERE id_libro = ?', [estadoPorStock(nuevo), idLibro]);
  await conn.query(
    `INSERT INTO movimientos (tipo_movimiento, cantidad, stock_anterior, stock_nuevo, id_inventario, id_usuario, id_pedido)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tipo, Math.abs(nuevo - anterior), anterior, nuevo, fila.id_inventario, idUsuario, idPedido]
  );
  return { anterior, nuevo };
};

/**
 * RF14 · Inventario completo: cada libro con su cantidad actual, el stock mínimo
 * y cuántas unidades se han vendido (sin contar pedidos devueltos).
 * @returns {Promise<Array<Object>>}
 */
export const getInventario = async () => {
  const [rows] = await pool.query(
    `SELECT l.id_libro, l.titulo, l.autor, l.ISBN, l.genero, l.portada, l.precio, l.disponibilidad,
            -- CAST: que lleguen como número y no como texto al frontend
            CAST(COALESCE(i.stock_actual, 0) AS SIGNED) AS stock,
            CAST(COALESCE(i.stock_minimo, 0) AS SIGNED) AS stock_minimo,
            CAST(COALESCE((
              SELECT SUM(pl.cantidad) FROM pedido_libro pl
              JOIN pedidos p ON p.id_pedido = pl.id_pedido
              WHERE pl.id_libro = l.id_libro AND p.estado = 'Activo'
            ), 0) AS SIGNED) AS vendidos
     FROM libros l
     LEFT JOIN inventarios i ON i.id_libro = l.id_libro AND i.id_libreria = ?
     ORDER BY l.titulo`,
    [ID_LIBRERIA]
  );
  return rows;
};

/**
 * RF14 · Últimos movimientos del stock (historial), del más reciente al más antiguo.
 * @param {number} [limite=25]
 */
export const getMovimientos = async (limite = 25) => {
  const [rows] = await pool.query(
    `SELECT m.id_movimiento, m.fecha_movimiento, m.tipo_movimiento, m.cantidad,
            m.stock_anterior, m.stock_nuevo, m.id_pedido,
            l.titulo, u.nombre AS usuario_nombre
     FROM movimientos m
     JOIN inventarios i ON i.id_inventario = m.id_inventario
     JOIN libros l ON l.id_libro = i.id_libro
     LEFT JOIN usuarios u ON u.id = m.id_usuario
     ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC
     LIMIT ?`,
    [limite]
  );
  return rows;
};
