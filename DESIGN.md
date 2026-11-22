# Diseño · Librería Adrián — "El Fichero"

Cada libro es una ficha de catálogo de biblioteca: cartulina clara, raya roja de cabecera, número de registro mecanografiado. La tienda (lectores) y la administración (dueño) leen el mismo registro. Todo vive en `frontend/Estilos/main.css`; los tokens están en `:root`.

## Color

Estrategia restringida con un armazón comprometido: el riel azul tinta es el mueble del fichero, el suelo es un gris frío tomado de ese azul, y la cartulina de la ficha es lo único cálido.

| Rol | Token | Valor | Uso |
|---|---|---|---|
| Riel / mueble | `--ink-900` | `#1c2b4a` | Barra lateral, panel del login |
| Acción | `--action` | `#1c2b4a` | **Único color pulsable**: botones primarios, segmentos activos |
| Suelo | `--paper` | `#eaedf1` | Fondo de página |
| Tarjeta / tabla | `--card` | `#ffffff` | Paneles, tablas, campos |
| Ficha | `--ficha` | `#fcfbf8` | Registro del libro, login, perfil, diálogos |
| Raya de cabecera | `--red-rule` | `#d2463c` | Línea bajo la cabecera de cada ficha y sello AGOTADO |
| Agotado / peligro | `--red` | `#b8372e` | Estado agotado, eliminar |
| Disponible | `--ok` | `#26623f` | Estado disponible |
| Texto | `--text` / `--text-2` / `--text-3` | `#1b2233` / `#444e62` / `#636c7e` | Todos ≥ 4.5:1 sobre blanco |

**Pestañas de género** (`--tab-1` … `--tab-7`): significan solo género, en tienda y en panel. `window.genreColor(genero)` asigna siempre el mismo color al mismo género. Nunca se usan como decoración.

## Tipografía

- **Archivo** (eje de ancho 62–125, peso 400–800): toda la interfaz. Los títulos usan `font-stretch` 106–118% y peso 800.
- **Courier Prime**: solo número de registro, ISBN, fechas y etiquetas de campo/columna (lo que en una ficha real va a máquina). No se usa como adorno.
- Cifras tabulares (`font-variant-numeric: tabular-nums`) en precios, notas y tablas.
- Escala: 12 · 13 · 15 (base) · 17 · 22 · 28 · 36 px.
- Formato numérico colombiano en todo el sitio: `$1.223,00`, nota `4,8`.

## Componentes

- **Riel** (`#rail`, dibujado por `renderShell()` en `auth.js`): marca, navegación con `aria-current`, grupo "Dueño → Administrar tienda" solo para admin, usuario y cerrar sesión al pie. En móvil (< 900px) se vuelve barra superior desplazable.
- **Ficha** (`.ficha` + `.ficha-head` + `.ficha-body`): firma del sistema. Cabecera con `N.º 0007` e ISBN, título, raya roja; hechos en `dl.ficha-facts` con renglón azul. Se usa en: detalle del libro (cajón lateral en la tienda), editor de libro y alta de usuario (panel derecho en admin), login, perfil, pago, recibo y diálogos de confirmación.
- **Pestañas índice** (`.index-tabs`): filtros de género sobre el panel del catálogo; la activa se une al panel.
- **Sello AGOTADO** (`.stamp`): sobre la portada de libros agotados; la portada pierde saturación.
- **Valoración**: una sola escala en todo el sitio, estrella + nota con un decimal (`ratingHTML()`); sin reseñas muestra "Sin reseñas".
- **Interruptor de disponibilidad** (`.switch`): control rápido del dueño en la tienda y en la tabla de libros.
- **Tabla de administración** (`.table`): cabeceras en Courier, filas clicables abren la ficha a la derecha.
- **Confirmación** (`window.confirmar()`): `<dialog>` con forma de ficha para toda acción destructiva.
- **Avisos** (`showToast`): cinta azul tinta abajo a la derecha; rojo para errores.

## Forma y profundidad

Radios: 5px campos, 6px botones, 8px paneles, 4px fichas, portadas con lomo (2px/5px). Elevación declarada una vez: paneles con borde, fichas con sombra suave desplazada, portadas con sombra propia.

## Movimiento

Curva única `cubic-bezier(0.16, 1, 0.3, 1)`. Portadas se elevan 4px al pasar el cursor; el cajón de la ficha entra deslizando 28px; pestañas suben al activarse. Todo se anula con `prefers-reduced-motion`.

## Superficies del navegador

Selección `#c9daf3`, anillo de foco azul `#3b6fd1`, barras de desplazamiento del color de las líneas.
