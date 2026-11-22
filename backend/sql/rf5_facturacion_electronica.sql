-- ============================================================================
-- RF5 · Integración con facturación electrónica (DIAN / proveedor tecnológico)
-- Correr UNA vez en `proyecto` (XAMPP) y también en la BD de producción.
-- ============================================================================

-- 1) Cada factura guarda su estado ante la DIAN, el CUFE y el contenido del QR
ALTER TABLE facturas
  ADD COLUMN documento_adquiriente VARCHAR(20)  DEFAULT NULL,      -- cédula/NIT del cliente (vacío = consumidor final)
  ADD COLUMN numero_fe             VARCHAR(30)  DEFAULT NULL,      -- número electrónico: prefijo + consecutivo (ej. SETP19)
  ADD COLUMN estado_dian           ENUM('Pendiente','Enviada','Aceptada','Rechazada') NOT NULL DEFAULT 'Pendiente',
  ADD COLUMN motivo_rechazo        VARCHAR(500) DEFAULT NULL,
  ADD COLUMN cufe                  CHAR(96)     DEFAULT NULL,      -- SHA-384 en hexadecimal (96 caracteres)
  ADD COLUMN qr_dian               TEXT         DEFAULT NULL,      -- texto que va dentro del código QR
  ADD COLUMN ambiente_dian         VARCHAR(20)  DEFAULT NULL,      -- 'Pruebas' o 'Producción'
  ADD COLUMN proveedor_fe          VARCHAR(40)  DEFAULT NULL,      -- quién validó (simulador o proveedor real)
  ADD COLUMN intentos_envio        INT          NOT NULL DEFAULT 0,
  ADD COLUMN fecha_envio_dian      DATETIME     DEFAULT NULL,
  ADD COLUMN fecha_validacion_dian DATETIME     DEFAULT NULL;

-- 2) Historial de cada envío (qué se mandó, qué respondió el servicio y cuándo)
CREATE TABLE facturas_eventos_dian (
  id_evento   INT(11)      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_factura  INT(11)      NOT NULL,
  estado      VARCHAR(20)  NOT NULL,
  mensaje     VARCHAR(500) DEFAULT NULL,
  id_usuario  INT(11)      DEFAULT NULL,                  -- quién lo envió/reenvió (NULL = automático al comprar)
  fecha       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evento_factura FOREIGN KEY (id_factura) REFERENCES facturas (id_factura) ON DELETE CASCADE,
  CONSTRAINT fk_evento_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3) Datos del emisor (la librería), en la tabla de configuraciones (clave → valor).
--    El NIT y la resolución quedan VACÍOS a propósito: el dueño los llena en
--    Configuración → Facturación electrónica. Mientras falten, el servicio rechaza
--    las facturas y explica el motivo (así se ve el flujo rechazo → corregir → reenviar).
--    El prefijo SETP y la clave técnica son los PÚBLICOS del set de pruebas de la DIAN.
INSERT INTO configuraciones (nombre_parametro, valor_parametro) VALUES
  ('fe_proveedor',     'simulador'),
  ('fe_ambiente',      '2'),                                           -- 1 = producción, 2 = pruebas
  ('fe_nit_emisor',    ''),
  ('fe_razon_social',  'Librería Adrián'),
  ('fe_resolucion',    ''),
  ('fe_prefijo',       'SETP'),
  ('fe_clave_tecnica', 'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c');

-- 4) El personal de facturación puede reenviar facturas (además de consultarlas)
UPDATE rol_permisos SET puede_editar = 1 WHERE clave_rol = 'facturacion' AND modulo = 'facturas';
