/**
 * @file proveedorSimulado.js
 * @description RF5 · Proveedor tecnológico SIMULADO (ambiente de pruebas).
 *
 * Hace el mismo trabajo que un proveedor real (recibe la factura, la valida y responde
 * aceptada o rechazada con su motivo), pero sin conectarse a la DIAN. Sirve para desarrollar
 * y probar mientras la librería no tenga habilitación, certificado y proveedor contratado.
 * Las facturas validadas aquí NO tienen validez legal: así se indica en la factura.
 *
 * Interfaz común de todo proveedor:  validar(documento) -> { aceptada, motivo?, referencia? }
 */

export const nombre = 'Simulador (pruebas)';

/**
 * Revisa las reglas básicas que exige la DIAN a una factura y responde como lo haría el servicio.
 * @param {Object} doc - Documento armado por el servicio (ver index.js -> armarDocumento)
 * @returns {Promise<{aceptada:boolean, motivo?:string, referencia?:string}>}
 */
export const validar = async (doc) => {
  const errores = [];

  if (!/^\d{9,10}$/.test(doc.emisor.nit)) {
    errores.push('El NIT del emisor no está configurado o no es válido (debe tener 9 o 10 dígitos, sin dígito de verificación).');
  }
  if (!doc.emisor.resolucion) {
    errores.push('Falta el número de la resolución de facturación autorizada por la DIAN.');
  }
  if (!/^\d{5,15}$/.test(doc.adquiriente.documento)) {
    errores.push('El documento del cliente no es válido (solo números, entre 5 y 15 dígitos).');
  }
  if (!doc.lineas.length || doc.totales.total <= 0) {
    errores.push('La factura no tiene productos ni valores.');
  }
  const sumaLineas = doc.lineas.reduce((s, l) => s + l.subtotal, 0);
  if (Math.abs(sumaLineas - doc.totales.subtotal) > 0.01) {
    errores.push('La suma de las líneas no coincide con el subtotal de la factura.');
  }

  // Pequeña espera para parecerse a un servicio real
  await new Promise(r => setTimeout(r, 150));

  if (errores.length) return { aceptada: false, motivo: errores.join(' ') };
  return { aceptada: true, referencia: `SIM-${Date.now()}` };
};
