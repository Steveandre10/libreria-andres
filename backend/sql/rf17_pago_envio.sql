-- ============================================================================
-- RF17 · Ajustar opciones básicas: métodos de pago y tipos de envío
-- Correr UNA vez en `proyecto` (XAMPP) y también en la BD de producción.
-- ============================================================================

-- 1) Tipos de envío que el administrador configura desde el panel
CREATE TABLE tipos_envio (
  id_tipo_envio       INT(11)       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre              VARCHAR(60)   NOT NULL,
  descripcion         VARCHAR(150)  DEFAULT NULL,
  tiempo_estimado     VARCHAR(40)   DEFAULT NULL,             -- ej. "2 a 4 días hábiles"
  costo               DECIMAL(10,2) NOT NULL DEFAULT 0,
  activo              TINYINT(1)    NOT NULL DEFAULT 1,
  fecha_actualizacion DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por     INT(11)       DEFAULT NULL,
  CONSTRAINT fk_envio_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Valores INICIALES de ejemplo: el dueño los ajusta (nombre y costo) desde Configuración
INSERT INTO tipos_envio (nombre, descripcion, tiempo_estimado, costo) VALUES
  ('Recoger en tienda', 'Pasa por tus libros a la librería',  'Desde el día siguiente', 0.00),
  ('Envío estándar',    'Entrega a domicilio',                '3 a 5 días hábiles',     5.00),
  ('Envío express',     'Entrega a domicilio prioritaria',    '1 a 2 días hábiles',     9.00);

-- 2) El pedido guarda qué envío eligió el cliente y cuánto costó EN ESE MOMENTO
--    (si mañana el admin cambia el precio, los pedidos viejos no cambian)
ALTER TABLE pedidos
  ADD COLUMN id_tipo_envio INT(11)       DEFAULT NULL,
  ADD COLUMN costo_envio   DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT fk_pedido_envio FOREIGN KEY (id_tipo_envio) REFERENCES tipos_envio (id_tipo_envio);

-- 3) La factura también guarda el costo del envío
ALTER TABLE facturas
  ADD COLUMN costo_envio DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER impuestos;

-- 4) Corrige las tildes de los métodos de pago (se habían guardado con otra codificación)
UPDATE metodos_pago SET nombre_metodo = 'Tarjeta crédito o débito' WHERE id_metodo_pago = 1;

-- El módulo "configuracion" (RF18) solo lo tiene el administrador: no se agregan permisos a otros roles.
