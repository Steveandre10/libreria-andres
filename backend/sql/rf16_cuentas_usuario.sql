-- RF16 · Gestionar cuentas de usuario
-- No hace falta correrlo a mano: initDb.js aplica estos cambios al arrancar el servidor
-- (en local y en Render/Aiven). Se deja como documentación del cambio.

-- Una cuenta con pedidos o facturas no se borra (rompería el historial): se desactiva.
ALTER TABLE usuarios ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1;

-- No se permiten dos cuentas con el mismo correo (además de la validación del servidor).
ALTER TABLE usuarios ADD UNIQUE KEY uq_usuarios_email (email);
