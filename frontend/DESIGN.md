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
- **sombra-2** (`0 2px 6px rgb(0 0 0 / .35), 0 30px 60px -30px rgb(0 0 0 / .9)`): paneles (cartel, card destacada, formulario).

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

### Card de servicio
- **Celular (< 700 px): carrusel horizontal** (`ListaTarjetas.tsx`): cada card mide `min(84vw, 340px)` y la siguiente se asoma; `scroll-snap-type: x mandatory`, `overscroll-behavior-x: contain` y la lista llega hasta los bordes de la pantalla, así que solo ella se desplaza de costado, no la página. La región tiene `aria-label` y `tabindex="0"` (flechas del teclado) y un indicador "2 de 5" (`aria-live="polite"`) que sigue al scroll. Desde 700 px, grilla de 2 columnas y desde 1060 px de 3. Cada card (`TarjetaServicio.tsx`, `servicios.css`) lleva sello (solo el destacado), nombre en Barlow, resumen, chapa de datos (precio y duración, siempre en el mismo lugar), las 3 primeras cosas de "Incluye" con rombos, "Ver qué incluye" y el botón de reservar. Plegada, en el celular apunta a ~380 px de alto.
- "Ver qué incluye" es un botón real con `aria-expanded` y `aria-controls`. Lo que despliega (descripción completa, "Incluye" completo y "En palabras simples") no se desmonta: la grilla va de `0fr` a `1fr` en 280 ms (`--t-media`, `--ease-salida`) y plegado queda `inert` y `visibility: hidden`. Al abrir, las 3 cosas de la vista previa se pliegan para no repetirse. Con una card abierta las demás no se estiran (`:has`).
- La destacada usa `--destacada-fondo` y `--destacada-borde`, un filete rojo sobre el borde superior, `--sombra-2`, el sello "Recomendado por el taller" y el botón primario; desde 1060 px se eleva 12 px (`translate`, independiente del transform del revelado).
- Debajo de los botones, el enlace "Ver el servicio completo" lleva a su página (`/servicios/:id`).
- Precio cargando: brillo de `--esqueleto` en el mismo lugar. Catálogo vacío: `SinTurnosOnline`. Respaldo: "Consultá".

### Revelado al hacer scroll
- `useRevelar.ts` + `revelar.css`. Solo se anima lo que está fuera de pantalla al montar (`data-revelar="pendiente"` y luego `"visto"`, una sola vez, con `IntersectionObserver`); lo demás nunca se oculta. Sin `IntersectionObserver` o sin JS no queda nada oculto. Todo dentro de `prefers-reduced-motion: no-preference`. Anima solo `transform` y `opacity`; el filete se dibuja con `stroke-dashoffset`, como el resto del filete de la marca.
- Tiempos (`--ease-salida`, salvo el filete): el encabezado de sección sube 20 px en 640 ms y su filete se dibuja en 800 ms (`--ease-pincel`, 220 ms de demora); la card sube 28 px en 700 ms con 90 ms de paso por columna (`--i`); las secciones que acompañan (pasos, beneficios, trabajos, preguntas, contacto) usan `revelar--sutil`: 12 px en 520 ms. El hero no se anima.
- Dónde: `CabeceraSeccion.tsx` (todos los encabezados), `.revelar` en cada ítem, `.revelar-hijo` y `.revelar-marca` para lo que escalona dentro de un contenedor revelado. En el celular la lista del carrusel sube como un bloque (solo en vertical, así ninguna card queda oculta a la derecha); desde 700 px entra cada card sola.

### Cabecera y scrollspy
- La barra fija marca la sección que se está viendo (`useSeccionActiva.ts` + `lib/seccionActiva.ts`): un `IntersectionObserver` vigila una franja de 1 px pegada debajo de la cabecera (la "línea de lectura") y gana la sección que la ocupa; en el hero y entre secciones del menú no hay ninguna. En el escritorio el enlace activo lleva `aria-current="location"`, texto pleno y el filete rojo subrayado (el mismo que aparece al pasar el mouse); en el menú del celular, el filete a la izquierda y el color de acento (`--acento-texto`). Al tocar un enlace se marca enseguida y el observador espera a que termine el scroll (`scrollend`, tope de 1,2 s). Seis secciones: Servicios, Cómo trabajamos, Trabajos, Preguntas, Dónde estamos y Contacto; la barra completa entra desde 1100 px.
- En las páginas de servicio los enlaces llevan a `/#sección` y no hay ninguno marcado.

