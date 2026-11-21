import nodemailer from 'nodemailer';

/**
 * @file services/correo.js
 * @description RF2 · Envío de correos (por ejemplo, la factura a otro correo).
 *
 * Dos modos, según las variables de entorno:
 *  - PRODUCCIÓN: si existen SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS, usa ese servidor
 *    (Gmail con "contraseña de aplicación", Brevo, SendGrid, etc.). Remitente: SMTP_FROM.
 *  - PRUEBAS: si no, usa Ethereal (servicio gratuito de nodemailer para desarrollo). El correo
 *    NO llega a la bandeja real: se "atrapa" y se puede ver en una URL de vista previa.
 *    Así se prueba todo sin configurar ni exponer contraseñas.
 */

let transporte = null;
let modo = null;

/** Crea (una sola vez) el transporte de correo según el entorno. */
const obtenerTransporte = async () => {
  if (transporte) return transporte;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporte = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,      // 465 = conexión cifrada directa; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
    modo = 'smtp';
  } else {
    const cuenta = await nodemailer.createTestAccount();   // cuenta temporal de Ethereal
    transporte = nodemailer.createTransport({
      host: cuenta.smtp.host,
      port: cuenta.smtp.port,
      secure: cuenta.smtp.secure,
      auth: { user: cuenta.user, pass: cuenta.pass }
    });
    modo = 'pruebas';
  }
  return transporte;
};

/**
 * Envía un correo.
 * @param {{para:string, asunto:string, html:string, texto?:string}} correo
 * @returns {Promise<{modo:'smtp'|'pruebas', vistaPrevia:string|null}>}
 *   vistaPrevia: en modo pruebas, la URL donde se ve el correo enviado.
 */
export const enviarCorreo = async ({ para, asunto, html, texto }) => {
  const t = await obtenerTransporte();
  const info = await t.sendMail({
    // Remitente: SMTP_FROM, o el mismo Gmail (Gmail obliga a enviar desde la cuenta autenticada)
    from: process.env.SMTP_FROM
      || (process.env.SMTP_USER ? `"Librería Andrés" <${process.env.SMTP_USER}>` : '"Librería Andrés" <facturas@libreria-andres.test>'),
    to: para,
    subject: asunto,
    text: texto,
    html
  });
  return { modo, vistaPrevia: modo === 'pruebas' ? nodemailer.getTestMessageUrl(info) : null };
};

/**
 * Revisa al arrancar el servidor si el correo está bien configurado y lo dice en la consola.
 * Con Gmail se conecta y prueba el usuario/contraseña (sin enviar nada).
 */
export const verificarCorreo = async () => {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!(SMTP_HOST && SMTP_USER && SMTP_PASS)) {
    console.log('Correo: modo PRUEBAS (Ethereal). Para enviar de verdad llena SMTP_USER y SMTP_PASS en developer.env.');
    return;
  }
  try {
    const t = await obtenerTransporte();
    await t.verify();
    console.log(`Correo: conectado a ${SMTP_HOST} como ${SMTP_USER}. Los correos llegarán de verdad.`);
  } catch (error) {
    console.error(`Correo: NO se pudo conectar a ${SMTP_HOST} -> ${error.message}`);
    console.error('   Revisa que SMTP_PASS sea una contraseña de APLICACIÓN de Google (16 letras, sin espacios).');
  }
};

/** ¿El texto parece un correo válido? (algo@dominio.ext, sin espacios) */
export const esCorreoValido = (correo) =>
  typeof correo === 'string' && correo.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo);
