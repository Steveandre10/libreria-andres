-- ============================================================================
-- RF14 · Consultar inventario en tiempo real (+ ventas y devoluciones)
-- Correr UNA vez en la base `proyecto` (XAMPP) y también en la BD de Render.
-- Usa las tablas que ya existían en el modelo: pedidos, pedido_libro, facturas,
-- detalle_factura, metodos_pago y movimientos.
-- ============================================================================

-- 1) Métodos de pago que ofrece el checkout (la tabla estaba vacía)
INSERT INTO metodos_pago (id_metodo_pago, nombre_metodo, descripcion, estado) VALUES
  (1, 'Tarjeta crédito o débito', 'Pago con tarjeta',        'Disponible'),
  (2, 'Nequi o Daviplata',        'Billetera digital',       'Disponible'),
  (3, 'Efectivo contra entrega',  'Se paga al recibir',      'Disponible');

-- 2) Pedidos: estado "Devuelto" para las devoluciones y datos de entrega del checkout
ALTER TABLE pedidos
  MODIFY estado ENUM('Activo','Desactivado','Devuelto') NOT NULL DEFAULT 'Activo',
  ADD COLUMN nombre_destinatario VARCHAR(100) DEFAULT NULL,
  ADD COLUMN direccion_entrega   VARCHAR(150) DEFAULT NULL,
  ADD COLUMN telefono_contacto   VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN fecha_registro      DATETIME     DEFAULT CURRENT_TIMESTAMP;

-- 3) Movimientos de inventario: fecha con hora, quién lo hizo y de qué pedido viene.
--    Cada venta, devolución o ajuste manual deja aquí una fila (historial del stock).
ALTER TABLE movimientos
  MODIFY fecha_movimiento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN id_usuario INT(11) DEFAULT NULL,
  ADD COLUMN id_pedido  INT(11) DEFAULT NULL,
  ADD CONSTRAINT fk_movimiento_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_movimiento_pedido  FOREIGN KEY (id_pedido)  REFERENCES pedidos (id_pedido);

-- 4) Nuevo módulo "inventario" en roles y permisos (RF18).
--    El administrador lo tiene siempre; aquí se lo damos a los roles base que lo necesitan.
INSERT INTO rol_permisos (clave_rol, modulo, puede_ver, puede_editar) VALUES
  ('inventario',  'inventario', 1, 1),   -- consulta y registra devoluciones
  ('facturacion', 'inventario', 1, 0);   -- solo consulta