### Dónde estamos
- `DondeEstamos.tsx` + `donde.css`, sección `#donde` entre la reserva y el contacto. Celular: título, ciudad en Kaushan, estado, dirección, horarios y el mapa abajo. Desde 900 px: dos columnas (5fr texto, 7fr mapa) del mismo alto.
- **Estado** ("Abierto ahora · hasta las 13 h" / "Cerrado ahora · abrimos hoy a las 18 h"): una píldora con borde y punto; el color suma (`--exito` en abierto, `--texto-3` en cerrado) pero lo que informa es el texto. Se calcula en hora de La Rioja (`lib/horarioTaller.ts`) con `sitio.horariosSemana`, se refresca cada minuto y no se muestra si ese dato falta.
- **Mapa:** una tarjeta con el marco de filete y "Ver el mapa acá"; recién al tocar se crea el `iframe` (`loading="lazy"`, `title`, `referrerpolicy`): no se le manda nada a Google antes. Sin `mapaEmbedUrl`, la tarjeta muestra la dirección y "Cómo llegar". Contacto ya no repite dirección ni horarios.

### Botón flotante de WhatsApp
- `BotonWhatsapp.tsx`: fijo abajo a la derecha (`env(safe-area-inset-*)`), 56 px, con el estilo del botón primario (rojo, filete de la marca; no el verde de WhatsApp, que rompería la paleta). Desde 900 px suma el texto "Escribinos". Aparece pasados 320 px de scroll y se oculta mientras se ve el formulario de reserva, para no tapar "Enviar". Fuera de pantalla queda `visibility: hidden` (sin foco). Está en la landing, en `/turno/:id` y en las páginas de servicio; el mensaje nombra el servicio en estas últimas. No existe en `/admin`.

### Página de un servicio
- `/servicios/:id` (`PaginaServicio.tsx`, `paginaServicio.css`, carga diferida): migas, título en Barlow con el filete, resumen, chapa de precio y duración (la misma de las cards), "Reservá este servicio" y "Consultar por WhatsApp", "De qué se trata", "Qué incluye", "En palabras simples", preguntas del servicio (`servicioId` en `preguntas.ts`), fotos del servicio y "Otros servicios". Desde 900 px, "Qué incluye" y el glosario van en dos columnas. Solo con datos del catálogo; los bloques sin datos no se emiten. Un id inexistente o inactivo muestra "No encontramos ese servicio" con los que sí hay y `noindex`.
- Enlace profundo: `/?servicio=<id>#reservar` abre la landing en el formulario con el servicio elegido (`useIrAlHash.ts`).
- SEO: `lib/seoServicio.ts` arma título, descripción, Open Graph, canonical (solo con `sitio.url`) y JSON-LD `Service` + `BreadcrumbList`; `useSeo.ts` lo aplica al `head` y lo restaura al salir.

### Galería de trabajos
- `Galeria.tsx`: fotos con `<picture>` (WebP de 480, 800 y 1080 px y JPG de respaldo, `npm run fotos`), `width` y `height` para reservar el lugar. Cada foto conserva su formato: las verticales en 4:5 y las horizontales en 4:3; la grilla es de 2 columnas en el celular, 3 desde 700 px y 4 desde 1060 px, y la fila incompleta queda centrada (3 fotos verticales se ven parejas en cualquier ancho). El visor las muestra enteras (`object-fit: contain`, alto máximo de la pantalla).

