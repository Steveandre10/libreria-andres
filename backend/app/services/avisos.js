import pool from '../config/db.js';
import { enviarCorreo } from './correo.js';

/**
 * @file services/avisos.js
 * @description RF26 · Correos a los clientes suscritos:
 *   - Reposición: el libro agotado volvió a tener stock -> a quienes pidieron "Avisarme cuando llegue".
 *   - Novedades: se registró un libro nuevo -> a quienes activaron "novedades".
 *   - Promociones: el administrador escribe una promo -> a quienes activaron "promociones".
 * Los correos se mandan en segundo plano, uno por uno: la venta o el guardado no esperan.
 */

const URL_TIENDA = process.env.URL_TIENDA || 'https://libreria-andres.onrender.com';
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Plantilla simple y sobria para todos los avisos. */
const plantilla = (titulo, cuerpoHtml) => `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1b2233">
    <h2 style="color:#1c2b4a;margin-bottom:8px">${esc(titulo)}</h2>
    ${cuerpoHtml}
    <p style="margin-top:24px"><a href="${URL_TIENDA}" style="background:#1c2b4a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Ir a Librería Andrés</a></p>
    <p style="font-size:12px;color:#636c7e;margin-top:24px">Recibes este correo porque lo activaste en tu perfil. Puedes desactivarlo en «Mi perfil».</p>
  </div>`;

/** Manda un correo por destinatario sin frenar al que llamó. Devuelve cuántos se enviaron. */
const enviarATodos = async (destinatarios, armar) => {
  let enviados = 0;
  for (const d of destinatarios) {
    try {
      await enviarCorreo({ para: d.email, ...armar(d) });
      enviados++;
    } catch (error) {
      console.error(`RF26 · No se pudo enviar a ${d.email}:`, error.message);
    }
  }
  return enviados;
};

/**
 * RF26 · Reposición. Se llama cuando un libro pasa de 0 a tener stock.
 * Espera unos segundos y confirma que el stock sigue > 0 (si la operación se deshizo, no avisa).
 * A cada persona se le avisa una sola vez (fecha_aviso).
 */
export const avisarReposicion = (idLibro) => {
  setTimeout(async () => {
    try {
      const [[libro]] = await pool.query(
        `SELECT l.titulo, l.precio, COALESCE(i.stock_actual, 0) AS stock FROM libros l
         LEFT JOIN inventarios i ON i.id_libro = l.id_libro WHERE l.id_libro = ?`, [idLibro]
      );
      if (!libro || libro.stock <= 0) return;
      const [esperando] = await pool.query(
        `SELECT u.id, u.email, u.nombre FROM avisos_stock a
         JOIN usuarios u ON u.id = a.id_usuario
         LEFT JOIN preferencias_notificacion p ON p.id_usuario = u.id
         WHERE a.id_libro = ? AND a.fecha_aviso IS NULL AND COALESCE(p.reposicion, 1) = 1`, [idLibro]
      );
      if (!esperando.length) return;
      await enviarATodos(esperando, (u) => ({
        asunto: `Ya llegó «${libro.titulo}»`,
        texto: `Hola ${u.nombre}, «${libro.titulo}» volvió a estar disponible en Librería Andrés.`,
        html: plantilla(`Ya llegó «${libro.titulo}»`, `<p>Hola ${esc(u.nombre)}, el libro que esperabas volvió a estar disponible. Hay pocas unidades, así que si lo quieres no lo dejes pasar.</p>`)
      }));
      await pool.query('UPDATE avisos_stock SET fecha_aviso = NOW() WHERE id_libro = ? AND fecha_aviso IS NULL AND id_usuario IN (?)',
        [idLibro, esperando.map(u => u.id)]);
    } catch (error) {
      console.error('RF26 · Error avisando reposición:', error.message);
    }
  }, 3000);
};

/** RF26 · Novedades: un libro nuevo en el catálogo. */
export const avisarNovedad = (libro) => {
  setImmediate(async () => {
    try {
      const [suscritos] = await pool.query(
        `SELECT u.email, u.nombre FROM preferencias_notificacion p JOIN usuarios u ON u.id = p.id_usuario WHERE p.novedades = 1`
      );
      await enviarATodos(suscritos, (u) => ({
        asunto: `Novedad en Librería Andrés: «${libro.titulo}»`,
        texto: `Hola ${u.nombre}, llegó «${libro.titulo}» de ${libro.autor}.`,
        html: plantilla('Nuevo en el catálogo', `<p>Hola ${esc(u.nombre)}, acaba de llegar <b>«${esc(libro.titulo)}»</b> de ${esc(libro.autor)}.</p>`)
      }));
    } catch (error) {
      console.error('RF26 · Error avisando novedad:', error.message);
    }
  });
};

/**
 * RF26 · Promoción escrita por el administrador. Responde enseguida con cuántos
 * suscriptores hay; los correos salen en segundo plano.
 */
export const enviarPromocion = async (asunto, mensaje) => {
  const [suscritos] = await pool.query(
    `SELECT u.email, u.nombre FROM preferencias_notificacion p JOIN usuarios u ON u.id = p.id_usuario WHERE p.promociones = 1`
  );
  setImmediate(() => enviarATodos(suscritos, (u) => ({
    asunto,
    texto: `Hola ${u.nombre},\n\n${mensaje}`,
    html: plantilla(asunto, `<p>Hola ${esc(u.nombre)},</p><p>${esc(mensaje).replace(/\n/g, '<br>')}</p>`)
  })));
  return suscritos.length;
};
