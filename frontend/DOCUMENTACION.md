# 📚 Documentación General del Proyecto - Librería Andrés

Esta documentación proporciona una visión integral de la arquitectura, estructura de archivos, flujo de ejecución, base de datos y detalles de las funciones tanto para el **Backend** como para el **Frontend** del proyecto **Librería Andrés**.

---

## 🏗️ 1. Arquitectura General del Sistema

El proyecto está diseñado bajo un modelo de arquitectura **Cliente-Servidor** desacoplado:
1. **Frontend**: Aplicación SPA/Multi-page estática estructurada en HTML5, CSS3 vanilla (estilos avanzados con efectos modernos) y JavaScript moderno (ES6+). Se encarga de renderizar la interfaz de usuario, almacenar el estado de la sesión localmente y realizar peticiones HTTP asíncronas al servidor.
2. **Backend**: Servicio RESTful API construido sobre **Node.js** y **Express.js**. Se encarga de procesar las peticiones HTTP, validar la lógica de negocio, firmar tokens de sesión y comunicarse de manera segura con el motor de base de datos.
3. **Base de Datos (BD)**: Motor relacional **MySQL** que persiste de forma estructurada los registros del sistema.

### 📊 Diagrama de Flujo y Comunicación

```mermaid
graph TD
    subgraph Frontend [Librería Andrés - Frontend]
        UI["Vistas HTML (index, login, profile, wishlist, cart, purchases)"]
        JS["Lógica de Interfaz (login.js, script.js)"]
        Auth["auth.js (Manejador Global de Sesión)"]
        LS[("Local Storage (token, usuario)")]

        UI <-->|Manipulación DOM| JS
        JS <-->|Validación y Rutas| Auth
        Auth <-->|Persistencia Local| LS
    end

    subgraph Backend [Librería Andrés - Backend]
        Routes["Enrutador (app/routes/usuarios.routes.js)"]
        Ctrl["Controladores (app/controllers/usuarios.controller.js)"]
        Model["Modelos SQL (app/models/usuarios.model.js)"]
        DBConn["Conexión a BD (app/config/db.js)"]
        Legacy["Helpers Legacy (app/config/usuario.js)"]

        Routes -->|Acción HTTP| Ctrl
        Ctrl -->|Query Asíncrono| Model
        Model -->|Pool de Conexiones| DBConn
    end

    JS -.->|fetchAPI (HTTP + Authorization Header)| Routes
    DBConn <-->|Lectura/Escritura SQL| DB[("Base de Datos MySQL (libreria)")]
```

---

## 📂 2. Estructura de Directorios

El espacio de trabajo se divide en dos proyectos hermanos ubicados en directorios independientes:

### ⚙️ Backend (`Librer-a-Andr-s-Backend/`)
```
Librer-a-Andr-s-Backend/
├── index.js                    # Servidor Express y punto de entrada principal
├── DOCUMENTACION.md            # Archivo de documentación técnica del Backend
├── package.json                # Configuración de dependencias de Node.js
└── app/
    ├── config/
    │   ├── db.js               # Instancia y pool de conexión a MySQL
    │   └── usuario.js          # Controladores legacy directos a BD para pruebas
    ├── controllers/
    │   └── usuarios.controller.js # Controladores del ciclo de Vida HTTP (Lógica de negocio)
    ├── models/
    │   └── usuarios.model.js      # Modelos de datos (Consultas SQL directas a la BD)
    └── routes/
        └── usuarios.routes.js     # Enrutador Express de endpoints para Usuarios
```

