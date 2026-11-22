# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Lectores / clientes** (rol `usuario`): personas que inician sesión para explorar el catálogo de la librería, leer y dejar reseñas, armar un carrito, guardar deseos y revisar sus compras.
- **Dueño / administradores** (rol `admin`): el dueño de la librería y quien él autorice. Su trabajo diario: dar de alta y editar libros, marcar disponibilidad (Disponible / Agotado), gestionar cuentas y roles de usuarios, y seguir de un vistazo el estado del catálogo y las reseñas de los lectores.

## Product Purpose

Tienda en línea de una librería real (Librería Andrés). El catálogo vive en MySQL y se sirve por una API Node/Express; el sitio permite comprar (pasarela de pago aún simulada) y le da al dueño un espacio cómodo y profesional para administrar su negocio sin tocar la base de datos.

## Operating Context

- Desarrollo local con XAMPP (MySQL) y la API en `http://localhost:3000`; producción en Render (`libreria-andres-api.onrender.com`).
- Frontend estático HTML/CSS/JS vanilla en `frontend/`, sin framework ni build. Fuentes vía Google Fonts e iconos Font Awesome 6 por CDN.
- Mercado hispanohablante (direcciones y teléfonos colombianos en los ejemplos). Precios almacenados como DECIMAL; hoy se muestran con `$`.

## Capabilities and Constraints

- API: `GET/POST/PUT/DELETE /api/libros` (escritura solo admin con JWT), `GET/POST /api/libros/:id/resenas`, `GET /api/resenas`, `GET/POST/DELETE /api/usuarios`, `PUT /api/usuarios/:id/rol`, `POST /api/usuarios/login`.
- Libro: título, ISBN, género, autor, precio, portada (URL), descripción, promedio de reseña, disponibilidad (`Disponible` | `Agotado`), fecha de registro.
- No existe aún registro de pedidos/ventas en el backend: el carrito vive en localStorage y "Mis compras" no se alimenta de datos reales. No hay inventario numérico (solo disponible/agotado).
- La administración vive en dos lugares, por decisión del dueño: una sección propia (`admin.html`) y controles rápidos de edición dentro de la tienda, visibles solo para admin.

## Brand Commitments

- Nombre: **Librería Andrés** (el login decía "Librería Adrián"; es un error, el nombre correcto es Andrés).
- Lema existente: "Cultivando el saber literario".
- Todo lo demás de la identidad visual (colores, tipografía, estilo) es libre de reemplazar.

## Evidence on Hand

- Catálogo semilla en `backend/app/config/initDb.js` (Cien años de soledad, Don Quijote, El Principito, 1984…) con portadas de Unsplash.
- No hay cifras de ventas, clientes ni testimonios: no se deben inventar. Cualquier métrica del panel sale de la API.

## Product Principles

1. Al dueño se le ahorra tiempo: las tareas frecuentes (cambiar disponibilidad, editar precio, agregar un libro) se hacen en uno o dos clics.
2. Los libros son el protagonista: portadas y títulos mandan sobre la decoración.
3. Solo se muestra información verdadera; lo que no existe en el backend se presenta como pendiente, nunca como dato.
4. Las acciones destructivas (eliminar libro o usuario) siempre piden confirmación clara.