### Efectos sutiles
- `efectos.css`; solo `transform` y `opacity`, todo bajo `prefers-reduced-motion: no-preference` y los de puntero además con `(hover: hover) and (pointer: fine)`. Sin librerías ni parallax.
  1. **Cabecera:** al pasar 8 px de scroll gana sombra (`--sombra-1`, opacidad, 240 ms) y el logo se achica a 0,88 (240 ms, `--ease-salida`).
  2. **Cards:** se elevan 4 px (la destacada 6) en 260 ms con la sombra `--sombra-2` que aparece; el filete rojo crece de izquierda a derecha en 360 ms (`--ease-pincel`) y el de la destacada se engrosa de 3 a 5 px.
  3. **Botones rojos:** se corren hasta 4 px hacia el mouse (`useMagnetico.ts`, 160 ms); no en táctil ni con teclado.
  4. **Fotos:** aparecen con un fundido de 500 ms al terminar de cargar; el lugar está reservado, así que nada salta.
  5. **"Abierto ahora":** un aro que late (escala de 1 a 2,8 y opacidad de 0,55 a 0, 2,4 s en bucle).
  6. **WhatsApp:** entra subiendo 12 px con un fundido de 320 ms.

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

### Cobro y trabajador
- Dentro de la misma tarjeta, como Elegir fecha (`admin/cobro/`): fondo `--fondo-hundido`, título en display, campos de 48 px de alto con ancho máximo de 17 rem. El monto es de texto con teclado numérico; el "Desde" del servicio es un botón fantasma debajo, nunca un valor puesto a la fuerza.
- Resumen en el turno completado: recuadro liso con "Cobro" + línea ("Cobrado $ 60.000 · Lucas"). Si falta el monto: borde punteado y fondo ámbar `#fff4e0` con ícono de alerta y texto "Sin cobro cargado" (el mismo ámbar de "Sin terminar"); la fila plegada lleva la señal "Sin cobro". En Hoy, el aviso ámbar suma el botón "Cargar cobros".

### Permisos por rol
- Sí / No / Parcial son píldoras con ícono y palabra: Sí sólida y verde, No gris apagada, Parcial con borde punteado ámbar; el matiz de lo parcial va en texto debajo. Nada depende del color.
- Desde 720 px, tabla con una columna por rol (encabezado fijo, filas de grupo en mayúsculas chicas); en el celular, una tarjeta por rol con sus capacidades agrupadas, sin scroll horizontal. "Podés / No podés" y "Va a poder / No va a poder" son listas con ✓ y ✗.
- El rol del encabezado es un botón (alcance táctil de 44 px) que abre el `<dialog>` "Tu rol".