### 🎨 Frontend (`Librer-a-Andr-s-Frontend/`)
```
Librer-a-Andr-s-Frontend/
├── index.html                  # Panel de control / Dashboard principal del usuario
├── login.html                  # Vista unificada de Inicio de Sesión y Registro de Cuentas
├── profile.html                # Perfil del usuario con visualización detallada de datos
├── wishlist.html               # Lista de deseos / Libros favoritos del usuario
├── cart.html                   # Carrito de compras de la librería
├── purchases.html              # Historial de compras del cliente
├── login.js                    # Controlador de eventos e interacciones de login.html
├── DOCUMENTACION.md            # Este archivo de documentación técnica unificada
├── README.md                   # Breve introducción al frontend
├── Estilos/
│   └── main.css                # Hoja de estilos globales (diseño, efectos y animaciones)
├── Temporal/
│   └── template.html           # Plantilla base reutilizable de vistas
└── assets/
    └── js/
        ├── auth.js             # Módulo global autoejecutable (sesión y peticiones seguras)
        └── script.js           # Lógica dinámica general del usuario e inicialización
```

---

## 🗃️ 3. Modelo de Datos y Base de Datos (MySQL)

La base de datos se denomina `libreria`. Actualmente, la entidad central es la tabla `usuarios`, la cual posee la siguiente estructura y restricciones:

### 📝 Estructura de la Tabla `usuarios`
| Campo | Tipo de Datos | Nulabilidad | Atributos | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `INT` | `NOT NULL` | `PRIMARY KEY AUTO_INCREMENT` | Identificador único numérico del usuario. |
| **`nombre`** | `VARCHAR(100)` | `NOT NULL` | | Nombre completo del usuario. |
| **`email`** | `VARCHAR(100)` | `NOT NULL` | `UNIQUE` | Correo electrónico de inicio de sesión (debe ser único). |
| **`password`** | `VARCHAR(255)` | `NOT NULL` | | Contraseña en texto plano para autenticación. |
| **`telefono`** | `VARCHAR(20)` | `NULL` | | Número de contacto opcional. |
| **`direccion`** | `VARCHAR(255)` | `NULL` | | Dirección física para entregas de la librería. |
| **`fecha_registro`**| `TIMESTAMP` | `NOT NULL` | `DEFAULT CURRENT_TIMESTAMP` | Fecha y hora exacta de creación de la cuenta. |

### 🛠️ Script SQL para la Creación de la Tabla
```sql
CREATE DATABASE IF NOT EXISTS `libreria` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `libreria`;

CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nombre` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `telefono` VARCHAR(20) DEFAULT NULL,
  `direccion` VARCHAR(255) DEFAULT NULL,
  `fecha_registro` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
