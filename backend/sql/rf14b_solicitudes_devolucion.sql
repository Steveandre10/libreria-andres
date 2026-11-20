-- ============================================================================
-- RF14 (ampliación) · Solicitudes de devolución
-- El cliente pide la devolución desde "Mis compras" con un motivo; el personal
-- con permiso de inventario la aprueba (se repone el stock) o la rechaza.
-- Correr UNA vez en `proyecto` (XAMPP) y también en la BD de Render.
-- ============================================================================

CREATE TABLE solicitudes_devolucion (
  id_solicitud    INT(11)      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_pedido       INT(11)      NOT NULL,
  id_usuario      INT(11)      DEFAULT NULL,                 -- cliente que la pide
  motivo          VARCHAR(60)  NOT NULL,                     -- motivo elegido de la lista
  detalle         VARCHAR(300) DEFAULT NULL,                 -- explicación libre del cliente
  estado          ENUM('Pendiente','Aprobada','Rechazada') NOT NULL DEFAULT 'Pendiente',
  respuesta       VARCHAR(300) DEFAULT NULL,                 -- nota del personal (obligatoria al rechazar)
  id_revisor      INT(11)      DEFAULT NULL,                 -- quién la aprobó o rechazó
  fecha_solicitud DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_respuesta DATETIME     DEFAULT NULL,
  -- Una sola solicitud por pedido (evita que el cliente la envíe varias veces)
  UNIQUE KEY uq_solicitud_pedido (id_pedido),
  CONSTRAINT fk_solicitud_pedido  FOREIGN KEY (id_pedido)  REFERENCES pedidos (id_pedido),
  CONSTRAINT fk_solicitud_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_solicitud_revisor FOREIGN KEY (id_revisor) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
