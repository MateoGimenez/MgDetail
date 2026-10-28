# Revisión: galería de trabajos y perfil del panel (2026-10-28)

Pedido del dueño: "no se ven las imágenes en notebook y en el panel admin la parte del perfil no se ve bien".
Lo trabajan juntos `mg-pruebas` (reproduce, mide y deja tests) y `mg-frontend` (corrige el diseño).
Los dos anotan acá lo que encuentran y lo que cambian, en la sección de cada uno.

## Problema 1: las fotos de "Trabajos reales" no se ven en notebook

- Componentes: `frontend/src/landing/Galeria.tsx`, `landing.css`, `efectos.css` (revelado al scroll), `src/lib/fotos.ts`,
  `src/data/galeria.ts`. Fotos en `frontend/public/trabajos/` (WebP 480/800/1080 + JPG 800; están versionadas).
- Pista ya medida: en una captura a 1280×800 en tema claro, solo 3 de las 4 `<img>` de `#trabajos` habían cargado
  (`loading="lazy"`, `sizes="(min-width: 900px) 300px, 72vw"`). En oscuro cargaron 4. A 390 px cargaron 2 (las otras
  quedan fuera de la tira y es esperable).
- Revisar en anchos de notebook: **1280×720, 1366×768, 1440×900, 1536×864** (también con zoom de Windows 125%:
  deviceScaleFactor 1.25), en tema oscuro y claro, y entrando directo con `/#trabajos`.
- Sospechas a descartar: el revelado al scroll deja opacidad 0 si el IntersectionObserver no dispara; lazy loading
  dentro de un contenedor con scroll horizontal; la regla de "hasta 4 fotos en fila" vs la tira deslizable entre
  breakpoints; `sizes`/`srcset` eligiendo un archivo que no existe; alturas en 0 por el aspect-ratio.

## Problema 2: el perfil del panel se ve mal

- Componentes: `frontend/src/admin/navegacion/Hoja.tsx`, `PerfilPanel.tsx`, `FilaPerfil.tsx`, `navegacion.css`,
  `src/admin/Panel.tsx`, `permisos/BotonTuRol.tsx`, `src/pwa/AjustesApp.tsx`.
- Ya medido en capturas:
  - **Celular (390 px):** la hoja se desborda a la derecha: los chevrones ">" de "Tu rol" y "Ajustes de la app" y el
    borde del botón "Salir" quedan cortados contra el borde.
  - **Escritorio (1280 px):** el popover cuelga pegado al borde derecho: la "X" de cerrar y el botón "Salir" quedan
    cortados; no se alinea con el avatar.
- Además revisar: 820 px (tablet), 1366 px, diálogos "Tu rol" y "Ajustes" abiertos encima de la hoja, foco y Escape,
  empleado vs superadmin, nombres y emails largos.

## Cómo verificar visualmente

Se permite levantar un demo **temporal** solo para capturas, y apagarlo al terminar (matar solo esos procesos):
- Backend de demo sobre PGlite (no toca Supabase): un script `.mts` corrido con `npx tsx` desde `backend/`, que use
  `createTestContext` y `addUser` de `backend/test/helpers.ts` (usuarios: superadmin y empleado con clave
  `clave-de-prueba-123`), cargue algunos turnos e insumos, y haga `ctx.app.listen(4100, '127.0.0.1')`.
- Frontend: `npx vite` desde `frontend/` en el puerto 5174 con proxy `/api` → `http://127.0.0.1:4100`
  (config propia fuera del repo, que importe `frontend/vite.config.ts`).
- Capturas con `playwright-core` y Edge (`chromium.launch({ channel: 'msedge', headless: true })`), instalado en una
  carpeta temporal fuera del repo (por ejemplo `%TEMP%\mg-capturas`).
- Ninguno de esos archivos va al repo. Las capturas se guardan en esa carpeta temporal.

## Hallazgos de mg-pruebas

Medido con Edge headless sobre el demo (PGlite + Vite), comparando **HEAD** (copia de `git archive HEAD`, servida
aparte) con el **árbol de trabajo** (cambios de mg-frontend). Superadmin con nombre y email largos
(`Mateo Gimenez Fernández de la Rioja`, `dueno.con.un.email.bastante.largo@mgdetailing-taller.test`) y empleado común.

