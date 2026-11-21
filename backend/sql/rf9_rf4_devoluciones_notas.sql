-- ============================================================================
-- RF9 · Gestionar devoluciones  +  RF4 · Notas crédito/débito automáticas
-- Correr UNA vez en `proyecto` (XAMPP) y también en la BD de producción.
-- ============================================================================

-- RF9: al aprobar, el encargado indica en qué estado llegó el libro.
--      Solo los libros en buen estado vuelven al stock.
ALTER TABLE solicitudes_devolucion
  ADD COLUMN estado_libro ENUM('Bueno','Dañado') DEFAULT NULL,
  ADD COLUMN repuso_stock TINYINT(1) NOT NULL DEFAULT 0;

-- RF4: notas crédito (devoluciones: se le debe dinero al cliente) y débito (cobros adicionales).
CREATE TABLE notas_contables (
  id_nota        INT(11)       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tipo           ENUM('Crédito','Débito') NOT NULL DEFAULT 'Crédito',
  id_factura     INT(11)       NOT NULL,                 -- factura original a la que corrige
  id_solicitud   INT(11)       DEFAULT NULL,             -- solicitud de devolución que la originó (si la hay)
  motivo         VARCHAR(300)  NOT NULL,
  subtotal       DECIMAL(10,2) NOT NULL DEFAULT 0,
  impuestos      DECIMAL(10,2) NOT NULL DEFAULT 0,
  total          DECIMAL(10,2) NOT NULL DEFAULT 0,
  id_usuario     INT(11)       DEFAULT NULL,             -- quién aprobó (la nota se crea sola al aprobar)
  fecha_registro DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Una sola nota crédito por factura (una factura solo se devuelve una vez)
  UNIQUE KEY uq_nota_factura_tipo (id_factura, tipo),
  CONSTRAINT fk_nota_factura   FOREIGN KEY (id_factura)   REFERENCES facturas (id_factura),
  CONSTRAINT fk_nota_solicitud FOREIGN KEY (id_solicitud) REFERENCES solicitudes_devolucion (id_solicitud) ON DELETE SET NULL,
  CONSTRAINT fk_nota_usuario   FOREIGN KEY (id_usuario)   REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Detalle de la nota: qué libros y por cuánto
CREATE TABLE notas_contables_detalle (
  id_detalle INT(11)       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_nota    INT(11)       NOT NULL,
  id_libro   INT(11)       DEFAULT NULL,
  cantidad   INT(10) UNSIGNED NOT NULL,
  subtotal   DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_nota_detalle FOREIGN KEY (id_nota) REFERENCES notas_contables (id_nota) ON DELETE CASCADE,
  CONSTRAINT fk_nota_libro   FOREIGN KEY (id_libro) REFERENCES libros (id_libro) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