```

---

## 💻 4. Documentación Detallada de las Funciones

### ⚙️ Funciones del Backend (Servidor)

#### 📄 db.js
* **`pool`** *(Objeto de conexión)*: Instancia global que gestiona un pool de hasta 10 conexiones simultáneas a MySQL. Permite el uso de promesas mediante el driver `mysql2/promise`.

#### 📄 usuario.js *(Legacy/Helpers)*
* **`listarUsuarios(req, res)`** *(Asíncrona)*:
  * **Acción**: Ejecuta un `SELECT * FROM usuarios` de manera rápida y envía un array plano al cliente.
  * **Retorno**: Respuesta HTTP JSON con código `200` o `500`.
* **`obtenerUsuario(req, res)`** *(Asíncrona)*:
  * **Acción**: Consulta por el identificador del usuario extraído de los parámetros de la URL (`req.params.id`).
  * **Retorno**: Respuesta HTTP JSON con el usuario (`200`), error `404` si no existe o `500`.
* **`crearUsuario(req, res)`** *(Asíncrona)*:
  * **Acción**: Crea un usuario básico insertando los valores del cuerpo de la petición.
  * **Retorno**: Respuesta HTTP JSON del usuario creado con su `id` insertado (`201`) o error `500`.

#### 📄 usuarios.model.js *(Capa de Datos)*
* **`getAllUsuarios()`** *(Asíncrona)*:
  * **Acción**: Realiza la consulta SQL para traer todos los registros de la tabla `usuarios`.
  * **Retorno**: `Promise<Array<Object>>` con los usuarios encontrados.
* **`getUsuarioById(id)`** *(Asíncrona)*:
  * **Parámetros**: `id` *(number|string)*: ID único de usuario.
  * **Acción**: Realiza una consulta SQL con marcador de posición `WHERE id = ?` de manera segura.
  * **Retorno**: `Promise<Array<Object>>` que contiene el objeto del usuario o un array vacío.
* **`getUsuarioByEmail(email)`** *(Asíncrona)*:
  * **Parámetros**: `email` *(string)*: Correo electrónico del usuario.
  * **Acción**: Realiza la búsqueda SQL con marcador de posición `WHERE email = ?`.
  * **Retorno**: `Promise<Array<Object>>` con el registro correspondiente.
* **`crearUsuario(usuario)`** *(Asíncrona)*:
  * **Parámetros**: `usuario` *(Object)*: Objeto con propiedades `{ nombre, email, password }`.
  * **Acción**: Inserta el registro en la base de datos MySQL.
  * **Retorno**: `Promise<Object>` con el formato `{ id, nombre, email }`.
* **`eliminarUsuario(id)`** *(Asíncrona)*:
  * **Parámetros**: `id` *(number|string)*.
  * **Acción**: Ejecuta la sentencia SQL `DELETE FROM usuarios WHERE id = ?`.
  * **Retorno**: `Promise<void>`.

#### 📄 usuarios.controller.js *(Capa de Lógica)*
* **`listarUsuarios(req, res)`** *(Asíncrona)*:
  * **Acción**: Llama al modelo `getAllUsuarios()` y encapsula la respuesta en un objeto `{ usuarios }`.
  * **Retorno**: Envía JSON con código `200` o error `500`.
* **`obtenerUsuario(req, res)`** *(Asíncrona)*:
  * **Acción**: Recupera el ID de los parámetros, llama a `getUsuarioById(id)`, y responde con `{ usuario: rows[0] }`.
  * **Retorno**: JSON `200`, `404` (si no existe) o `500`.
* **`crearUsuario(req, res)`** *(Asíncrona)*:
  * **Acción**: Valida que existan `nombre`, `email` y `password` en el cuerpo. Posteriormente llama a `crearUsuarioModel(usuario)`.
  * **Retorno**: JSON `201` con el usuario registrado o `400` por datos insuficientes.
* **`eliminarUsuario(req, res)`** *(Asíncrona)*:
  * **Acción**: Obtiene el ID, llama a `eliminarUsuarioModel(id)` para borrar el registro.
  * **Retorno**: JSON `{ message: 'Usuario eliminado correctamente' }`.
* **`loginUsuario(req, res)`** *(Asíncrona)*:
  * **Acción**: Valida la existencia de credenciales. Compara la contraseña en texto plano con el registro obtenido de `getUsuarioByEmail(email)`. Si la validación es correcta, firma un **token JWT** con una expiración de 24 horas y retorna los datos básicos de perfil.
  * **Retorno**: JSON `200` con el token y datos del usuario, `400` por campos vacíos o `401` por credenciales inválidas.

---

### 🎨 Funciones del Frontend (Cliente)

#### 📄 assets/js/auth.js *(Manejador de Sesión)*
* **`(function() { ... })()`** *(IIFE - Autoejecutable)*: Encapsula el alcance de variables locales de inicio y protege la aplicación.
  * **Lógica**: Si no existen el `token` y el `usuario` en localStorage y la ventana actual no es `login.html`, redirige automáticamente al login. Si existe sesión y se intenta acceder a `login.html`, redirige al `index.html`.
* **`window.logout()`** *(Global)*:
  * **Acción**: Elimina el `token` y los datos del `usuario` almacenados en `localStorage` y redirige al usuario a `login.html`.
* **`window.fetchAPI(url, options)`** *(Global / Asíncrona)*:
  * **Parámetros**: `url` *(string)*, `options` *(Object - opcional)*.
  * **Acción**: Envoltura inteligente para solicitudes fetch que inyecta la cabecera `Authorization: Bearer <token>` si hay sesión activa.
  * **Control de Expiración**: Si el servidor retorna un código de estado `401` (No Autorizado), invoca automáticamente a `logout()` y lanza una excepción.

#### 📄 login.js *(Lógica de Autenticación)*
* **`switchLink.addEventListener('click', ...)`**:
  * **Acción**: Alterna dinámicamente el estado de la variable `isLoginView` para alternar la pantalla de inicio de sesión y registro de cuentas (oculta y muestra inputs y actualiza textos de botones).
* **`showAlert(message, type)`**:
  * **Parámetros**: `message` *(string)*, `type` *(error | success)*.
  * **Acción**: Muestra un cuadro de alerta dinámico con un icono y estilo adaptado al tipo de mensaje.
* **`clearAlert()`**:
  * **Acción**: Oculta el banner de alertas de la vista de inicio de sesión.
* **`authForm.addEventListener('submit', ...)`**:
  * **Acción**: Detiene el envío predeterminado del formulario, recopila las entradas e interactúa con los endpoints del backend (`/login` o `/` para registros). 
  * **Inicio automático**: Si el registro es exitoso, realiza inmediatamente una petición de login en segundo plano para iniciar sesión de forma transparente y redirigir a `index.html`.

#### 📄 assets/js/script.js *(Carga de Datos)*
* **`document.addEventListener('DOMContentLoaded', ...)`**:
  * **Acción**: Personaliza la interfaz con el nombre del usuario logueado en el navbar y el banner del index. Si está en `profile.html`, inicia la carga remota del perfil.
* **`cargarDatosPerfil(userId)`** *(Asíncrona)*:
  * **Parámetros**: `userId` *(number|string)*.
  * **Acción**: Envía una petición GET al backend para obtener los datos más recientes del usuario. Si tiene éxito, los pinta en la pantalla.
  * **Fallback Offline**: Si la petición falla (por ejemplo, el servidor está caído), utiliza los datos que se guardaron localmente en el `localStorage` para garantizar la funcionalidad offline.

---

## 🗺️ 5. Mapeo de API Endpoints

Todos los endpoints tienen el prefijo base `/api/usuarios`.

| Método HTTP | Endpoint | Cuerpo Requerido (JSON) | Cabecera Auth | Respuesta Exitosa | Descripción |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **GET** | `/api/usuarios/` | *Ninguno* | No | `200` `{ usuarios: [...] }` | Lista todos los usuarios. |
| **GET** | `/api/usuarios/:id` | *Ninguno* | No* | `200` `{ usuario: {...} }` | Obtiene perfil de usuario por ID. |
| **POST** | `/api/usuarios/` | `{ nombre, email, password }` | No | `201` `{ id, nombre, email }` | Crea/Registra un nuevo usuario. |
| **POST** | `/api/usuarios/login` | `{ email, password }` | No | `200` `{ token, usuario }` | Inicia sesión y genera token. |
| **DELETE** | `/api/usuarios/:id` | *Ninguno* | No* | `200` `{ message: '...' }` | Elimina un usuario del sistema. |

> [!NOTE]
> Aunque los endpoints del backend no tienen middlewares activos de bloqueo de rutas en este momento, las peticiones del frontend inyectan el token Bearer para compatibilidad futura y seguridad.

---

## ⚡ 6. Ejemplos de Pruebas de API (Peticiones y Respuestas)

### 🚪 Autenticar Usuario (Login)
* **Petición**: `POST` a `http://localhost:3000/api/usuarios/login`
* **JSON del Cuerpo**:
```json
{
  "email": "juan.perez@example.com",
  "password": "contrasenia_super_segura"
}
```
* **Respuesta Exitosa (200 OK)**:
```json
{
  "message": "Inicio de sesión exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Mywibm9tYnJlIjoiSnVhbiBQZXJleiIsImVtYWlsIjoianVhbi5wZXJlekBleGFtcGxlLmNvbSJ9...",
  "usuario": {
    "id": 3,
    "nombre": "Juan Perez",
    "email": "juan.perez@example.com",
    "telefono": "3104567890",
    "direccion": "Avenida Siempre Viva 123",
    "fecha_registro": "2026-06-22T04:45:00.000Z"
  }
}
```

