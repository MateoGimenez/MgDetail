# Objetivo 9: landing: botón de WhatsApp, dónde estamos, página por servicio, scrollspy y fotos

## Pedido del dueño (textual)

"Sacar completamente la parte de ¿cuál te conviene? (el componente o la sección entera): no me gusta cómo queda, hace muy larga la página. Después agregar el botón flotante con el WhatsApp (3804781737), mapa y horarios, una página por servicio, efectos sutiles, y un observer para que al ir scrolleando se vaya pintando el nav de navegación según la sección. En el front, ajustar las imágenes que subí como ejemplo."

Este documento es **el contrato** entre los agentes. Si algo hay que cambiarlo, se cambia acá primero.

## Estado de partida (ya cargado por el dueño en `frontend/src/config/sitio.ts`)

- `whatsapp: '3804781737'` → **está mal para la web**: el formato que usa el sitio es internacional, solo dígitos: **`5493804781737`** (54 + 9 + 380 + 4781737). Corregirlo.
- `direccion: 'Calle Olta Pasaje N2 , La Rioja'` (normalizá solo los espacios: "Calle Olta Pasaje N2, La Rioja"; no cambies el sentido).
- `horarios: ['Lunes a viernes, de 8 a 13 h , 18 a 22h', 'Sábados, de 9 a 21 h']` (normalizá espacios y el formato "18 a 22 h"). Domingos: sin atención (no figuran).
- `mapsUrl: 'https://maps.app.goo.gl/Kx6QbmpbXiunjVgB7'`. `instagram` y `url` siguen vacíos (siguen ocultándose lo que está vacío).
- Fotos subidas como ejemplo, **sin integrar**: `frontend/public/trabajos/trabajoDespues.jpg` y `trabajoDespues2.jpg` (una Honda NX negra, dos ángulos, "después") y `frontend/public/fotos/mgdetailing_corsa_frente.jpg` (un Chevrolet Corsa plateado, de frente). Las tres son verticales 4:5 (1080×1350), pesan entre 237 y 660 KB, tienen la marca de agua de MgDetailing y las patentes están borrosas.
- En `Trabajos.tsx` el dueño dejó dos `<img src="../public/trabajos/...">` dentro del estado vacío: **la ruta está rota** (en Vite se sirve como `/trabajos/...`) y además ese bloque solo se ve cuando no hay fotos.

## 1. Quitar "¿Cuál te conviene?" por completo

Se elimina todo lo de la comparativa: `src/landing/Comparativa.tsx`, `src/lib/comparativa.ts` y su test, sus estilos en `servicios.css` y `revelar.css`, la inclusión en `Servicios.tsx`/`Landing.tsx`, las menciones en `DESIGN.md` y `README.md`, y la línea de ayuda "Todo lo del <nombre>" que se agregó en `src/admin/DialogoServicio.tsx` (prop `ayudaExtra` incluida si queda sin uso). **No debe quedar código muerto ni referencias** (`grep -ri comparativa` sin resultados, salvo reportes históricos). Las cards de servicios y el carrusel del celular **se mantienen**; el sistema de revelado también.

## 2. Botón flotante de WhatsApp

- Botón fijo abajo a la derecha (respeta `env(safe-area-inset-bottom)`), con el ícono de WhatsApp reconocible; en pantalla ancha muestra también el texto "Escribinos". Aparece después de un pequeño scroll (no tapa la portada), con entrada suave.
- Abre `https://wa.me/5493804781737?text=…` con un mensaje prearmado en voseo ("Hola MgDetailing, quiero consultar por un turno."); **en la página de un servicio** el mensaje nombra ese servicio. Reusá/ampliá los helpers de `src/config/enlaces.ts`.
- Solo existe si `sitio.whatsapp` tiene valor. Nombre accesible, foco visible, `target=_blank` con `rel="noopener noreferrer"`. No tapa el botón de enviar del formulario de reserva ni la barra del menú móvil; con `prefers-reduced-motion`, sin animación.
- Visible también en `/turno/:id` y en las páginas de servicio. **No** en `/admin`.

## 3. "Dónde estamos": mapa y horarios

