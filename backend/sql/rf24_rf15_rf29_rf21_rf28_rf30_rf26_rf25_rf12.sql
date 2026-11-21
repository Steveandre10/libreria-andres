-- ============================================================================
-- Sprint 4-6 · RF24 favoritos · RF29/RF21 reseñas moderadas · RF28/RF30 soporte
--              RF15 logs · RF26 suscripciones · RF25 recomendaciones · RF12 conteos
-- Correr UNA vez en `proyecto` (XAMPP) y también en la BD de producción.
-- ============================================================================

-- RF24 · Lista de deseos: un libro por usuario una sola vez
CREATE TABLE favoritos (
  id_usuario INT(11) NOT NULL,
  id_libro   INT(11) NOT NULL,
  fecha      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_usuario, id_libro),
  CONSTRAINT fk_fav_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_libro   FOREIGN KEY (id_libro)   REFERENCES libros (id_libro) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- RF29 + RF21 · Las reseñas nuevas quedan Pendientes hasta que el administrador las apruebe.
--               Las que ya existían se marcan como Aprobadas para que no desaparezcan.
ALTER TABLE `reseñas`
  ADD COLUMN estado ENUM('Pendiente','Aprobada','Rechazada') NOT NULL DEFAULT 'Pendiente',
  ADD COLUMN motivo_moderacion VARCHAR(300) DEFAULT NULL,
  ADD COLUMN id_moderador INT(11) DEFAULT NULL,
  ADD COLUMN fecha_moderacion DATETIME DEFAULT NULL;
UPDATE `reseñas` SET estado = 'Aprobada';

-- RF15 · Registro de actividad (logs). id_usuario NULL = alguien sin sesión (ej. login fallido).
CREATE TABLE logs_actividad (
  id_log         INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_usuario     INT(11) DEFAULT NULL,
  usuario_nombre VARCHAR(150) DEFAULT NULL,    -- se copia: si borran al usuario, el log sigue diciendo quién fue
  accion         VARCHAR(40)  NOT NULL,        -- 'Inicio de sesión', 'Crear', 'Editar', 'Eliminar', 'Venta'…
  modulo         VARCHAR(40)  NOT NULL,        -- 'usuarios', 'libros', 'pedidos'…
  descripcion    VARCHAR(500) DEFAULT NULL,
  resultado      VARCHAR(20)  NOT NULL DEFAULT 'OK',   -- 'OK' o 'Fallido'
  ip             VARCHAR(45)  DEFAULT NULL,
  fecha          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_logs_fecha (fecha),
  KEY idx_logs_usuario (id_usuario),
  KEY idx_logs_accion (accion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- RF28 + RF30 · Casos de atención al cliente (tickets) y su historial de mensajes
CREATE TABLE casos (
  id_caso             INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_usuario          INT(11) NOT NULL,              -- cliente
  id_pedido           INT(11) DEFAULT NULL,          -- RF28: pedido sobre el que pregunta
  motivo              VARCHAR(60)  NOT NULL,
  estado              ENUM('Abierto','En proceso','Cerrado') NOT NULL DEFAULT 'Abierto',
  id_asignado         INT(11) DEFAULT NULL,          -- quién de soporte lo atiende
  fecha_creacion      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  fecha_cierre        DATETIME DEFAULT NULL,
  KEY idx_casos_estado (estado),
  CONSTRAINT fk_caso_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_caso_pedido  FOREIGN KEY (id_pedido)  REFERENCES pedidos (id_pedido) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE casos_mensajes (
  id_mensaje  INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_caso     INT(11) NOT NULL,
  id_usuario  INT(11) DEFAULT NULL,
  es_personal TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = lo escribió soporte, 0 = el cliente
  mensaje     VARCHAR(1000) NOT NULL,
  fecha       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_caso FOREIGN KEY (id_caso) REFERENCES casos (id_caso) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- RF30 · Rol de atención al cliente (RF18) y módulos nuevos
INSERT INTO roles (clave, nombre, descripcion, es_base) VALUES
  ('soporte', 'Atención al cliente', 'Atiende los casos y mensajes de los clientes', 1);
INSERT INTO rol_permisos (clave_rol, modulo, puede_ver, puede_editar) VALUES
  ('soporte', 'soporte', 1, 1),
  ('soporte', 'resumen', 1, 0),
  ('soporte', 'facturas', 1, 0);     -- para consultar la factura del pedido por el que preguntan
-- 'auditoria' (RF15) no se da a nadie: solo el admin, que siempre tiene todo.

-- RF26 · Preferencias de notificación por usuario (sin fila = todo desactivado)
CREATE TABLE preferencias_notificacion (
  id_usuario  INT(11) NOT NULL PRIMARY KEY,
  promociones TINYINT(1) NOT NULL DEFAULT 0,
  novedades   TINYINT(1) NOT NULL DEFAULT 0,
  reposicion  TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_pref_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- RF26 · "Avisarme cuando llegue" en libros agotados
CREATE TABLE avisos_stock (
  id_usuario   INT(11) NOT NULL,
  id_libro     INT(11) NOT NULL,
  fecha        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_aviso  DATETIME DEFAULT NULL,    -- cuándo se le mandó el correo (NULL = sigue esperando)
  PRIMARY KEY (id_usuario, id_libro),
  CONSTRAINT fk_aviso_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_aviso_libro   FOREIGN KEY (id_libro)   REFERENCES libros (id_libro) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- RF25 · Libros que cada usuario ha abierto (historial de navegación para recomendar)
CREATE TABLE libros_vistos (
  id_usuario   INT(11) NOT NULL,
  id_libro     INT(11) NOT NULL,
  veces        INT(11) NOT NULL DEFAULT 1,
  ultima_vista DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_usuario, id_libro),
  CONSTRAINT fk_visto_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_visto_libro   FOREIGN KEY (id_libro)   REFERENCES libros (id_libro) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- RF12 · Conteos cíclicos de inventario
CREATE TABLE conteos (
  id_conteo    INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  estado       ENUM('Abierto','Cerrado') NOT NULL DEFAULT 'Abierto',
  nota         VARCHAR(200) DEFAULT NULL,
  id_usuario   INT(11) DEFAULT NULL,
  fecha_inicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE conteos_detalle (
  id_conteo        INT(11) NOT NULL,
  id_libro         INT(11) NOT NULL,
  stock_sistema    INT(11) NOT NULL,        -- lo que decía el sistema al empezar el conteo
  cantidad_contada INT(11) DEFAULT NULL,    -- lo que se contó físicamente (NULL = falta contar)
  motivo           VARCHAR(200) DEFAULT NULL,
  ajustado         TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id_conteo, id_libro),
  CONSTRAINT fk_cd_conteo FOREIGN KEY (id_conteo) REFERENCES conteos (id_conteo) ON DELETE CASCADE,
  CONSTRAINT fk_cd_libro  FOREIGN KEY (id_libro)  REFERENCES libros (id_libro) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- RF12 · El motivo de cada ajuste queda en el historial del stock
ALTER TABLE movimientos ADD COLUMN motivo VARCHAR(200) DEFAULT NULL;
