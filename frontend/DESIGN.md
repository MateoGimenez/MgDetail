---
name: MgDetailing
description: Cartel fileteado sobre panel grafito, para un taller de detailing en La Rioja.
colors:
  rojo-filete: "#e42c42"
  rojo-chapa: "#c8102e"
  rojo-sombra: "#a00c24"
  rojo-claro: "#ff8b96"
  grafito: "#14171a"
  grafito-hundido: "#101215"
  grafito-panel: "#191c20"
  grafito-borde: "#30353b"
  gris-texto-2: "#b6bdc4"
  gris-texto-3: "#8e969f"
  blanco: "#f7f8f9"
  imprimacion: "#eceef1"
  tinta-panel: "#15181b"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2.85rem, 1.25rem + 6.6vw, 6rem)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2.1rem, 1.45rem + 2.7vw, 3.6rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(1.3rem, 1.15rem + 0.6vw, 1.6rem)"
    fontWeight: 800
    lineHeight: 1.2
  script:
    fontFamily: "Kaushan Script, Brush Script MT, cursive"
    fontSize: "clamp(2.6rem, 1.3rem + 6vw, 6rem)"
    fontWeight: 400
    lineHeight: 1.25
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    letterSpacing: "0.12em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.rojo-chapa}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "48px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.blanco}"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "48px"
  input:
    backgroundColor: "#0f1214"
    textColor: "{colors.blanco}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "50px"
  chip-selector:
    backgroundColor: "#121518"
    textColor: "{colors.gris-texto-2}"
    rounded: "{rounded.md}"
    height: "52px"
---

# Design System: MgDetailing

## Overview

**Creative North Star: "El cartel fileteado"**

La web es un cartel pintado sobre un panel grafito, como los oficios argentinos pintaban vehículos y carteles: filete rojo de un solo trazo, volutas en espiral, rombos y letra con luz y sombra. La marca se lee en el material (grafito laqueado, cromo, filete), no en fotos: el sitio se ve completo sin imágenes y deja lugar para que las fotos reales del taller se luzcan cuando lleguen.

La densidad es de lectura tranquila: un solo gesto a escala display por sección, todo lo demás en tamaño de lectura. El ornamento enmarca y marca estado; nunca va detrás de texto. El panel `/admin` usa el mismo sistema pero con área de trabajo clara (gris imprimación) bajo un riel grafito, porque se usa en el taller con luz de día.

**Key Characteristics:**
- Fondo grafito con un reflejo de luz fijo que el contenido atraviesa al scrollear.
- Filete rojo con sombra, brillo central y una luz blanca paralela; esquinas con volutas.
- Letra cromada (cielo, horizonte oscuro, suelo) con sombra roja solo en logo, H1 y la frase.
- Lo elegido se marca con un filete corto que se dibuja de un trazo.

## Colors

Grafito, gris y blanco con el rojo como único acento: estrategia restringida con un acento que trabaja (acción, selección, filete).