- Sección nueva `#donde` entre "Preguntas" y "Contacto", con título "Dónde estamos" y entrada en el nav ("Dónde estamos").
- Contenido: dirección, **horarios** (las líneas de `sitio.horarios`), un estado **"Abierto ahora" / "Cerrado ahora · abrimos …"** calculado en hora de La Rioja, y el botón **"Cómo llegar"** (`mapsUrl`). El estado sale de un dato estructurado nuevo en `sitio.ts`: `horariosSemana`, derivado de lo que escribió el dueño: lunes a viernes 08:00–13:00 y 18:00–22:00; sábado 09:00–21:00; domingo cerrado. Si `horariosSemana` falta, no se muestra el estado (solo las líneas de texto).
- **Mapa**: un `iframe` de Google Maps que se carga **al tocar** "Ver el mapa acá" (privacidad y velocidad; lazy), si `sitio.mapaEmbedUrl` tiene valor (nueva clave opcional en `sitio.ts` y `DatosSitio`, con un comentario de cómo obtenerla: Google Maps → Compartir → Insertar un mapa → copiar el `src`). Sin `mapaEmbedUrl`, la sección muestra una tarjeta de ubicación (dirección + "Cómo llegar") sin iframe. El iframe lleva `title`, `loading="lazy"`, `referrerpolicy="no-referrer-when-downgrade"`.
- Contacto no debe duplicar la dirección ni los horarios (si hoy los muestra, se mueven a esta sección). Sin dirección ni horarios ni `mapsUrl`, la sección entera no se emite.
- Backend (lo hace el agente de backend): la CSP permite `frame-src https://www.google.com/maps/`.

## 4. Una página por servicio

- Ruta `/servicios/:id` (carga diferida, como el panel), con el catálogo de `GET /api/servicios` (y el respaldo si la API falla). Un id inexistente o inactivo → página "No encontramos ese servicio" con enlaces a los que sí hay (y `noindex`).
- Contenido, **solo con datos reales del catálogo** (nada inventado): migas de pan, título con nombre y resumen, precio ("Desde $ X" o "Consultá") y duración, descripción completa, "Qué incluye" completo, "En palabras simples" (glosario), las preguntas frecuentes que tengan ese `servicioId` (si `preguntas.ts` no lo trae, sumá el campo opcional y asignalo donde corresponda; si ninguna aplica, se omite el bloque), las fotos de la galería de ese servicio (si hay), y "Otros servicios". CTAs: **Reservá este servicio** y **Consultar por WhatsApp** (con el mensaje que nombra el servicio).
- La reserva se puede abrir con un enlace profundo: **`/?servicio=<id>#reservar`** preselecciona el servicio en el formulario (sirve también para el link de Instagram). Las cards del carrusel/grilla suman "Ver el servicio completo" hacia su página; "Ver qué incluye" y "Reservá este servicio" siguen igual.
- **SEO**: `<title>` y meta description por página (el resumen), `og:title`/`og:description`/`og:url`, `canonical` solo si `sitio.url` tiene valor, JSON-LD `Service` (con `provider` = el negocio ya definido en `index.html`/`vite.config.ts`, `areaServed` La Rioja, y `offers` solo si hay precio) y `BreadcrumbList`. Se restauran los meta originales al salir de la página.
- Backend (agente de backend): `GET /sitemap.xml` dinámico (home + una URL por servicio activo, con `<lastmod>`), solo cuando `PUBLIC_URL` está configurada (sin ella, 404), y `robots.txt` con la línea `Sitemap:` cuando hay URL pública (manteniendo lo que ya dice). Con `serveFrontend`, `/servicios/*` cae al `index.html` de la SPA (verificar que ya ocurre).

## 5. Scrollspy del nav

- Un `IntersectionObserver` en `Cabecera.tsx` (hook propio, testeable) marca el enlace de la sección que se está viendo (`aria-current="location"` y estilo de activo con el filete de marca) en el nav de escritorio y en el menú móvil. Cuenta el alto de la cabecera fija (`rootMargin`); gana la sección que ocupa la franja superior del viewport; al llegar al tope (hero) no hay ninguna activa; al clickear un enlace se activa enseguida (sin parpadear mientras scrollea).
- Secciones: servicios, cómo trabajamos, trabajos, preguntas, **dónde estamos**, contacto. En las páginas de servicio los enlaces del nav llevan a `/#seccion` y no hay ninguna activa.
- Lógica pura (elegir la sección activa a partir de las posiciones) en `src/lib/` con tests.

