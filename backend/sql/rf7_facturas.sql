-- ============================================================================
-- RF7 · Buscar facturas por fecha o número de pedido
-- Nuevo módulo "facturas" en roles y permisos (RF18).
-- El administrador lo tiene siempre; el personal de facturación lo puede consultar.
-- Correr UNA vez en `proyecto` (XAMPP) y también en la BD de producción.
-- ============================================================================

INSERT INTO rol_permisos (clave_rol, modulo, puede_ver, puede_editar) VALUES
  ('facturacion', 'facturas', 1, 0);
