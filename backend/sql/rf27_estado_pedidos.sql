-- ============================================================================
-- RF27 · Consultar estado de pedidos y envíos
-- Correr UNA vez en `proyecto` (XAMPP) y también en la BD de producción.
-- ============================================================================

-- 1) Estado logístico del pedido (independiente de si fue devuelto: pedidos.estado)
ALTER TABLE pedidos
  ADD COLUMN estado_envio ENUM('Pendiente','Pagado','Enviado','Entregado','Cancelado') NOT NULL DEFAULT 'Pendiente';

-- 2) Historial: cada cambio de estado con su fecha, quién lo hizo y una nota (ej. número de guía)
CREATE TABLE pedidos_estados (
  id_cambio  INT(11)      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_pedido  INT(11)      NOT NULL,
  estado     ENUM('Pendiente','Pagado','Enviado','Entregado','Cancelado') NOT NULL,
  nota       VARCHAR(200) DEFAULT NULL,
  id_usuario INT(11)      DEFAULT NULL,                 -- NULL = automático (al comprar)
  fecha      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cambio_pedido  FOREIGN KEY (id_pedido)  REFERENCES pedidos (id_pedido) ON DELETE CASCADE,
  CONSTRAINT fk_cambio_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3) Pedidos que ya existían: los devueltos quedan "Cancelado", el resto "Pendiente",
--    y cada uno arranca su historial con la fecha en que se compró.
UPDATE pedidos SET estado_envio = 'Cancelado' WHERE estado = 'Devuelto';

INSERT INTO pedidos_estados (id_pedido, estado, nota, fecha)
SELECT id_pedido, 'Pendiente', 'Pedido recibido', COALESCE(fecha_registro, NOW()) FROM pedidos;

INSERT INTO pedidos_estados (id_pedido, estado, nota, fecha)
SELECT id_pedido, 'Cancelado', 'Pedido devuelto', COALESCE(fecha_registro, NOW()) FROM pedidos WHERE estado = 'Devuelto';