## 6. Efectos sutiles

Elegí **4 a 6** y que sean coherentes con la marca; todo con `transform`/`opacity`, solo bajo `@media (prefers-reduced-motion: no-preference)`, y los de puntero solo con `(hover: hover) and (pointer: fine)`. Sin librerías. Sugerencias: la cabecera gana sombra y se compacta un poco al scrollear; las cards se elevan al pasar el mouse (el destacado un poco más) con el filete que se ilumina; botones principales con un leve desplazamiento magnético en escritorio; las fotos de trabajos aparecen con un fundido al cargar (sin saltos de layout, con `width/height`/`aspect-ratio`); un punto que late suave en "Abierto ahora"; entrada del botón de WhatsApp. **Sin parallax** ni efectos pesados. Los dos temas (oscuro y claro) deben verse bien; solo variables semánticas de color.

## 7. Fotos de ejemplo

- Optimizar con `sharp` (ya se usa en `scripts/optimizar-marca.mjs`): generar versiones **WebP** de 480, 800 y 1080 px de ancho (y un JPG de respaldo del tamaño medio) en `public/trabajos/` con nombres claros (ej.: `honda-nx-lateral`, `honda-nx-frente-tres-cuartos`, `corsa-frente`), un script `npm run fotos` que lo repite, y servirlas con `<picture>`/`srcset`/`sizes`. Los originales pesados **no se publican**: se mueven a `frontend/fotos-originales/` (fuera de `public/`, versionados) y el script los toma de ahí. No borres ninguna foto del dueño.
- Integrarlas en `src/data/galeria.ts` como `fotos` (rutas `/trabajos/...`, SIN `public`), con `alt` que describe **solo lo que se ve** (ej.: "Moto Honda NX negra vista de costado, recién lavada, en la calle frente al taller") y `titulo` neutros que **no inventen servicios** (ej.: "Honda NX", "Chevrolet Corsa"; las dos de la moto son "después" según el nombre del archivo, y la del Corsa no se sabe si es antes o después: no la etiquetes). `servicioId` solo si es seguro (si no, omitilo).
- La galería hoy es 4:3 horizontal: **adaptarla a fotos verticales 4:5** (grilla que se vea bien con 3 fotos verticales, y con más; visor ampliado sin recortar) sin romper las horizontales.
- Restaurar el estado vacío de `Trabajos.tsx` como estaba (los rótulos "Antes"/"Después") y sacar las `<img>` con ruta rota; ahora hay fotos, así que `hayFotos` es `true` y se ve la galería. Revisar el texto de la bajada de la sección para que no diga "Recién abrimos…" cuando hay fotos y no mienta ("Fotos de vehículos que pasaron por el taller.").
- Revisar que ningún otro lugar use esas fotos mal (el hero, Open Graph, etc.). No usar las fotos para el comparador antes/después (no son un par).

## Lo que necesita el dueño

- Pasar el `src` del mapa embebido (opcional) y, cuando haya dominio, la URL pública en `sitio.url` y `PUBLIC_URL` en el servidor (activa canonical, `og:url` y el sitemap).
- Más fotos: cada una se suma con una entrada en `galeria.ts` (el script las optimiza).

## Estado

- [x] Comparativa eliminada del todo.
- [x] Botón flotante de WhatsApp.
- [x] "Dónde estamos": horarios, estado "Abierto ahora", mapa al tocar.
- [x] Página por servicio con SEO y enlace profundo de reserva (frontend hecho). [x] Backend: `GET /sitemap.xml` dinámico (solo con `PUBLIC_URL`), `robots.txt` con `Sitemap:`, CSP `frame-src https://www.google.com/maps/` y `/servicios/<id>` hacia la SPA.
- [x] Scrollspy del nav.
- [x] Efectos sutiles.
- [x] Fotos optimizadas, galería vertical e integración.
- [x] Verificación: tipos, lint, tests y build en verde (iframe del mapa con `sandbox`, hash mal codificado sin romper la landing, JSON-LD con `<` escapado, `ErrorBoundary`). Pendiente: capturas en celular y pantalla ancha, en claro y oscuro (las hace el dueño).