**Problema 1: fotos de "Trabajos reales" en notebook**
- Descartado (HEAD, 1280×720, 1366×768, 1440×900, 1536×864 y 1280×800, deviceScaleFactor 1 y 1,25, oscuro y claro,
  entrando por `/` scrolleando y por `/#trabajos`): en los 40 casos las 3 `<img>` de la galería terminan
  `complete`, `naturalWidth` > 0, opacidad 1 del `<img>` y del contenedor (`data-revelar="visto"`), caja 384×480 o
  389×487 y `currentSrc` existente. Sin scrollear están en opacidad 0 (`data-revelar="pendiente"` y
  `data-carga="pendiente"`), que es lo esperado. Con red y CPU lentas (1,6 Mb/s, 150 ms, CPU ×4) se ven del todo a
  los 0,2-1,1 s de llegar, por menú, por hash y recargando a mitad de página. El revelado y el lazy loading no dejan
  nada oculto; `srcset` no pide archivos inexistentes; el aspect-ratio no da alturas 0.
- La "4ª `<img>`" de la pista no es de la galería: es la del visor (`Galeria.tsx:112`), dentro de un `<dialog>`
  cerrado (display none) y `loading="lazy"`, así que no baja hasta abrir el visor. Que en un tema figure cargada y en
  otro no es ruido del momento de la medición, no un error.
- **Causa real (lo que ve el dueño):** en HEAD, desde 900 px la grilla reparte todo el contenedor entre las fotos
  (`landing.css:792-797`, `grid-template-columns: repeat(var(--n), minmax(0, 1fr))`, con `--n` = 3) y cada tarjeta
  es 4:5 (`landing.css:820-823`), o sea 384-389 × 480-487 px (+28 px del escalonado, `landing.css:803-805`). Debajo
  del título y la bajada, la fila arranca a 376-434 px del borde de arriba. Al entrar por el menú o por
  `/#trabajos` se ve solo una parte de cada foto y ningún rótulo: 1093×614 (1366×768 al 125 %) 52-59 %;
  1229×691 58-64 %; 1280×720 60-65 %; 1366×768 66-72 %; 1536×864 @1,25 85-91 %; recién a 1440×900 entra casi entera.
- **Causa secundaria (nitidez):** `Galeria.tsx:84` prometía `sizes="(min-width: 900px) 300px, 72vw"` con tarjetas de
  322-389 px: el navegador bajaba siempre el WebP de 480w, también a 1280×720 @1,5 (hacían falta 576 px) y a
  1536×864 @1,25 (487 px). La foto se veía estirada.
- Verificación del árbol de trabajo (`node capturas.mjs vista`): fila entera visible (100 % de cada foto, con rótulo)
  en 1093×614 @1,25, 1229×691 @1,25, 1280×720 @1,5, 1366×768, 1440×900 y 1536×864 @1,25; tarjetas de 220-267 px;
  a 1280×720 @1,5 y 1536×864 @1,25 ya baja el de 800w.

**Problema 2: hoja de perfil del panel**
- **Causa:** `navegacion.css:92-96` (HEAD): `.hoja__interior` es `display: grid` sin columnas declaradas; la
  columna implícita es `auto` y crece hasta el min-content de su hijo más ancho. Ese hijo es la cabecera, porque
  `PerfilPanel.tsx:128-131` pone "Rol · email" en una sola línea y `navegacion.css:201-218` le da
  `white-space: nowrap` al nombre y a ese renglón (el `text-overflow: ellipsis` nunca actúa: el ancho lo absorbe la
  grilla, no el renglón). Medido: empleado `Empleado · empleado@mgdetailing.test` = 269 px → cabecera de 389 px en una
  hoja de 356 px útiles (`scrollWidth` 405 vs `clientWidth` 388 a 390 px; 405/378 desde 820 px): X, ">" y Salir
  quedan 17-33 px fuera. Superadmin con nombre y email largos: columna de 604 px (`scrollWidth` 620).
- **Agravante:** `navegacion.css:78` `overflow-y: auto` hace que el `<dialog>` también se desplace de costado, y
  `showModal()` enfoca el primer botón (la X, a la derecha): con el superadmin la hoja aparece ya corrida 215 px y se
  ven "…ández de la Rioja", "…hacer", "…nuevos" (captura `perfil_superadmin_1280_hoja_HEAD.png`).
- Alineación con el avatar: en headless (sin barra de scroll clásica) el borde derecho de la hoja coincidía con el
  del avatar en HEAD (1190/1190 a 1280, 1233/1233 a 1366); el `100vw` de `navegacion.css:293` sí la corre media
  barra de scroll en un Windows real. Ya no se usa en el árbol de trabajo.
