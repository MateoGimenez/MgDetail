# MgDetailing - backend

API REST de MgDetailing, taller de detailing de autos en La Rioja, Argentina. Hace tres cosas:

1. Recibe **solicitudes de turno** desde la landing (público, con anti-spam).
2. **Autentica** al dueño del taller (sesión con cookie httpOnly).
3. Le permite **gestionar** esas solicitudes desde el panel `/admin` (listar, filtrar, cambiar el estado, borrar).

Stack: Node 24 + TypeScript (strict, ESM) + Express 5, SQLite con el módulo nativo `node:sqlite` (sin dependencias nativas que compilar), zod, helmet, cors, express-rate-limit, jose (JWT), scrypt nativo para contraseñas.

## Contenido

- [Instalación y uso](#instalación-y-uso)
- [Variables de entorno](#variables-de-entorno)
- [Crear el administrador](#crear-el-administrador)
- [Endpoints con ejemplos curl](#endpoints-con-ejemplos-curl)
- [Contrato de la API](#contrato-de-la-api)
- [Avisos por WhatsApp](#avisos-por-whatsapp)
- [Operación](#operación)
- [Seguridad](#seguridad)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Scripts y tests](#scripts-y-tests)

## Instalación y uso

Requisitos: Node 24 o superior y npm.

```bash
cd backend
npm install
npm run dev          # desarrollo, con recarga automática, en http://localhost:4000
```

En desarrollo no hace falta ningún archivo `.env`: todo tiene un valor por defecto seguro. Si no definís `JWT_SECRET`, se genera uno al azar en cada arranque y se avisa por consola que **las sesiones se pierden al reiniciar**.

Producción (un solo proceso Node):

```bash
npm ci
npm run build        # compila a dist/
npm start            # node dist/index.js
```

El frontend, en desarrollo, llama a la API a través del proxy de Vite (`5173 -> 4000`): el navegador manda `Origin: http://localhost:5173`, que es el `FRONTEND_ORIGIN` por defecto. Abrí el frontend siempre como `http://localhost:5173` (no como `127.0.0.1`: es otro origen y la API lo rechaza con 403).

## Variables de entorno

Copiá `.env.example` a `.env` (está ignorado por git; nunca subas uno con secretos). Las variables del entorno del sistema pisan a las del archivo. Una variable vacía cuenta como no definida. Si algo es inválido o falta en producción, el servidor **no arranca** y explica qué corregir.

| Variable | Por defecto | Descripción |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test` o `production`. En producción la cookie es `Secure` y se exigen `JWT_SECRET` y `FRONTEND_ORIGIN`. |
| `PORT` | `4000` | Puerto de la API. |
| `HOST` | `127.0.0.1` | Interfaz donde escucha. Usá `0.0.0.0` en Docker o en un PaaS. |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Origen(es) permitidos por CORS y por el chequeo de Origin (CSRF). Esquema + host + puerto, sin barra final. **Admite una lista separada por comas**, por ejemplo para probar desde el celular: `http://localhost:5173,http://192.168.0.10:5173`. Sin comodines. Obligatoria en producción. |
| `JWT_SECRET` | aleatorio por arranque (solo fuera de producción) | Secreto de las sesiones, mínimo 32 caracteres. **Obligatorio en producción.** Cambiarlo cierra todas las sesiones. |
| `DB_PATH` | `./storage/mgdetailing.db` | Archivo SQLite. Las rutas relativas se resuelven desde `backend/`. La carpeta se crea sola. |
| `TRUST_PROXY` | `false` | Cuántos proxies hay delante (`1`) o una lista de IP/CIDR de confianza, para que el rate limit vea la IP real. `true` se rechaza a propósito (permite falsear la IP). |
| `PUBLIC_URL` | (vacía) | Origen público del sitio (ej. `https://mgdetailing.com.ar`). Opcional: si está, el aviso de WhatsApp incluye el link al panel. |
| `WHATSAPP_PROVIDER` | `none` | `none`, `callmebot`, `cloud` o `telegram`. Ver [Avisos por WhatsApp](#avisos-por-whatsapp). |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | | Solo con `telegram`. Vacías = avisos desactivados (advertencia en desarrollo; en producción no arranca). |
| `WHATSAPP_OWNER_PHONE` | | Número del dueño, con código de país y solo dígitos (`5493804781737`). |
| `CALLMEBOT_APIKEY` | | Solo con `callmebot`. Con la apikey vacía los avisos quedan desactivados (advertencia en desarrollo; en producción no arranca). |
| `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, `WHATSAPP_CLOUD_TEMPLATE`, `WHATSAPP_CLOUD_LANGUAGE` | idioma `es_AR` | Solo con `cloud` (el idioma puede ser `es_AR` o `es`). |
| `SERVE_FRONTEND` | `false` | `true`: la API también sirve `../frontend/dist` con fallback SPA a `index.html` para rutas que no empiezan con `/api`. |

Generar un `JWT_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

## Crear el administrador

No hay registro público: el administrador se crea por línea de comandos. La contraseña (mínimo 10 caracteres) se lee de la variable `ADMIN_PASSWORD`; también se acepta `--password <clave>`, pero queda guardada en el historial de la terminal (el script avisa). Los emails se normalizan a minúsculas. Si el email ya existe, **se actualiza su contraseña y se cierran sus sesiones abiertas** (sirve para recuperar el acceso o ante una sospecha de filtración).

Hay dos scripts, según el entorno:

| Script | Cuándo usarlo |
|---|---|
| `npm run crear-admin:dev -- --email <email>` | **Desarrollo.** Corre el TypeScript directo con `tsx` (necesita las devDependencies). |
| `npm run crear-admin -- --email <email>` | **Producción.** Corre `node dist/scripts/crear-admin.js`: requiere `npm run build` antes y **no necesita devDependencies** (sirve con `npm ci --omit=dev`). |

PowerShell (Windows):

```powershell
$env:ADMIN_PASSWORD = "una clave larga y unica"
npm run crear-admin:dev -- --email dueno@ejemplo.com
Remove-Item Env:ADMIN_PASSWORD
```

Git Bash / Linux / macOS:

```bash
ADMIN_PASSWORD="una clave larga y unica" npm run crear-admin:dev -- --email dueno@ejemplo.com
```

El script lee `backend/.env` (para usar el mismo `DB_PATH` que el servidor). Si la shell se come el `--`, el email también se acepta por la variable `ADMIN_EMAIL`.

## Endpoints con ejemplos curl

Todo es JSON. En PowerShell usá `curl.exe` (en Windows PowerShell `curl` es un alias de otra cosa) y pasá el body desde un archivo: `-d "@turno.json"`. Los ejemplos están en sintaxis bash.

```bash
# Salud
curl http://localhost:4000/api/health
# -> {"status":"ok"}

# Solicitar un turno (público)
curl -X POST http://localhost:4000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Juan Pérez","telefono":"+54 9 380 412-3456","email":"juan@ejemplo.com",
       "vehiculoTipo":"auto","vehiculoModelo":"Toyota Corolla","servicioId":"pulido",
       "fechaPreferida":"2026-10-20","franja":"manana","comentario":"Rayones en el capot"}'
# -> 201 {"booking":{"id":"<uuid>","servicioId":"pulido","fechaPreferida":"2026-10-20","franja":"manana","estado":"pendiente"}}

# Iniciar sesión (guarda la cookie en cookies.txt)
curl -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dueno@ejemplo.com","password":"una clave larga y unica"}'
# -> 200 {"admin":{"email":"dueno@ejemplo.com"}}

# Quién soy
curl -b cookies.txt http://localhost:4000/api/auth/me

# Listar turnos (más nuevos primero), con filtro y paginación
curl -b cookies.txt "http://localhost:4000/api/admin/bookings?estado=pendiente&limit=20&offset=0"

# Cambiar el estado de un turno
curl -b cookies.txt -X PATCH http://localhost:4000/api/admin/bookings/<id> \
  -H "Content-Type: application/json" -d '{"estado":"confirmado"}'

# Borrar un turno (aunque no lleve body, exige el Content-Type)
curl -b cookies.txt -X DELETE http://localhost:4000/api/admin/bookings/<id> \
  -H "Content-Type: application/json"

# Cerrar sesión
curl -b cookies.txt -c cookies.txt -X POST http://localhost:4000/api/auth/logout \
  -H "Content-Type: application/json"
```

## Contrato de la API

Esta sección es la referencia para el frontend. Todo viaja como JSON; las fechas de auditoría son ISO 8601 en UTC.

### Reglas generales

- **`POST`, `PATCH` y `DELETE` (y `PUT`) exigen `Content-Type: application/json` aunque no lleven body** (por ejemplo `logout` y `delete`); si no, responden `415`. Un body vacío se acepta en esos casos. El body se interpreta como UTF-8.
- **Si el pedido trae cabecera `Origin`, tiene que coincidir exactamente con uno de los `FRONTEND_ORIGIN`**; si no, `403 FORBIDDEN_ORIGIN`. Los navegadores la mandan solos. Los clientes sin `Origin` (curl, scripts) se aceptan.
- Con `fetch` hay que enviar la cookie: `credentials: "include"` (o `same-origin` si se usa el proxy de Vite / `SERVE_FRONTEND`).
- Body máximo: **10 kb**. Los objetos de entrada son estrictos: **un campo desconocido se rechaza** con `400`.
- Las respuestas de `/api` llevan `Cache-Control: no-store`.
- Una ruta `/api/...` que no existe responde `404 NOT_FOUND` en JSON. Todo lo que cuelga de `/api/admin` pide sesión primero (`401`), exista o no la ruta.

### Enums exactos

| Campo | Valores |
|---|---|
| `vehiculoTipo` | `"auto"`, `"camioneta"`, `"moto"` |
| `servicioId` | `"lavado-basico"` (Lavado Básico), `"lavado-premium"` (Lavado Premium), `"pulido"` (Pulido), `"encerado"` (Encerado), `"restauracion-opticas"` (Restauración de ópticas) |
| `franja` | `"manana"`, `"tarde"` |
| `estado` | `"pendiente"` (inicial), `"confirmado"`, `"completado"`, `"cancelado"`. Se puede pasar de cualquiera a cualquiera. |

### Formato de error (todos los errores)

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Revisá los datos ingresados.", "fields": { "telefono": "Revisá el teléfono: ..." } } }
```

`message` está en español rioplatense y es apto para mostrar. `fields` solo aparece en errores de validación: la clave es el nombre del campo y el valor, el mensaje. Nunca se devuelven stack traces ni detalles internos.

| `code` | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Datos inválidos (con `fields`), query inválida, o un pedido mal formado sin campo asociado. |
| `INVALID_JSON` | 400 | El body no es JSON válido (o es un JSON que no es objeto ni array). |
| `UNAUTHORIZED` | 401 | Falta la sesión, venció o fue revocada. |
| `INVALID_CREDENTIALS` | 401 | Email o contraseña incorrectos (mensaje genérico: no dice cuál). |
| `FORBIDDEN_ORIGIN` | 403 | `Origin` no permitido. |
| `NOT_FOUND` | 404 | Ruta inexistente, o turno inexistente (un id con formato inválido también da 404). |
| `PAYLOAD_TOO_LARGE` | 413 | Body de más de 10 kb. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Falta `Content-Type: application/json` o el body viene comprimido. |
| `RATE_LIMITED` | 429 | Demasiados pedidos. Trae la cabecera `Retry-After` (segundos). |
| `INTERNAL_ERROR` | 500 | Error inesperado (el detalle queda solo en el log del servidor). |
| `SERVICE_UNAVAILABLE` | 503 | Solo `/api/health`, si la base de datos no responde. |

### `GET /api/health`

`200 { "status": "ok" }`, o `503 SERVICE_UNAVAILABLE` si la base no responde.

### `POST /api/bookings` (público)

Límite: **5 turnos creados por IP cada 15 minutos** (`429`). Los pedidos rechazados por validación no gastan cupo.

| Campo | Obligatorio | Regla |
|---|---|---|
| `nombre` | sí | Texto, sin espacios en los extremos, 2 a 80 caracteres. |
| `telefono` | sí | 8 a 20 caracteres: solo dígitos, espacios, `+`, `-`, `(`, `)`, con **al menos 8 dígitos**. Se guarda y devuelve tal como lo escribió el cliente (sin espacios en los extremos). |
| `email` | no | Email válido, hasta 120 caracteres. `""`, `null` u omitido => `null`. Se guarda en minúsculas. |
| `vehiculoTipo` | sí | Ver enums. |
| `vehiculoModelo` | no | Hasta 80 caracteres. `""`, `null` u omitido => `null`. |
| `servicioId` | sí | Ver enums. |
| `fechaPreferida` | sí | `YYYY-MM-DD`, existente en el calendario, desde **hoy** hasta **hoy + 60 días** (ambos inclusive). "Hoy" se calcula en la zona `America/Argentina/La_Rioja`. |
| `franja` | sí | Ver enums. |
| `comentario` | no | Hasta 500 caracteres (admite saltos de línea). `""`, `null` u omitido => `null`. |
| `website` | no | **Honeypot anti-spam**: campo oculto en el formulario que una persona nunca completa. Si viene con contenido, la API responde `201` con una respuesta creíble pero **no guarda nada**. |

Higiene de texto: los controles bidireccionales invisibles (los que agrega WhatsApp al copiar un contacto) se quitan solos; los caracteres de control (como el nulo o la campana) se rechazan.

Respuesta `201`:

```json
{ "booking": { "id": "5f0c2a3e-9b1d-4c7e-8a55-2d3f1e6b7a90", "servicioId": "pulido", "fechaPreferida": "2026-10-20", "franja": "manana", "estado": "pendiente" } }
```

`id` es un **UUID (string)**, no un número. La respuesta pública no incluye datos personales.

Error de validación `400` (ejemplo):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Revisá los datos ingresados.",
  "fields": { "telefono": "Revisá el teléfono: usá solo números, espacios, +, - y paréntesis (mínimo 8 dígitos).",
              "fechaPreferida": "La fecha no puede ser anterior a hoy." } } }
```

### `POST /api/auth/login`

Body `{ "email": string, "password": string }` (estricto; `password` hasta 128 caracteres). `200 { "admin": { "email": "dueno@ejemplo.com" } }` y la cookie de sesión. `401 INVALID_CREDENTIALS`. Límite: **5 intentos fallidos por IP cada 15 minutos** (`429`; los logins correctos no cuentan).

Cookie `mg_session`: `HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` (8 horas) y `Secure` en producción. El JS de la página no puede leerla: para saber si hay sesión, llamar a `GET /api/auth/me`.

### `POST /api/auth/logout`

`204` sin body. Revoca la sesión en el servidor y borra la cookie. Siempre responde `204`, haya o no sesión.

### `GET /api/auth/me`

`200 { "admin": { "email": "..." } }` o `401 UNAUTHORIZED`.

### `GET /api/admin/bookings?estado=&limit=&offset=` (requiere sesión)

| Parámetro | Regla |
|---|---|
| `estado` | Opcional. Uno de los cuatro estados. Vacío (`estado=`) = sin filtro. |
| `limit` | Opcional. Entero de 1 a 100. Por defecto 50. |
| `offset` | Opcional. Entero de 0 en adelante. Por defecto 0. |

Los parámetros desconocidos se ignoran; uno inválido da `400` con `fields`. Respuesta `200`, **más nuevos primero**; `total` cuenta los que cumplen el filtro, sin paginar:

```json
{
  "bookings": [
    {
      "id": "5f0c2a3e-9b1d-4c7e-8a55-2d3f1e6b7a90",
      "nombre": "Juan Pérez",
      "telefono": "+54 9 380 412-3456",
      "telefonoWhatsapp": "5493804123456",
      "email": "juan@ejemplo.com",
      "vehiculoTipo": "auto",
      "vehiculoModelo": "Toyota Corolla",
      "servicioId": "pulido",
      "fechaPreferida": "2026-10-20",
      "franja": "manana",
      "comentario": "Rayones en el capot",
      "estado": "pendiente",
      "createdAt": "2026-10-16T15:00:00.000Z",
      "updatedAt": "2026-10-16T15:00:00.000Z"
    }
  ],
  "total": 1
}
```

`email`, `vehiculoModelo` y `comentario` pueden ser `null`.

**`telefonoWhatsapp`** (`string | null`): el teléfono listo para `https://wa.me/<telefonoWhatsapp>`, solo dígitos y en formato internacional. Se calcula al leer (no es una columna) con `libphonenumber-js`, país por defecto Argentina: los celulares argentinos salen como `549` + 10 dígitos aunque el cliente no haya escrito el `0`, el `15` ni el `9` (`0380 15-4123456`, `380 4123456` y `+54 9 380 412-3456` dan `5493804123456`); un número válido de otro país va en E.164 sin `+` (`+1 415 555 2671` => `14155552671`). Si no se puede interpretar, es `null`: **nunca se rechaza un turno por eso**, así que el frontend tiene que manejar el `null` (mostrar el teléfono sin botón de WhatsApp).

### `PATCH /api/admin/bookings/:id` (requiere sesión)

Body estricto `{ "estado": "pendiente" | "confirmado" | "completado" | "cancelado" }`. `200 { "booking": { ...mismo objeto que el listado... } }`. `404 NOT_FOUND` si no existe; `400` con `fields.estado` si el estado es inválido.

### `DELETE /api/admin/bookings/:id` (requiere sesión)

`204` sin body. `404 NOT_FOUND` si no existe. Exige `Content-Type: application/json` aunque no lleve body.

## Avisos por WhatsApp

Cuando entra una solicitud de turno, el dueño recibe un WhatsApp con el servicio, la fecha, la franja, el cliente, su teléfono, un link `wa.me` para escribirle (si el teléfono es interpretable), el comentario (máx. 200 caracteres) y, si existe `PUBLIC_URL`, el link al panel. El aviso se manda **después** de guardar el turno y **sin esperar**: si el proveedor falla o tarda (timeout de 5 s), el cliente igual recibe su `201`. Los turnos descartados por honeypot no avisan. En el log solo queda `Aviso de WhatsApp enviado id=<id>` o `Aviso de WhatsApp falló id=<id> (status X)`; nunca el texto, la apikey, el token ni la URL.

**Privacidad:** con un proveedor activo, los datos del cliente (nombre, teléfono, vehículo, comentario) salen del sistema hacia ese proveedor (CallMeBot o Meta). Con `WHATSAPP_PROVIDER=none` no sale nada; al arrancar se loguea que los avisos están desactivados.

### Opción 1: CallMeBot (gratis, no oficial)

1. Desde el WhatsApp del número que va a recibir los avisos (3804781737), agregá a tus contactos el número del bot que indica https://www.callmebot.com/blog/free-api-whatsapp-messages/ (cambia con el tiempo; si dice que está lleno, reintentá más tarde).
2. Mandale por WhatsApp a ese contacto exactamente: `I allow callmebot to send me messages`.
3. El bot responde con tu **apikey** (si no llega en 2 minutos, reintentá pasadas 24 horas).
4. En `backend/.env` completá `CALLMEBOT_APIKEY=<la apikey>` (ya están `WHATSAPP_PROVIDER=callmebot` y `WHATSAPP_OWNER_PHONE=5493804781737`). En producción, definí esas tres variables en el entorno.
5. Reiniciá el servidor: debe loguear `Avisos por WhatsApp activados (callmebot)`.

Es un servicio de terceros, gratuito y pensado para uso personal: sin garantías de disponibilidad ni cupos publicados, y puede cambiar o cortarse.

### Opción 2: WhatsApp Cloud API (oficial, de Meta)

Para cuando el negocio crezca. Requiere una cuenta de Meta Business, un número registrado en WhatsApp Business Platform y una **plantilla aprobada** (categoría utilidad, idioma `es_AR` o `es`) con **una sola variable** en el cuerpo, por ejemplo: `Nuevo turno: {{1}}`. El backend manda el resumen en esa variable, en una línea y con las partes separadas por ` | ` (Meta no admite saltos de línea en variables). Variables:

```
WHATSAPP_PROVIDER=cloud
WHATSAPP_OWNER_PHONE=5493804781737
WHATSAPP_CLOUD_TOKEN=<token permanente del usuario del sistema>
WHATSAPP_CLOUD_PHONE_NUMBER_ID=<Phone number ID>
WHATSAPP_CLOUD_TEMPLATE=nuevo_turno
WHATSAPP_CLOUD_LANGUAGE=es_AR
```

Se envía `POST https://graph.facebook.com/v23.0/<PHONE_NUMBER_ID>/messages` con el token como `Bearer`. Mensajes iniciados por el negocio fuera de la ventana de 24 h solo pueden ser plantillas, y Meta los cobra según su tarifa vigente.

### Opción 3: Telegram (gratis, oficial, sin riesgo de baneo)

Respaldo si CallMeBot no tiene plazas y no se quiere pagar la Cloud API: el mismo aviso llega a un chat de Telegram del dueño, al instante y sin costo. Se activa con `WHATSAPP_PROVIDER=telegram`.

1. En Telegram, buscá `@BotFather` (el oficial, con tilde azul), mandale `/newbot`, elegí un nombre y un usuario que termine en `bot`. Te responde con el **token** (`123456789:AAH...`). Es una clave: no la compartas.
2. Abrí el bot nuevo (el link `t.me/<usuario>` que te dio BotFather) y mandale `/start` y cualquier mensaje (ej. `hola`). Sin esto el bot no puede escribirte.
3. En el navegador abrí `https://api.telegram.org/bot<TOKEN>/getUpdates` (reemplazando `<TOKEN>`). Buscá `"chat":{"id":123456789` : ese número es el **chat id**.
4. En `backend/.env` poné `WHATSAPP_PROVIDER=telegram`, `TELEGRAM_BOT_TOKEN=<token>` y `TELEGRAM_CHAT_ID=<chat id>`.
5. Reiniciá el servidor: debe loguear `Avisos de turnos activados (telegram)`.

El token va en la URL de la API de Telegram, por eso nunca se loguea. Los datos del cliente salen hacia Telegram.

### Comparación (octubre 2026, para 10-50 avisos por mes)

| Opción | Costo | Alta | Riesgo |
|---|---|---|---|
| CallMeBot | Gratis | Fácil, pero hoy sin plazas | Servicio no oficial de terceros, sin garantías ni límites publicados |
| WhatsApp Cloud API (Meta) | Plantilla utility en Argentina: unos US$0,026 por aviso (cifra de guías, verificar en la tarifa de Meta), o sea alrededor de US$1 por mes. El número de prueba es gratis pero solo permite hasta 5 destinatarios y plantillas fijas | Media/alta: cuenta Meta Business, número propio, plantilla aprobada y token de System User | Oficial, sin baneo |
| Twilio WhatsApp | Tarifa de Meta + US$0,005 por mensaje; el sandbox cobra igual y los destinatarios deben unirse otra vez cada pocos días | Media | Oficial |
| Green-API / Whapi.cloud / UltraMsg (vinculan tu WhatsApp por QR) | Plan gratis muy limitado (pocos chats); pago desde US$8-12 (Green-API) o US$29 (Whapi) por mes | Fácil (QR) | No oficial: riesgo de baneo del número |
| Baileys / whatsapp-web.js (propio) | Gratis más un servidor siempre encendido | Técnica, con sesión persistente | No oficial: riesgo de baneo; conviene un segundo número |
| Telegram (bot) | Gratis | Fácil (5 pasos) | Oficial, sin baneo; el aviso llega a Telegram y no a WhatsApp |
| Email | Gratis con SMTP | Pide dependencia o cuenta SMTP | Puede caer en spam |

## Operación

### Despliegue objetivo

Un **solo proceso Node** con `SERVE_FRONTEND=true` (la API y la landing/panel en el **mismo origen**), detrás de **HTTPS**: Caddy en un VPS (proxy inverso a `127.0.0.1:4000`, certificados automáticos) o un PaaS con **volumen persistente** para el archivo `.db`.

```
navegador --HTTPS--> Caddy / PaaS --HTTP--> node dist/index.js (API + estáticos del frontend)
                                                  |
                                                  +--> SQLite (DB_PATH, en un volumen persistente)
```

Con mismo origen no hay CORS de por medio, la cookie `SameSite=Strict` funciona sin vueltas y el `Origin` que manda el navegador es el propio dominio. El build del frontend (`frontend/dist`) tiene que existir antes de arrancar con `SERVE_FRONTEND=true`; si no, el servidor no arranca y lo explica. Los estáticos se sirven comprimidos (gzip) y con caché larga para `/assets` (un año; nombres con hash); la API nunca se comprime. Las fotos de `/fotos` se cachean 7 días **y no llevan hash en el nombre: al reemplazar una foto hay que cambiarle el nombre** (por ejemplo `taller-2.jpg` en vez de `taller.jpg`), o los visitantes seguirán viendo la vieja hasta una semana. La CSP de la SPA es estricta: todo del mismo origen, sin scripts ni estilos inline, fuentes autoalojadas, sin iframes. Si el frontend pasa a cargar algo de otro dominio, hay que agregarlo a propósito en `src/middleware/security.ts`.

### Variables en producción

| Variable | Qué poner |
|---|---|
| `NODE_ENV` | `production`. |
| `FRONTEND_ORIGIN` | **Igual al origen público exacto** que ve el navegador, con esquema y sin barra final: `https://mgdetailing.com.ar`. Si no coincide, los `POST/PATCH/DELETE` dan `403`. Si el sitio responde en `www` y sin `www`, listá los dos separados por coma. |
| `JWT_SECRET` | Aleatorio, de 32 caracteres o más. Guardalo en el gestor de secretos del servidor, no en el repo. |
| `HOST` | Con Caddy/nginx en la misma máquina dejá el default `127.0.0.1`. **En un PaaS o en Docker poné `0.0.0.0`**, si no la plataforma no llega al proceso. |
| `PORT` | El que indique la plataforma (muchos PaaS lo inyectan). |
| `TRUST_PROXY` | Con Caddy/nginx **en la misma máquina**: `loopback` (y `HOST=127.0.0.1`), así solo se cree el `X-Forwarded-For` que llega del proxy local. En un PaaS: `1` (el balanceador de la plataforma), siempre que el proceso no sea alcanzable sin pasar por él. Sin esto, el rate limit ve la IP del proxy y **todos los visitantes comparten el mismo cupo**; con un número y el puerto de Node expuesto a Internet, cualquiera puede conectarse directo, inventar su `X-Forwarded-For` y saltear el rate limit. |
| `DB_PATH` | Ruta absoluta dentro de un **volumen persistente** (ej.: `/data/mgdetailing.db`). Sin volumen, la base se pierde en cada despliegue. |
| `SERVE_FRONTEND` | `true` para el despliegue de un solo proceso. |

### Límites conocidos

- **El rate limit vive en la memoria del proceso**: se reinicia con cada arranque y no se comparte entre instancias.
- **SQLite = una sola instancia.** No escalar horizontalmente con varias réplicas escribiendo la misma base. Para este volumen de tráfico sobra; si algún día hiciera falta más, hay que pasar a PostgreSQL (el código accede a los datos solo a través de las interfaces de `src/domain/`, así que el cambio se concentra en `src/repositories/`) y a un store compartido para el rate limit.
- **El modo WAL no funciona sobre sistemas de archivos de red (NFS, SMB)**: usá disco local o un volumen de bloque del PaaS.
- Las consultas a SQLite son síncronas: bloquean el event loop el tiempo de cada consulta (milisegundos con este volumen).
- Las sesiones se guardan en la base: reiniciar el servidor **no** las cierra (salvo que cambie `JWT_SECRET`).

### Backup

No copies el archivo `.db` mientras el servidor corre (con WAL, parte de los datos está en `-wal`). Hacé una copia consistente y en caliente con `VACUUM INTO`, a un archivo que no exista:

```bash
sqlite3 /data/mgdetailing.db "VACUUM INTO '/backups/mgdetailing-2026-10-16.db'"
```

Sin la CLI de `sqlite3`, con Node 24 (bash):

```bash
node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.argv[1]); db.exec(\"VACUUM INTO '\" + process.argv[2].replaceAll(\"'\", \"''\") + \"'\"); db.close()" /data/mgdetailing.db /backups/mgdetailing-2026-10-16.db
```

La copia contiene datos personales y hashes de contraseña: guardala cifrada y con acceso restringido. `VACUUM INTO` crea el archivo con la `umask` de la shell: en Linux corré el backup con `umask 077` (o `chmod 600` a la copia) para que no quede legible por otros usuarios. Para restaurar, detené el servidor y reemplazá el archivo de `DB_PATH`. Conviene programarlo con cron / el programador de tareas y borrar las copias viejas.

### Alta del primer administrador en producción

Con el build hecho y las variables de entorno cargadas (el script lee el mismo `.env` y `DB_PATH` que el servidor):

```bash
npm ci
npm run build
npm prune --omit=dev                 # opcional: deja solo las dependencias de producción
ADMIN_PASSWORD='una clave larga y unica' npm run crear-admin -- --email dueno@mgdetailing.com.ar
```

`npm run crear-admin` no usa `tsx`, así que funciona sin devDependencies. Se puede correr con el servidor andando. Repetirlo con el mismo email cambia la contraseña y cierra las sesiones abiertas. En un PaaS, ejecutalo en una consola del servicio (con el volumen montado).

### Glosario

- **Booking** = turno / solicitud de turno. El dominio y la API están en español como el contrato (`turno`, `servicioId`, `franja`, `estado`...); el código técnico (clases, rutas internas, nombres de archivos de infraestructura) está en inglés.
- **Honeypot** = campo trampa `website` que solo completan los bots.
- **Repositorio** = capa de acceso a datos detrás de una interfaz (`src/domain/`); hoy implementada sobre SQLite.

## Seguridad

- **Contraseñas**: scrypt nativo (N=2^15, r=8, p=3, equivalente OWASP), salt aleatorio por usuario, comparación con `timingSafeEqual`. El login hace el trabajo de scrypt aunque el email no exista, para no revelar por tiempo qué emails están registrados.
- **Sesión**: JWT HS256 firmado con `jose`, con el algoritmo fijado al verificar (más emisor, audiencia y vencimiento), en cookie `HttpOnly; SameSite=Strict` (`Secure` en producción), 8 horas. Además cada sesión se registra en la base: **cerrar sesión la revoca de verdad**, y cambiar la contraseña cierra todas las sesiones de ese admin.
- **CSRF**: `SameSite=Strict` + chequeo de `Origin` + `Content-Type: application/json` obligatorio en métodos que modifican.
- **Rate limits**: general por IP, 5 turnos / 15 min, 5 logins fallidos / 15 min.
- **Entrada**: zod estricto (rechaza campos desconocidos), body máximo de 10 kb, sin cuerpos comprimidos. SQL siempre parametrizado, y una regla de ESLint prohíbe construir SQL con interpolación o concatenación.
- **Cabeceras**: helmet (CSP, HSTS en producción, `nosniff`, `X-Frame-Options: DENY`...), `Permissions-Policy`, `Cache-Control: no-store` en la API. El panel (`/admin`) lleva `X-Robots-Tag: noindex, nofollow`. Con `SERVE_FRONTEND`, lo que cuelga de `/assets`, `/fotos` y `/marca` y no existe da 404 (nunca el HTML de la SPA), igual que los dotfiles.
- **Datos personales**: nunca se escriben en los logs (una línea por request: método, ruta sin query, status y milisegundos; al crear un turno solo `id + servicio + fecha`; el aviso de WhatsApp solo `id` y status). Al borrar un turno se sobrescribe su contenido en la base (`secure_delete`).
- **Errores**: formato único, sin stack traces ni detalles internos.
- **Quien muestre estos datos debe escaparlos** (React lo hace por defecto): nunca `innerHTML` / `dangerouslySetInnerHTML` con nombre, modelo o comentario.

## Estructura del proyecto

```
backend/
  src/
    index.ts            arranque, listen y apagado prolijo (SIGINT/SIGTERM)
    app.ts              createApp(): arma Express sin escuchar (lo usan los tests)
    config.ts           lee .env y valida la configuración con zod
    domain/             tipos del negocio, reglas e interfaces async de los repositorios
    repositories/       implementación SQLite de esas interfaces
    services/           casos de uso con lógica (auth, alta de turno, alta de admin)
    routes/             rutas HTTP (health, bookings, auth, admin)
    notifications/      avisos de WhatsApp al dueño (CallMeBot, Cloud API) y formato del mensaje
    middleware/         seguridad, CSRF, rate limit, errores, logger, estáticos
    schemas/            validación de entrada con zod
    db/                 conexión SQLite, migraciones (PRAGMA user_version), chequeo de salud
    lib/                utilidades: errores, logger, scrypt, JWT, fechas, cookies
    scripts/            crear-admin
  test/                 vitest + supertest (DB en memoria)
```

## Scripts y tests

| Comando | Qué hace |
|---|---|
| `npm run dev` | Desarrollo con recarga (`tsx watch`). |
| `npm run build` | Compila a `dist/` con `tsc`. |
| `npm start` | `node dist/index.js`. |
| `npm run crear-admin:dev -- --email <email>` | Crea/actualiza el admin (desarrollo, `tsx`). |
| `npm run crear-admin -- --email <email>` | Crea/actualiza el admin (producción, `dist/`). |
| `npm test` | Tests (vitest + supertest). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint (typescript-eslint estricto). |

Los tests usan una base SQLite en memoria y un reloj fijo, y también corren las rutas y servicios contra repositorios en memoria para comprobar que no dependen de SQLite. Un test adicional falla si algún fuente contiene caracteres invisibles escritos literalmente (ataque "Trojan Source").
