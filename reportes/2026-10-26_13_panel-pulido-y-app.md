# Objetivo 6: pulido del panel y panel como app instalable

Tres bloques que se arman en paralelo con archivos distintos:

- **A. Backend**: avisos push al celular cuando entra un turno nuevo.
- **B. Panel (UI)**: pantalla "Hoy", avisos que aparecen y se van solos, esqueletos de carga, borde de campos en modo oscuro, `DESIGN.md`.
- **C. App instalable (PWA)**: el panel se instala en el celular como app y recibe los avisos push.

Este documento es **el contrato** entre los tres. Si algo hay que cambiarlo, se cambia acá primero.

## Decisiones generales

- La app instalable es **solo el panel** (`/admin`). La web pública no se instala ni lleva manifest.
- **Nada de datos personales en el dispositivo ni en el service worker**: las respuestas de `/api` nunca se guardan en cache. El service worker no cachea JS ni CSS (los archivos con hash ya los cachea el navegador); solo maneja los avisos push y una página "Sin conexión".
- **Avisos push, qué dicen**: título "Turno nuevo", cuerpo `servicio · día corto · franja` (ej.: "Lavado Premium · jue 29/10 · Mañana"). **Nunca** nombre, teléfono, email, vehículo ni comentario. El cuerpo puede incluir `pendientes` (cantidad de pendientes, un número) para el globito del ícono.
- **Quién los recibe**: cada persona del panel (cualquier rol) decide en su dispositivo si activa los avisos. La suscripción queda atada a su usuario; si se desactiva el usuario, deja de recibirlos. Al **cerrar sesión**, ese dispositivo deja de recibir (se borra la suscripción).
- **Independiente de `WHATSAPP_PROVIDER`**: los avisos push van además de Telegram/CallMeBot/Cloud, no en lugar de.
- **Sin configurar = apagado sin errores**: si faltan las claves VAPID, el backend no manda push y el panel no ofrece el interruptor de avisos (sí el "Instalar app").
- iPhone: los avisos push solo funcionan con la app **instalada en la pantalla de inicio** (iOS 16.4 o más). La pantalla de ajustes lo explica.

## A. Backend: avisos push

### Base de datos

Migración nueva en `backend/supabase/migrations/` con `mgdetailing.push_suscripciones`:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `perfil_id` | uuid | FK a `perfiles(id)` `on delete cascade` |
| `endpoint` | text | único, `https`, ≤ 2048 |
| `p256dh` | text | clave pública del navegador (base64url) |
| `auth` | text | secreto de la suscripción (base64url) |
| `agente` | text null | navegador/dispositivo corto (≤ 120), solo para que el usuario reconozca el aparato |
| `created_at` | timestamptz | |
| `ultimo_aviso_at` | timestamptz null | |

RLS habilitado, sin policies para anon/authenticated, REVOKE explícito y GRANT mínimo a `mgdetailing_app` (select, insert, delete; update solo de `ultimo_aviso_at`), con sus policies, como en las migraciones anteriores. Índice por `perfil_id`. **No se aplica a Supabase remoto sin pasar las pruebas.**

