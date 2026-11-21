-- ============================================================================
-- RF10 + RF11 · Alertas de stock mínimo · RF8/RF6/RF20/RF19 · Reportes y KPIs
-- Correr UNA vez en `proyecto` (XAMPP) y también en la BD de producción.
-- ============================================================================

-- RF11: stock mínimo por defecto (se usa cuando un libro no tiene uno propio).
--       El de cada libro va en inventarios.stock_minimo_personalizado (ya existía; NULL = usar el defecto).
INSERT INTO configuraciones (nombre_parametro, valor_parametro) VALUES ('stock_minimo_defecto', '5');

-- RF10: notificaciones del panel (ej. "Quedan 2 unidades de 1984")
CREATE TABLE notificaciones (
  id_notificacion INT(11)      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tipo            VARCHAR(30)  NOT NULL,                 -- 'stock_bajo'
  id_libro        INT(11)      DEFAULT NULL,
  mensaje         VARCHAR(300) NOT NULL,
  leida           TINYINT(1)   NOT NULL DEFAULT 0,
  fecha           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_libro FOREIGN KEY (id_libro) REFERENCES libros (id_libro) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- RF8/RF6/RF20: módulo "reportes" (RF18). El admin lo tiene todo.
--   ver    -> entra al módulo (inventario ve movimientos, facturación ve el historial por usuario)
--   editar -> estadísticas generales y KPIs (solo administración)
INSERT INTO rol_permisos (clave_rol, modulo, puede_ver, puede_editar) VALUES
  ('inventario',  'reportes', 1, 0),
  ('facturacion', 'reportes', 1, 0);