### Aviso (toast)
- Grafito del riel (#1f2327, borde #3f454c) con texto blanco, ícono de tilde en `--exito` o de alerta en `--error` y un cerrar de 44 px. Va fuera de `.panel`, con los tokens oscuros.
- El éxito se cierra solo a los 4 s (se pausa con el mouse o el foco encima); el **error queda hasta cerrarlo**. Máximo 3: al pasar se descarta el éxito más viejo. El mismo texto repetido no se apila.
- Dos regiones siempre presentes: `role="status"` (éxitos) y `role="alert"` (errores).
- Celular: ancho completo, **arriba de la barra fija** `.varios-barra` (el proveedor mide su alto y lo publica en `--toasts-barra`) y del área segura (`env(safe-area-inset-bottom)`). Desde 640 px, abajo a la derecha. Entra con un desplazamiento corto solo sin `prefers-reduced-motion`.
- Reemplazan los mensajes de éxito fijos de Servicios, Disponibilidad, Usuarios, Turnos y Agenda. Los errores por campo siguen en el campo.

### Esqueleto de carga
- Barras y bloques de gris suave (`--borde-suave` con brillo `--fondo-hundido`) dentro de **los mismos contenedores y con las mismas alturas mínimas** que el contenido real: Servicios, Usuarios, Agenda (tira de siete días y día en el celular, grilla 7 × 2 desde 900 px), Disponibilidad (mes de seis semanas y panel del día) y Hoy. Al llegar los datos no hay saltos.
- Decorativos (`aria-hidden`); el "Cargando…" lo anuncia la región en vivo de cada vista. El brillo corre solo sin `prefers-reduced-motion`; con reducción queda quieto.

### Gráficos de Estadísticas
Contrato: `reportes/2026-10-26_15_estadisticas-y-permisos.md`. SVG propio en `src/admin/estadisticas/graficos/`, sin librería; estilos en `estadisticas.css` (se descarga con la sección), solo variables del panel claro.
- **Forma:** tiempo = columnas con ceros; rankings = barras horizontales (el nombre arriba de la barra para que no se corte); parte de un todo = una barra apilada; día × franja = mapa de calor. Una sola serie por gráfico, sin ejes dobles.
- **Paleta:** énfasis, no categorías. La marca de datos va en tinta grafito (`--texto-3`) y en rojo del panel (`--acento`) solo lo mejor del período (columna más alta, primer puesto), con una frase que lo dice. La marca elegida va en `--texto`. Fondos de barra: `--borde` y `--fondo-hundido`. Grilla y eje: hairlines `--borde-suave` y `--borde`. El texto de ejes, valores y leyendas usa tokens de texto, nunca el color del dato.
- **Estados** (barra apilada): los tonos de los sellos (#8a5200, #1d6b40, #3f464e, #a3221b; más de 6:1 contra blanco) más una trama propia (rayas, puntos, liso, rayas al revés), 2 px de hueco entre segmentos y una leyenda con cantidad y porcentaje: no dependen del color.
- **Mapa de calor:** un solo tono (el rojo del panel) en 5 niveles discretos (0, 14, 32, 52 y 88 % sobre blanco), con el número escrito en cada casillero: tinta hasta el nivel 3 (6,7:1 o más) y blanco en el 4 (5,1:1).
- **Marcas:** columnas de hasta 24 px con 4 px redondeados en la punta y base recta; barras horizontales con el origen recto; sin bordes, solo huecos.
- **Dato sin mouse:** el SVG se dibuja con el ancho real del contenedor (el texto mide 12-13 px siempre). Tocar o pasar el mouse por una marca, o usar las flechas con el gráfico enfocado, escribe el dato en una línea fija debajo (`aria-live`): no hay tooltip que se corte en el celular. Los rankings ya traen todo escrito.
- **Accesibles:** cada gráfico es un `role="img"` con nombre y descripción, y trae "Ver los números" (tabla real en `<details>`). El movimiento corre solo con `prefers-reduced-motion: no-preference`; con `forced-colors` las columnas toman `CanvasText`.
- **Cambio de período:** el contenido queda atenuado (55 %) mientras llega lo nuevo, sin saltar a un esqueleto.

### Navegación del panel y Finanzas
- **Navegación:** tres grupos en el riel (Operación, Negocio, Ajustes). El grupo abierto se une a su fila de secciones como una solapa (fondo `--grafito-800`); la sección actual lleva el filete rojo y el grupo que la contiene, un rombo rojo. Desde 1240 px, una sola fila con divisores entre grupos.
- **Finanzas:** tarjetas planas; la ganancia neta va al frente en display y en `#a3221b` con signo menos si es negativa. Metas: barra de 14 px (tinta `--texto-3`, verde de sello al cumplirse) con porcentaje y lectura escritos; estado como sello con ícono y palabras.
- **Ingresos vs. gastos:** dos columnas finas por día o mes; ingresos en tinta lisa, gastos en rojo del panel con rayas y leyenda siempre visible. La paleta no pasa CVD solo por color (protan ΔE 6,6): la diferencia la cargan la trama, la leyenda y el dato escrito.

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

## Panel: inventario, presupuestos y comprobantes

Componentes nuevos, solo con variables del panel. **Barra de stock** (`.inv-barra`): el relleno mide el stock y la marca vertical el mínimo; el aviso es la etiqueta de texto (Stock bajo en acento sobre `--acento-fondo`, Sin stock sólida en `--error`). **Tarjeta de presupuesto** (`.pres`): reusa `.turno` y los sellos de estado de los turnos (borrador gris, enviado ámbar, aceptado verde, rechazado rojo) más el sello «Vencido». **Total en vivo** (`.pres-barra`): fijo abajo del diálogo, junto a Guardar. **Botones de PDF** (`.pdf`): Descargar y Compartir. **Comprobante** (`.comp`): panel con el recuadro de cobro y formas de pago como radios en recuadros.