- **Bug de lógica:** `Hoja.tsx:39` (HEAD) `onClose={alCerrar}`: el `close` de "Tu rol" y "Ajustes" (en portal) sube
  por el árbol de React hasta la hoja. Medido: cerrar "Tu rol" o "Ajustes" con su botón cerraba también la hoja
  (`hojaSigueAbiertaAlCerrarlo: false` en los 16 casos de HEAD). mg-frontend ya lo corrigió (`true` en los 16).
- Diálogos encima: en HEAD y en el árbol de trabajo "Tu rol" y "Ajustes" quedan arriba de la hoja (el punto central
  de la hoja lo tapa el diálogo nuevo), ninguno sale del viewport a 390, 820, 1280 ni 1366; Escape cierra solo el de
  arriba y, al cerrar la hoja, el foco vuelve al avatar.
- Árbol de trabajo: `scrollWidth === clientWidth` y 0 elementos fuera de la hoja en los 8 casos (2 roles × 4 anchos);
  borde derecho de la hoja = borde derecho del avatar.

**Tests que dejé** (fallan en HEAD por la causa; pasan con los cambios de mg-frontend):
- `frontend/src/landing/galeria-tamanos.test.ts`: el `sizes` de las tarjetas no promete menos que el tope del ancho
  real de la tarjeta (su parte del contenedor y el tope en px de `--foto-max`) de 900 a 1920 px. En HEAD: "la
  tarjeta puede medir 389 px y sizes dice 300 px".
- `frontend/src/admin/navegacion/hoja-perfil.test.ts`: `.hoja__interior` declara `minmax(0, 1fr)` y el `onClose`
  de `Hoja.tsx` filtra `target === currentTarget`.
- Ojo: en vitest los `import x from './algo.css?raw'` llegan **vacíos**; por eso estos tests leen el disco con
  `node:fs` (import dinámico, sin sumar los tipos de Node al código de `src`).

**Dudoso / para mg-frontend (no lo toqué):**
- `useIrAlHash.ts:18-25`: la limpieza cancela solo el primer `requestAnimationFrame`, no el anidado. Inofensivo hoy.
- Visor: su `<img>` es `loading="lazy"` dentro del `<dialog>` cerrado: al abrirlo hay un instante sin foto (fundido
  desde transparente). Se podría precargar al tocar la tarjeta.

**Guion de capturas (reutilizable, fuera del repo):** `%TEMP%\mg-capturas\`
(`C:\Users\matex\AppData\Local\Temp\mg-capturas`).
- Archivos: `demo-backend.mts` (PGlite en 4100, superadmin y empleado de arriba, clave `clave-de-prueba-123`, 5
  turnos), `vite.demo.config.mts` (Vite del repo en 5174 con `/api` → 4100), `capturas.mjs` (Edge headless con
  `playwright-core`, ya instalado ahí), `sonda-min-content.mjs` (qué hijo fija el ancho de la hoja).
- Levantar (dos procesos en segundo plano, Git Bash):
  `cd backend && npx tsx "$TEMP/mg-capturas/demo-backend.mts"` y
  `cd frontend && npx vite --config "$TEMP/mg-capturas/vite.demo.config.mts"`.
- Correr, desde `%TEMP%\mg-capturas`: `node capturas.mjs galeria | perfil | vista | tiempos` (sin argumento: galería
  y perfil). Variables: `DEMO_URL` (otro puerto) y `SALIDA` (carpeta; por defecto `salida`). Deja PNG y JSON
  (`galeria.json`, `perfil.json`, `tiempos.json`) y un resumen por consola por caso.
- Apagar: matar solo esos dos procesos (node de `demo-backend.mts` y el de vite en 5174).
- Capturas de esta revisión: `salida\` (galería y vista de HEAD; perfil de HEAD con sufijo `_HEAD`) y
  `salida-actual\` (árbol de trabajo).

**Verificación final de mg-pruebas sobre el árbol de trabajo:** `node capturas.mjs galeria`: 40/40 casos de notebook
(5 tamaños × dsf 1 y 1,25 × oscuro/claro × `/` y `/#trabajos`) con las 3 fotos cargadas, opacidad 1 y 264-267 ×
330-334 px; con dsf 1,25 desde 1366 baja el WebP de 800w. `perfil`: 8/8 sin desborde. `tsc -b` OK, `eslint .` OK,
`vitest run` 50 archivos / 514 tests OK, `vite build` OK (a una carpeta temporal).

## Cambios de mg-frontend

Skills: `find-skills` (buscó "frontend-design": no está instalada; existe en el ecosistema, por ejemplo
`anthropics/skills@frontend-design`, pero no se instaló nada sin permiso del dueño) e `impeccable` (contexto, audit y
polish de las dos superficies). Demo propio en los puertos 4101 y 5175 (PGlite + Vite) y capturas con Edge headless en
`%TEMP%\mg-front-demo\antes` y `%TEMP%\mg-front-demo\despues`.

