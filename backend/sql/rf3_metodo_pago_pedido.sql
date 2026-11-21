-- ============================================================================
-- RF3 · Seleccionar método de pago
-- 1) Agrega PSE a los métodos de pago (el admin lo activa/desactiva en Configuración, RF17).
-- 2) El pedido guarda también el método elegido (además de la factura).
-- Correr UNA vez en `proyecto` (XAMPP) y también en la BD de producción.
-- ============================================================================

INSERT INTO metodos_pago (id_metodo_pago, nombre_metodo, descripcion, estado)
VALUES (4, 'PSE', 'Débito desde tu cuenta bancaria', 'Disponible');

ALTER TABLE pedidos
  ADD COLUMN id_metodo_pago INT(11) DEFAULT NULL,
  ADD CONSTRAINT fk_pedido_metodo_pago FOREIGN KEY (id_metodo_pago) REFERENCES metodos_pago (id_metodo_pago);

-- Los pedidos que ya existían toman el método desde su factura
UPDATE pedidos p
JOIN facturas f ON f.id_pedido = p.id_pedido
SET p.id_metodo_pago = f.id_metodo_pago
WHERE p.id_metodo_pago IS NULL;