### Primary
- **Rojo filete** (#e42c42): líneas de filete, volutas, rombos, foco de campos, borde de lo elegido.
- **Rojo chapa** (#c8102e): relleno del botón primario (degradé #d61c35 → #c8102e → #ae0c27), sello de cuenta en el panel.
- **Rojo sombra** (#a00c24): sombra desplazada de la letra cromada.
- **Rojo claro** (#ff8b96): texto de error sobre grafito.

### Neutral
- **Grafito** (#14171a): fondo de la landing.
- **Grafito hundido** (#101215) y **panel** (#191c20): superficies de datos y paneles.
- **Borde grafito** (#30353b): divisiones y bordes.
- **Blanco** (#f7f8f9), **gris 2** (#b6bdc4), **gris 3** (#8e969f): texto principal, secundario y terciario.
- **Imprimación** (#eceef1) y **tinta** (#15181b): fondo y texto del área de trabajo del panel.

### Named Rules
**La regla del acento único.** El rojo es el único color de marca saturado; los colores de estado del panel (ámbar, verde) aparecen solo en los sellos de estado y siempre con texto.

## Typography

**Display Font:** Barlow Condensed 800 (subset latin)
**Script Font:** Kaushan Script
**Body Font:** Archivo (variable, peso 100–900, subset latin)

**Character:** condensada pesada de señalética de ruta, con el mismo ángulo y peso que el monograma del logo; script de pincel como el "Detailing" del logo para la frase; y una grotesca sobria para todo lo que se lee de cerca. Elegida entre tres propuestas (ver `.capturas/tipografias-comparacion.png`); los tokens `--f-display` y `--f-acento` y las caras de `src/styles/fuentes.css` permiten volver atrás.

### Hierarchy
- **Display** (900, clamp 2.85–6rem, 1.02): solo el H1 del cartel, cromado.
- **Headline** (800, clamp 2.1–3.6rem, 1.05): títulos de sección.
- **Title** (700, 1.3–1.6rem, 1.2): servicios, pasos, beneficios, grupos del formulario.
- **Script** (Kaushan Script, hasta 5rem): "Detailing" del logo y "Lo bueno se hace con tiempo."
- **Body** (400, 1.0625rem, 1.6): texto corrido, medida máxima ~40rem.
- **Label** (650, 0.75rem, 0.12em, mayúsculas): rótulos de datos (Duración, Precio, Incluye). Nunca encima de un título.

### Named Rules
**La regla del cromo escaso.** El relleno cromado (degradé por renglón con `background-size: 100% 1lh` y sombra roja) se usa en tres lugares: logo, H1 y la frase. Los títulos de sección van en blanco liso.

## Layout

Mobile-first. Contenedor de 1200px con margen lateral `clamp(20px, 5vw, 48px)`. Secciones con `padding-block: clamp(72px, 9vw, 128px)`. Desde 900px, las secciones de lectura usan dos columnas 4/7 con la cabecera pegajosa a la izquierda (Cómo trabajamos, Preguntas) y los servicios usan 5/7 (datos a la izquierda, detalle a la derecha). El formulario pasa a dos columnas desde 1000px con el resumen pegajoso de 340px. Cortes: 520, 640, 800, 900, 1000px.

## Elevation & Depth

Profundidad por capas tonales (grafito 925/900/850/800) más dos sombras con desplazamiento y desenfoque; sin halos de color.

### Shadow Vocabulary
- **sombra-1** (`0 1px 2px rgb(0 0 0 / .4), 0 8px 18px -10px rgb(0 0 0 / .75)`): elementos chicos.
- **sombra-2** (`0 2px 6px rgb(0 0 0 / .35), 0 30px 60px -30px rgb(0 0 0 / .9)`): paneles (cartel, plancha destacada, formulario).

## Shapes

Esquinas casi rectas, como una chapa pintada: 4px en paneles, 6px en botones y campos, 10px en las tarjetas del panel. Las píldoras (999px) solo para sellos y rótulos. Los marcos se arman con cuatro esquinas SVG de 140 unidades escaladas por `--esq` y franjas CSS que repiten el perfil del filete.

## Components

### Buttons
- **Primario (chapa roja):** degradé rojo con bisel (luz interior arriba, sombra abajo), 48px (chico 40, grande 56), radio 6px. Activo baja 1px.
- **Secundario:** borde blanco al 26%, fondo transparente; hover sube el borde al 55%.
- **Fantasma:** solo texto gris; hover con fondo blanco al 6%.

### Selector (chips de vehículo y franja)
- Radio nativo invisible sobre una chapa de 52px. Elegido: borde rojo, fondo #22161a y un filete corto que se dibuja de un trazo. Foco: contorno blanco de 2px.

### Inputs / Fields
- Fondo #0f1214, borde #6f777f (4,1:1 contra el campo; ver "El borde de los campos en oscuro"), radio 6px, 50px de alto. Foco: borde rojo + anillo rojo al 35%. Error: borde rojo claro, mensaje con ícono debajo, `aria-invalid` y `aria-describedby`.

### Navigation
- Cabecera pegajosa grafito al 96% sin desenfoque. Enlaces gris que se subrayan con un filete rojo al pasar. En móvil, menú desplegable con enlaces en romana y Escape para cerrar.

### Marco fileteado (componente firma)
- Esquinas con volutas (espiral de semicírculos), rombo hueco y bolitas; franjas con sombra, rojo, brillo y luz. En el hero y en el éxito del turno se dibuja al aparecer (solo sin `prefers-reduced-motion`).

### Comparador antes/después
- `<input type="range">` nativo y transparente sobre las dos fotos; divisor de filete con manija medallón. Accesible con teclado.

## Tema claro

La web pública tiene dos temas. El oscuro (todo lo anterior) es el de la marca y el predeterminado. El claro redefine **las mismas variables semánticas** bajo `:root[data-tema='claro']` en `src/styles/base.css`: el mismo cartel pintado, pero sobre chapa esmaltada blanca. Los estilos nuevos usan solo estas variables y por eso andan en los dos temas. El panel `/admin` no recibe `data-tema`: define sus propios valores claros en `.panel` (`admin.css`).

| Variable | Oscuro | Claro | Para qué |
|---|---|---|---|
| `--fondo` / `--fondo-hundido` | #14171a / #101215 | #f7f8f9 / #edf0f2 | página y zonas hundidas |
| `--superficie` / `--superficie-2` | #191c20 / #1f2327 | #ffffff / #e6e9ec | paneles y tarjetas |
| `--borde` | #30353b | #cfd4d9 | divisiones |
| `--texto` / `--texto-2` / `--texto-3` | #f7f8f9 / #b6bdc4 / #8e969f | #15181b / #3f454c / #5b636c | principal, secundario, terciario |
| `--acento` / `--acento-texto` | #e42c42 / #ff5d6e | #c8102e / #a50c26 | filete y selección / enlaces y sellos |
| `--error` / `--exito` | #ff8b96 / #86d9aa | #b3261e / #1d7a46 | estados |
| `--foco` | #ffffff | #14171a | anillo de foco |
| `--campo-fondo` | #0f1214 | #ffffff | campos |
| `--campo-borde` / `--campo-borde-hover` | #6f777f / #9199a2 | #7b838c / #4d545c | borde de campos y opciones |

Contrastes del tema claro (WCAG 2.1 AA, calculados; la tabla completa está en `README.md`):

| Par | Colores | Contraste |
|---|---|---|
| Texto / fondo · superficie | #15181b / #f7f8f9 · #ffffff | 16,8 · 17,8 |
| Texto 2 / fondo · hundido | #3f454c / #f7f8f9 · #edf0f2 | 9,1 · 8,5 |
| Texto 3 / fondo · hundido · pie | #5b636c / #f7f8f9 · #edf0f2 · #e9ecef | 5,7 · 5,3 · 5,1 |
| Acento texto / fondo · blanco | #a50c26 | 7,4 · 7,8 |
| Acento y filete (gráfico) / fondo · blanco | #c8102e | 5,5 · 5,9 |
| Error / blanco · fondo | #b3261e | 6,5 · 6,2 |
| Éxito / blanco · fondo | #1d7a46 | 5,4 · 5,0 |
| Borde de campo / blanco · hundido | #7b838c | 3,8 · 3,4 |
| Foco / fondo · blanco | #14171a | 16,9 · 18,0 |

### El borde de los campos en oscuro

`--campo-borde` era #3a4047 sobre el fondo del campo #0f1214: **1,79:1**, por debajo del 3:1 que pide WCAG 1.4.11 para el borde de un control. Ahora es **#6f777f** y el hover **#9199a2**. Es lo único del tema oscuro que cambió; el claro no se tocó.

| Borde #6f777f contra | Color | Contraste |
|---|---|---|
| Fondo del campo | #0f1214 | 4,14:1 |
| Fondo de las opciones (chips, radios, filas elegibles) | #121518 | 4,03:1 |
| Fondo de página | #14171a | 3,96:1 |
| Superficie (paneles, formulario) | #191c20 | 3,76:1 |
| Caja del ingreso al panel | #1c1f23 | 3,64:1 |
| Superficie 2 (el peor caso) | #1f2327 | 3,48:1 |

El hover #9199a2 da 6,52:1 contra el campo. Como `--campo-borde` lo usan también los selectores de vehículo y franja, el calendario de la reserva y las filas elegibles (todos sobre `--opcion-fondo`), quedan corregidos de una vez. El interruptor de tema usa el hover como borde en reposo. Lo elegido sigue marcándose con el rojo.

## Componentes del panel

Viven en `src/admin/`, usan las variables del panel y no agregan colores (salvo el ámbar de aviso que ya usaban los sellos de borrador).

### Tarjeta de Hoy
- Pantalla por defecto del panel (`VistaHoy.tsx`). Un título con saludo y nombre ("Buen día, Mateo"), la fecha y tres tarjetas planas: **Pendientes**, **Turnos de hoy** y **Mañana**. Nada va anidado: dentro de cada tarjeta los renglones se separan con una línea fina.
- Celular: una columna en ese orden. Desde 900 px: pendientes y mañana a la izquierda, hoy a la derecha.
- Pendientes: el acceso grande es **un solo botón** con la cantidad en el display ("4 pendientes", en rojo acento) y la flecha; debajo, los 3 que más esperan con "Llegó hace 3 días" y **Abrir**, que lleva a Turnos con ese nombre ya buscado. Sin pendientes: tilde verde y "Está todo al día".
- Hoy: Mañana y Tarde con el cupo ("1/2", en rojo y negrita cuando está completa, "Cerrada" si no hay lugar) y los turnos con su sello de estado. Sin turnos: "Hoy no hay turnos.". Si el día figura cerrado o una franja está llena, un aviso ámbar arriba, con ícono y texto (nunca solo color).
- Empleado: ve lo mismo; Hoy no tiene controles de edición (confirmar y reprogramar viven en Turnos y Agenda).

### Aviso (toast)
- Grafito del riel (#1f2327, borde #3f454c) con texto blanco, ícono de tilde en `--exito` o de alerta en `--error` y un cerrar de 44 px. Va fuera de `.panel`, con los tokens oscuros.
- El éxito se cierra solo a los 4 s (se pausa con el mouse o el foco encima); el **error queda hasta cerrarlo**. Máximo 3: al pasar se descarta el éxito más viejo. El mismo texto repetido no se apila.
- Dos regiones siempre presentes: `role="status"` (éxitos) y `role="alert"` (errores).
- Celular: ancho completo, **arriba de la barra fija** `.varios-barra` (el proveedor mide su alto y lo publica en `--toasts-barra`) y del área segura (`env(safe-area-inset-bottom)`). Desde 640 px, abajo a la derecha. Entra con un desplazamiento corto solo sin `prefers-reduced-motion`.
- Reemplazan los mensajes de éxito fijos de Servicios, Disponibilidad, Usuarios, Turnos y Agenda. Los errores por campo siguen en el campo.

### Esqueleto de carga
- Barras y bloques de gris suave (`--borde-suave` con brillo `--fondo-hundido`) dentro de **los mismos contenedores y con las mismas alturas mínimas** que el contenido real: Servicios, Usuarios, Agenda (tira de siete días y día en el celular, grilla 7 × 2 desde 900 px), Disponibilidad (mes de seis semanas y panel del día) y Hoy. Al llegar los datos no hay saltos.
- Decorativos (`aria-hidden`); el "Cargando…" lo anuncia la región en vivo de cada vista. El brillo corre solo sin `prefers-reduced-motion`; con reducción queda quieto.

## Do's and Don'ts

### Do:
- **Do** marcar estado (elegido, foco, error) en el filete o el borde del propio elemento.
- **Do** mantener texto siempre sobre fondo liso: el ornamento enmarca, no se superpone.
- **Do** dejar visible todo contenido por defecto; el movimiento es un trazo que se dibuja una vez.
- **Do** usar fotos reales del taller en `public/fotos/` cuando las haya.

### Don't:
- **Don't** usar fotos de stock ni imágenes generadas por IA de autos.
- **Don't** poner rótulos o "eyebrows" encima de los títulos.
- **Don't** extender el cromo a títulos de sección ni a textos largos.
- **Don't** agregar halos de color, vidrio desenfocado ni tarjetas iguales con íconos.