**Problema 1 (fotos en notebook).** En headless las 3 fotos cargan siempre (la 4ª `<img>` es la del visor cerrado,
que es lazy y no baja hasta abrirlo: esperable). Lo que no se veía era *dónde caían*: en la pantalla real de una
notebook (1366×768 menos la barra del navegador, o 1920×1080 al 125-150 %), al entrar por el menú o por `/#trabajos`
se veía el título con su aire y solo el borde de arriba de las fotos (tarjetas de 384-389 × 480-487 px), sin rótulos.
Además, mientras bajaban, el hueco era `--superficie`: en oscuro casi igual al fondo y en claro blanco sobre blanco.
Y `sizes` prometía 300 px con tarjetas de ~389 px (bajaba el WebP de 480 en zoom 125 %).
- `landing/Trabajos.tsx` + `lib/fotos.ts` (`trabajosAlLado`, con test): con hasta 3 fotos y sin antes/después, el
  contenedor lleva `trabajos__grilla`.
- `landing/landing.css`: desde 1024 px, `trabajos__grilla` pone el título a la izquierda (3fr) y las fotos al lado
  (8fr), como Cómo trabajamos y Preguntas. En la fila (≥ 900 px) cada columna es `minmax(0, var(--foto-max))` con
  `--foto-max: max(220px, min(400px, (100svh − cabecera − 140px) × 4/5))`: nunca más alta que la pantalla. El marco
  de la foto ahora es `--superficie-2` con filo `--borde-suave` (se ve en los dos temas aunque la foto tarde).
- `landing/Galeria.tsx`: `sizes="(min-width: 900px) min(30vw, 400px), 72vw"` (a 1536×864 @1,25 baja el de 800).
- Verificado (oscuro y claro, entrando por menú y por hash): 390, 820, 1093×614 @1,25, 1280×720, 1280×800, 1366×768,
  1440×900 y 1536×864 @1,25. En notebooks la fila entera, con rótulos y el escalonado, entra en la primera pantalla.

**Problema 2 (perfil).** Causa: `.hoja__interior` era una grilla con la columna implícita en `auto`; el renglón
"Rol · email" con `white-space: nowrap` le fijaba un ancho mínimo, la columna crecía más que la hoja (medido:
`scrollWidth` 396 en una hoja de 388 px con el superadmin, 627 con un email largo) y el diálogo, con `overflow: auto`,
recortaba a la derecha chevrones, X y Salir. En escritorio era lo mismo dentro del popover de 380 px.
Además: cerrar "Tu rol" o "Ajustes" cerraba también la hoja (su `close`, en portal, sube por el árbol de React).
- `admin/navegacion.css`: `grid-template-columns: minmax(0, 1fr)` en `.hoja__interior` y `overflow-x: hidden` de
  resguardo; cabecera con nombre hasta 2 líneas (`line-clamp`), rol en una línea y email en otra con "…"; X con
  alineación óptica. Desde 640 px el popover mide `min(360px, 100% − 2 × margen)`, cuelga a 66 px y su borde derecho
  coincide con el del botón del avatar (`(100% − min(100% − 2 × margen, 1100px)) / 2`, medido contra la ventana);
  entra bajando 6 px con fundido (180 ms, solo con movimiento permitido).
- `admin/navegacion/PerfilPanel.tsx`: el email va en su propio `<p class="perfil__email">`.
- `admin/navegacion/Hoja.tsx`: `onClose` solo cierra si el evento es de la hoja misma.
- Verificado con superadmin y con un empleado de nombre y email larguísimos: 390, 820, 1280, 1366 y 1440
  (`scrollWidth === clientWidth` en todos; borde derecho del popover = borde derecho del avatar), más "Tu rol" y
  "Ajustes" abiertos encima (390 y 1280) y Escape en "Tu rol" deja la hoja abierta.
- `DESIGN.md` y `README.md` actualizados.

## Estado

- [x] Problema 1 reproducido y con causa (mg-frontend y mg-pruebas: la fila de fotos caía bajo el pliegue en notebooks
  y `sizes` prometía 300 px; ver Hallazgos y Cambios)
- [x] Problema 1 corregido y verificado con capturas en los 4 anchos de notebook
- [x] Problema 2 corregido y verificado con capturas (390, 820, 1280, 1366)
- [x] tsc, eslint, vitest (514) y vite build OK (mg-frontend, 2026-10-28; repetido por mg-pruebas con sus 2 tests nuevos)
