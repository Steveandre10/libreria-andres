-- ============================================================================
-- RF23 · Carrito y pago seguro: la factura guarda subtotal, impuestos y total.
-- Correr UNA vez en `proyecto` (XAMPP) y también en la BD de producción.
-- ============================================================================

ALTER TABLE facturas
  ADD COLUMN subtotal  DECIMAL(10,2) DEFAULT NULL AFTER fecha_emision,
  ADD COLUMN impuestos DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER subtotal;

-- Las facturas que ya existían no tenían impuestos: su subtotal es su total
UPDATE facturas SET subtotal = total WHERE subtotal IS NULL;