### 📝 Registrar Nuevo Usuario
* **Petición**: `POST` a `http://localhost:3000/api/usuarios/`
* **JSON del Cuerpo**:
```json
{
  "nombre": "Andres Garcia",
  "email": "andres@ejemplo.com",
  "password": "mi_password_seguro"
}
```
* **Respuesta Exitosa (201 Created)**:
```json
{
  "id": 4,
  "nombre": "Andres Garcia",
  "email": "andres@ejemplo.com"
}
```

---

## 🚀 7. Guía de Inicio Rápido (Despliegue Local)

Sigue estos pasos para desplegar y probar toda la aplicación localmente en tu máquina.

### Paso 1: Configurar MySQL
1. Inicia tu servidor local MySQL (por ejemplo, mediante XAMPP, Laragon, WampServer o Docker).
2. Abre tu gestor de base de datos preferido (phpMyAdmin, DBeaver, MySQL Workbench, etc.).
3. Crea una base de datos llamada `libreria`.
4. Ejecuta el [Script SQL de la sección 3](#-3-modelo-de-datos-y-base-de-datos-mysql) para crear la tabla de usuarios. Puedes opcionalmente insertar datos de prueba:
   ```sql
   INSERT INTO usuarios (nombre, email, password, telefono, direccion) VALUES 
   ('Steven Andres', 'steven@libreria.com', 'admin123', '3009876543', 'Calle Central 45'),
   ('Maria Camila', 'camila@libreria.com', 'camilalector', '3151234567', 'Carrera 10 # 5-20');
   ```

### Paso 2: Configurar e Iniciar el Backend
1. Abre tu terminal en el directorio del backend (`Librer-a-Andr-s-Backend`).
2. Instala las dependencias del proyecto:
   ```bash
   npm install
   ```
   *(Esto instalará los módulos requeridos: `express`, `mysql2`, `cors`, `jsonwebtoken`)*.
3. Inicia el servidor de desarrollo:
   ```bash
   node index.js
   ```
4. Verás en la consola el mensaje: `Servidor corriendo en puerto 3000`. 
5. Puedes probar que esté en línea entrando en tu navegador a: [http://localhost:3000/](http://localhost:3000/). Deberás obtener la respuesta `{ "message": "Servidor funcionando (Librería Andrés!)" }`.

### Paso 3: Iniciar y Probar el Frontend
1. Como el frontend consiste en archivos estáticos puros (`html`, `css`, `js`), puedes ejecutarlo directamente de dos formas:
   * **Opción A (Fácil)**: Haz doble clic en el archivo `login.html` en tu explorador de archivos para abrirlo directamente en tu navegador web.
   * **Opción B (Recomendada)**: Ejecútalo con un servidor local de desarrollo como la extensión **Live Server** de Visual Studio Code o mediante la terminal en el directorio del frontend (`Librer-a-Andr-s-Frontend`) con `npx live-server` o `npx serve`.
2. Interactúa con el login:
   * Regístrate con una nueva cuenta, comprueba que la redirección automática te lleve a `index.html`.
   * Verifica que en la esquina superior se muestre tu nombre.
   * Accede a la pestaña "Perfil" (`profile.html`) y valida que muestre todos tus datos reales consumidos directamente de la base de datos en tiempo real.
   * Cierra tu sesión para asegurar el borrado correcto de credenciales locales en `localStorage`.
