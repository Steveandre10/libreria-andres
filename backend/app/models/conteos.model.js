import pool from '../config/db.js';
import { ID_LIBRERIA, ErrorInventario, moverStock } from './inventario.model.js';

/**
 * @file conteos.model.js
 * @description RF12 · Inventario cíclico.
 *  1. Iniciar: se crea un conteo y se toma una "foto" del stock que dice el sistema para cada libro
 *     (todos, o solo un género). Solo puede haber un conteo abierto a la vez.
 *  2. Contar: se escribe la cantidad física de cada libro. Diferencia = contado − sistema.
 *  3. Ajustar: para los libros con diferencia se escribe el MOTIVO y se corrige el stock.
 *     El ajuste se aplica como "sumar/restar la diferencia" (no "poner el número contado"),
 *     así una venta que pasó mientras se contaba no se pierde.
 *     Cada ajuste queda en `movimientos` (tipo Ajuste) con su motivo.
 *  4. Cerrar el conteo.
 */

/** Conteos recientes con su avance. */
export const getConteos = async () => {
  const [rows] = await pool.query(
    `SELECT c.id_conteo, c.estado, c.nota, c.fecha_inicio, c.fecha_cierre, u.nombre AS usuario,
            CAST(COUNT(d.id_libro) AS SIGNED) AS libros,
            CAST(SUM(d.cantidad_contada IS NOT NULL) AS SIGNED) AS contados,
            CAST(SUM(d.cantidad_contada IS NOT NULL AND d.cantidad_contada <> d.stock_sistema) AS SIGNED) AS con_diferencia,
            CAST(SUM(d.ajustado) AS SIGNED) AS ajustados
     FROM conteos c LEFT JOIN conteos_detalle d ON d.id_conteo = c.id_conteo
     LEFT JOIN usuarios u ON u.id = c.id_usuario
     GROUP BY c.id_conteo ORDER BY c.id_conteo DESC LIMIT 20`
  );
  return rows;
};

/** Un conteo con cada libro: sistema (foto), actual, contado, diferencia. */
export const getConteo = async (idConteo) => {
  const [[conteo]] = await pool.query(
    `SELECT c.*, u.nombre AS usuario FROM conteos c LEFT JOIN usuarios u ON u.id = c.id_usuario WHERE c.id_conteo = ?`, [idConteo]
  );
  if (!conteo) return null;
  const [lineas] = await pool.query(
    `SELECT d.id_libro, l.titulo, l.autor, l.ISBN, l.genero, d.stock_sistema, d.cantidad_contada, d.motivo, d.ajustado,
            CAST(COALESCE(i.stock_actual, 0) AS SIGNED) AS stock_actual,
            CASE WHEN d.cantidad_contada IS NULL THEN NULL ELSE CAST(d.cantidad_contada AS SIGNED) - CAST(d.stock_sistema AS SIGNED) END AS diferencia
     FROM conteos_detalle d JOIN libros l ON l.id_libro = d.id_libro
     LEFT JOIN inventarios i ON i.id_libro = d.id_libro AND i.id_libreria = ?
     WHERE d.id_conteo = ? ORDER BY l.titulo`,
    [ID_LIBRERIA, idConteo]
  );
  return { conteo, lineas };
};

/** Paso 1 · Iniciar un conteo (todos los libros o un género). */
export const iniciarConteo = async ({ idUsuario, nota, genero }) => {
  const [[abierto]] = await pool.query("SELECT id_conteo FROM conteos WHERE estado = 'Abierto' LIMIT 1");
  if (abierto) throw new ErrorInventario(`Ya hay un conteo abierto (N.º ${String(abierto.id_conteo).padStart(4, '0')}). Ciérralo antes de empezar otro.`);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('INSERT INTO conteos (nota, id_usuario) VALUES (?, ?)', [nota || null, idUsuario]);
    const [ins] = await conn.query(
      `INSERT INTO conteos_detalle (id_conteo, id_libro, stock_sistema)
       SELECT ?, l.id_libro, COALESCE(i.stock_actual, 0) FROM libros l
       LEFT JOIN inventarios i ON i.id_libro = l.id_libro AND i.id_libreria = ?
       ${genero ? 'WHERE l.genero = ?' : ''}`,
      genero ? [r.insertId, ID_LIBRERIA, genero] : [r.insertId, ID_LIBRERIA]
    );
    if (!ins.affectedRows) throw new ErrorInventario('No hay libros para contar con ese filtro', 400);
    await conn.commit();
    return { idConteo: r.insertId, libros: ins.affectedRows };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

/** Exige que el conteo exista y siga abierto. */
const exigirAbierto = async (idConteo) => {
  const [[c]] = await pool.query('SELECT estado FROM conteos WHERE id_conteo = ?', [idConteo]);
  if (!c) throw new ErrorInventario('El conteo no existe', 404);
  if (c.estado !== 'Abierto') throw new ErrorInventario('Este conteo ya está cerrado');
};

/** Paso 2 · Registrar la cantidad física de un libro (null = borrar lo contado). */
export const registrarCantidad = async ({ idConteo, idLibro, cantidad }) => {
  await exigirAbierto(idConteo);
  const [r] = await pool.query(
    'UPDATE conteos_detalle SET cantidad_contada = ? WHERE id_conteo = ? AND id_libro = ? AND ajustado = 0',
    [cantidad, idConteo, idLibro]
  );
  if (!r.affectedRows) throw new ErrorInventario('Ese libro no está en el conteo o ya se ajustó', 409);
};

/**
 * Paso 3 · Ajustar el stock de los libros con diferencia.
 * @param {{idConteo:number, lineas:Array<{id_libro:number, motivo:string}>, idUsuario:number}} datos
 */
export const ajustarConteo = async ({ idConteo, lineas, idUsuario }) => {
  await exigirAbierto(idConteo);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let ajustados = 0;
    for (const { id_libro: idLibro, motivo } of lineas) {
      const [[d]] = await conn.query(
        'SELECT stock_sistema, cantidad_contada, ajustado FROM conteos_detalle WHERE id_conteo = ? AND id_libro = ? FOR UPDATE',
        [idConteo, idLibro]
      );
      if (!d || d.ajustado || d.cantidad_contada === null) continue;
      const diferencia = d.cantidad_contada - d.stock_sistema;
      if (diferencia === 0) continue;
      await moverStock(conn, {
        idLibro, cambio: diferencia, tipo: 'Ajuste', idUsuario,
        motivo: `Conteo N.º ${String(idConteo).padStart(4, '0')}: ${motivo}`
      });
      await conn.query('UPDATE conteos_detalle SET ajustado = 1, motivo = ? WHERE id_conteo = ? AND id_libro = ?', [motivo, idConteo, idLibro]);
      ajustados++;
    }
    await conn.commit();
    return { ajustados };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

/** Paso 4 · Cerrar el conteo. */
export const cerrarConteo = async (idConteo) => {
  await exigirAbierto(idConteo);
  await pool.query("UPDATE conteos SET estado = 'Cerrado', fecha_cierre = NOW() WHERE id_conteo = ?", [idConteo]);
};
