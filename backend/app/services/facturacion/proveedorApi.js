/**
 * @file proveedorApi.js
 * @description RF5 · Adaptador para un proveedor tecnológico REAL autorizado por la DIAN.
 *
 * Cada proveedor (Alegra, Siigo, Carvajal, The Factory HKA, etc.) tiene su propia API, pero
 * todos hacen lo mismo: reciben la factura, la firman con el certificado de la empresa, la
 * envían a la DIAN y devuelven si quedó aceptada (con el CUFE) o rechazada (con el motivo).
 *
 * Para activarlo:
 *   1. Contratar el proveedor y completar la habilitación ante la DIAN.
 *   2. Poner en las variables de entorno del servidor:
 *        FE_API_URL   = URL del endpoint de emisión del proveedor
 *        FE_API_TOKEN = token o API key que entrega el proveedor
 *   3. En Configuración → Facturación electrónica, elegir el proveedor "api".
 *   4. Ajustar `aFormatoProveedor` al JSON que pida ese proveedor (lo indica su documentación).
 *
 * Interfaz común de todo proveedor:  validar(documento) -> { aceptada, motivo?, referencia?, cufe? }
 */

export const nombre = 'Proveedor tecnológico (API)';

/** ¿Está configurado? (sin URL y token no se puede usar) */
export const disponible = () => Boolean(process.env.FE_API_URL && process.env.FE_API_TOKEN);

/** Convierte nuestro documento al formato del proveedor. Ajustar según su documentación. */
const aFormatoProveedor = (doc) => ({
  numero: doc.numeroFe,
  fecha: doc.fecha,
  hora: doc.hora,
  emisor: doc.emisor,
  cliente: doc.adquiriente,
  items: doc.lineas,
  totales: doc.totales,
  pago: doc.pago
});

/**
 * Envía la factura al proveedor y traduce su respuesta.
 * Si el proveedor no responde en 15 s, se considera "Enviada" (sin confirmar) y se puede reenviar.
 */
export const validar = async (doc) => {
  if (!disponible()) {
    return { aceptada: false, motivo: 'El proveedor tecnológico no está configurado en el servidor (FE_API_URL / FE_API_TOKEN).' };
  }
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), 15000);
  try {
    const res = await fetch(process.env.FE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.FE_API_TOKEN}` },
      body: JSON.stringify(aFormatoProveedor(doc)),
      signal: controlador.signal
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.estado === 'aceptada' || data.accepted || data.cufe)) {
      return { aceptada: true, referencia: data.id || data.referencia || null, cufe: data.cufe || null };
    }
    return { aceptada: false, motivo: data.mensaje || data.message || data.error || `El proveedor respondió con error ${res.status}.` };
  } catch (error) {
    return { sinRespuesta: true, motivo: error.name === 'AbortError' ? 'El proveedor no respondió a tiempo.' : error.message };
  } finally {
    clearTimeout(limite);
  }
};