### Variables de entorno (`backend/.env.example`, `config.ts`)

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` o `https:`). Las tres juntas o ninguna (si hay una sola, error de configuración claro). Script `npm run vapid` que **imprime** un par nuevo listo para pegar (no escribe archivos ni lo registra en logs). Librería: `web-push`.

### Endpoints (sesión; todos los roles)

- `GET /api/admin/push/estado` → `200 { "disponible": boolean, "clavePublica": string | null }`. `disponible` es `false` si no están las claves.
- `POST /api/admin/push/suscripciones` body `{ "endpoint", "keys": { "p256dh", "auth" }, "agente"? }` (la forma de `PushSubscription.toJSON()`) → `201 { "ok": true }`; si el endpoint ya existe y es de otro usuario, se reasigna a quien está logueado (mismo aparato, otra persona). Máximo 10 dispositivos por usuario (el más viejo se descarta). Con `disponible: false` → `404`.
- `DELETE /api/admin/push/suscripciones` body `{ "endpoint" }` → `204` (también si no existía).
- **Validación del endpoint**: `https`, y el host tiene que ser de un servicio de push conocido (lista permitida: `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`, `*.push.apple.com`). Cualquier otro host → `400` con `fields.endpoint`. Esto evita que el servidor haga pedidos a direcciones arbitrarias.

### Envío

- Al crear un turno público (después de guardarlo, junto al aviso actual): se manda un push a las suscripciones de usuarios **activos**. Fire-and-forget con tope de tiempo (5 s por envío, en paralelo): un fallo **nunca** afecta al cliente ni demora la respuesta del alta (si hace falta, que se dispare después de responder).
- Payload: `{ "titulo": "Turno nuevo", "cuerpo": "<servicio> · <día corto> · <franja>", "pendientes": N, "url": "/admin" }`.
- Respuestas `404`/`410` del servicio de push → se borra esa suscripción. Otros errores → solo se cuentan en el log (sin endpoint ni claves, solo cantidades).
- El honeypot no dispara avisos.

### Hosting del frontend (producción)

En `middleware/frontend.ts` y `middleware/security.ts`:

- `worker-src 'self'` y `manifest-src 'self'` en la CSP (revisar la actual).
- `/admin/sw.js`: `Cache-Control: no-cache` y `Content-Type: text/javascript`. `/admin/manifest.webmanifest`: `Content-Type: application/manifest+json`.
- Que el servicio de archivos estáticos sirva `public/admin/*` antes del fallback de la SPA.

## B. Panel (UI)

### Pantalla "Hoy"

- Primera sección del panel (antes de Turnos) y la que se abre por defecto. Link profundo: el panel acepta `?vista=hoy|turnos|agenda|disponibilidad|servicios|usuarios` al abrirse (solo la vista inicial; la usa la PWA en sus accesos directos).
- Contenido, con los endpoints que ya existen (sin cambios de backend): saludo con nombre y fecha de hoy; **pendientes** (cantidad grande que lleva a Turnos > Pendientes, y los 3 más viejos con acceso directo a su tarjeta); **turnos de hoy** agrupados Mañana/Tarde con cupos "1/2"; **mañana** (cuántos turnos y si está cerrado); aviso si **hoy está cerrado** o la franja llena; accesos a Agenda y Disponibilidad.
- Empleado: ve lo mismo sin botones de edición. Estados vacío ("Hoy no hay turnos"), carga (esqueleto), error con reintentar y sesión vencida como el resto.
- Celular primero; sin desbordes a 390 px.

### Avisos que aparecen y se van solos (toasts)

- Un proveedor global del panel (`role="status"`, `aria-live="polite"`) con avisos de éxito ("Guardado", "Turno confirmado") que desaparecen a los ~4 s y se pueden cerrar; los **errores** quedan hasta cerrarlos (`role="alert"`). Máximo 3 a la vez.
- En el celular se apilan **arriba de la barra fija** de "Elegir varios días" (no la tapan) y respetan el área segura de abajo.
- Reemplazan los mensajes de éxito fijos de Servicios, Disponibilidad, Usuarios, Turnos y Agenda. Los errores por campo siguen en el campo.
- Sin animación con `prefers-reduced-motion`.

### Esqueletos de carga

En Agenda (semana y día), Disponibilidad (calendario y detalle), Servicios, Usuarios y Hoy: bloques que ocupan el mismo lugar que el contenido (sin saltos al cargar). El brillo solo corre sin `prefers-reduced-motion`.

### Borde de los campos en modo oscuro

`--campo-borde` (`#3a4047` sobre `#0f1214`) da 1,79:1, por debajo del 3:1 de WCAG 1.4.11. Subirlo (y `--campo-borde-hover`) en el tema oscuro hasta cumplir 3:1 contra el fondo del campo y contra la superficie que lo rodea; revisar también los bordes de opciones/radios/casillas en oscuro. **Es lo único que cambia en el oscuro.** El claro no se toca.

### `DESIGN.md`

Documentar la paleta clara (variables semánticas, tabla de contrastes del README del frontend), el borde corregido en oscuro y los componentes nuevos (toast, esqueleto).

## C. App instalable (PWA) y avisos en el celular

- **Manifest** `public/admin/manifest.webmanifest`: nombre "MgDetailing · Panel", nombre corto "MG Panel", `display: standalone`, `start_url: /admin`, `scope: /admin`, `theme_color` y `background_color` `#14171a`, íconos 192, 512 y maskable 512, accesos directos "Hoy" y "Agenda" (`/admin?vista=hoy`, `/admin?vista=agenda`). El `<link rel="manifest">` **solo se agrega cuando se abre `/admin`** (no en la web pública).
- **Íconos** generados desde los archivos de marca con el script de marca existente (`scripts/optimizar-marca.mjs`), con margen seguro para el maskable.
- **Service worker** `public/admin/sw.js`, alcance `/admin/`: maneja `push` (muestra la notificación, `tag` por turno, sin sonido forzado), `notificationclick` (enfoca la ventana abierta o abre `/admin`), `fetch` solo para mostrar `public/admin/sin-conexion.html` cuando falla una navegación a `/admin*`. **Nada de `/api` en cache.** Actualización: `skipWaiting` + `clients.claim`.
- **Globito del ícono** (Badging API) con la cantidad de pendientes, donde el navegador lo permita: al llegar un push y al cargar el panel.
- **Ajustes de la app** (botón con campana/ícono en el encabezado del panel, en su propio componente `src/pwa/`): 
  - **Instalar la app**: botón cuando el navegador ofrece `beforeinstallprompt`; en iPhone/iPad, las instrucciones ("Compartir → Agregar a inicio"); oculto si ya está instalada.
  - **Avisarme de turnos nuevos**: interruptor que pide el permiso, se suscribe (`PushManager.subscribe` con la clave de `GET /api/admin/push/estado`) y registra la suscripción; estados claros: no disponible en este navegador, requiere instalar la app (iPhone), permiso bloqueado (cómo desbloquearlo), activado, error. Botón "Probar aviso" que muestra una notificación local.
  - Oculto el interruptor si `disponible` es `false`.
- Al **cerrar sesión**: se desuscribe este dispositivo (`DELETE`) y se limpia el globito.
- Vista previa con servidor de desarrollo: los avisos push solo funcionan en `https` o `localhost`.

## Archivos por agente (para no pisarse)

- **A (backend)**: todo `backend/`.
- **B (panel UI)**: `frontend/src/admin/*` (salvo lo de C), `frontend/src/styles/base.css` (solo los tokens de borde de campo en oscuro), `frontend/DESIGN.md`, nuevos componentes de toast/esqueleto/hoy.
- **C (PWA)**: `frontend/public/admin/*`, `frontend/src/pwa/*`, `frontend/scripts/optimizar-marca.mjs`, íconos en `frontend/public/marca/`, y la carga del manifest.
- **Compartido, con cuidado**: `frontend/src/admin/Panel.tsx` (B agrega la sección Hoy, el proveedor de toasts y `?vista=`; C agrega el botón de Ajustes del encabezado) y `frontend/src/admin/admin.css` (cada uno su bloque propio al final). Quien lo edite **vuelve a leer el archivo justo antes** y hace ediciones mínimas.

## Lo que necesita el dueño

- Generar las claves con `npm run vapid` (en `backend/`) y pegar las tres líneas en `backend/.env`. Sin ellas, los avisos quedan apagados.
- En producción hace falta `https` (ya lo exige publicar la web).
- En el celular: abrir el panel, "Instalar la app" y activar "Avisarme de turnos nuevos".

## Estado

- [x] A. Backend: migración, endpoints, envío, `npm run vapid`, CSP y headers, tests, README. (La migración está escrita y probada con PGlite, sin aplicar en Supabase; ver el último ítem.)
- [x] B. Panel: Hoy, toasts, esqueletos, borde en oscuro, `DESIGN.md`, tests.
- [x] C. PWA: manifest, íconos, service worker, ajustes (instalar y avisos), tests.
- [x] Verificación: todo en verde (typecheck, lint, tests y build de backend y frontend), revisión cruzada de la suscripción push, del service worker, del manifest y de la migración. Pendiente del dueño: capturas en celular y la prueba real del aviso push con claves VAPID reales.
- [x] Aplicar la migración en Supabase (2026-10-26: tabla con RLS, historial en orden, advisors sin hallazgos nuevos).
