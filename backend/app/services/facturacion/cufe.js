import crypto from 'crypto';

/**
 * @file cufe.js
 * @description RF5 · CUFE (Código Único de Factura Electrónica) y contenido del QR,
 * según la fórmula del Anexo Técnico de Factura Electrónica de la DIAN:
 *
 *   CUFE = SHA-384( NumFac + FecFac + HorFac + ValFac
 *                   + CodImp1 + ValImp1 + CodImp2 + ValImp2 + CodImp3 + ValImp3
 *                   + ValTot + NitOFE + NumAdq + ClTec + TipoAmbiente )
 *
 *   CodImp1 = 01 (IVA) · CodImp2 = 04 (INC) · CodImp3 = 03 (ICA)
 *   Los valores van con 2 decimales y punto ("24.99"). TipoAmbiente: 1 producción, 2 pruebas.
 */

/** Número con 2 decimales y punto decimal, como lo pide la DIAN. */
export const dosDecimales = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

/**
 * Fecha y hora de Colombia (UTC-5) en el formato de la DIAN.
 * @param {Date|string} fecha
 * @returns {{fecha:string, hora:string}} ej. { fecha: '2026-11-20', hora: '18:13:05-05:00' }
 */
export const fechaHoraDian = (fecha) => {
  // 'sv-SE' da el formato "AAAA-MM-DD HH:MM:SS"
  const texto = new Date(fecha).toLocaleString('sv-SE', { timeZone: 'America/Bogota', hour12: false });
  const [f, h] = texto.split(' ');
  return { fecha: f, hora: `${h}-05:00` };
};

/**
 * Calcula el CUFE.
 * @param {Object} d
 * @param {string} d.numeroFe     - Prefijo + consecutivo (ej. SETP19)
 * @param {string} d.fecha        - AAAA-MM-DD
 * @param {string} d.hora         - HH:MM:SS-05:00
 * @param {number} d.valorBruto   - Valor antes de impuestos
 * @param {number} d.iva          - Valor del IVA
 * @param {number} d.total        - Valor total a pagar
 * @param {string} d.nitEmisor    - NIT de la librería (sin dígito de verificación)
 * @param {string} d.docAdquiriente - Cédula/NIT del cliente
 * @param {string} d.claveTecnica - Clave técnica de la resolución
 * @param {string} d.ambiente     - '1' producción, '2' pruebas
 * @returns {string} CUFE de 96 caracteres hexadecimales
 */
export const calcularCufe = (d) => {
  const cadena =
    d.numeroFe + d.fecha + d.hora + dosDecimales(d.valorBruto) +
    '01' + dosDecimales(d.iva) +
    '04' + '0.00' +
    '03' + '0.00' +
    dosDecimales(d.total) + d.nitEmisor + d.docAdquiriente + d.claveTecnica + d.ambiente;
  return crypto.createHash('sha384').update(cadena, 'utf8').digest('hex');
};

/**
 * Texto que va dentro del código QR de la representación gráfica (estructura de la DIAN).
 * La URL de consulta es la del catálogo de la DIAN (habilitación en pruebas, vpfe en producción).
 */
export const textoQr = (d, cufe) => {
  const url = d.ambiente === '1'
    ? 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey='
    : 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=';
  return [
    `NumFac: ${d.numeroFe}`,
    `FecFac: ${d.fecha}`,
    `HorFac: ${d.hora}`,
    `NitFac: ${d.nitEmisor}`,
    `DocAdq: ${d.docAdquiriente}`,
    `ValFac: ${dosDecimales(d.valorBruto)}`,
    `ValIva: ${dosDecimales(d.iva)}`,
    'ValOtroIm: 0.00',
    `ValTolFac: ${dosDecimales(d.total)}`,
    `CUFE: ${cufe}`,
    `QRCode: ${url}${cufe}`
  ].join('\n');
};
