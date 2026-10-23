# MgDetailing - backend

API REST de MgDetailing, taller de detailing de autos en La Rioja, Argentina. Hace esto:

1. Recibe **solicitudes de turno** desde la landing (público, con anti-spam).
2. **Autentica** a los usuarios del panel con **Supabase Auth**, en modo BFF: el backend habla con Supabase y guarda los tokens en cookies httpOnly; el navegador nunca ve un token ni una clave.
3. Les permite **gestionar** esas solicitudes desde el panel `/admin` según su **rol** (`superadmin`, `admin`, `empleado`), y al `superadmin` gestionar los usuarios.
4. Sirve el **catálogo de servicios** (textos, precios, duraciones, destacado, orden) desde la base: la landing lo lee de `GET /api/servicios` y `admin`/`superadmin` lo editan desde el panel sin volver a publicar la web.
5. Arma la **agenda** del panel: qué turnos hay cada día y franja (`GET /api/admin/agenda`), con la **fecha y franja confirmadas** por el taller cuando difieren de las que pidió el cliente.

Stack: Node 24 + TypeScript (strict, ESM) + Express 5, **Postgres en Supabase** (driver `pg`) como único motor, **Supabase Auth** (API REST de GoTrue, sin `supabase-js`), zod, helmet, cors, express-rate-limit, jose (verificación de los JWT contra el JWKS del proyecto). Los tests usan PGlite (Postgres en memoria).

## Contenido

- [Instalación y uso](#instalación-y-uso)
- [Variables de entorno](#variables-de-entorno)
- [Supabase Auth: usuarios y roles](#supabase-auth-usuarios-y-roles)
- [Base de datos](#base-de-datos)
- [Conectar Supabase](#conectar-supabase)
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

Hace falta un `backend/.env` con la conexión a Postgres y las dos variables de Supabase Auth (ver [Variables de entorno](#variables-de-entorno) y [Conectar Supabase](#conectar-supabase)): **sin Supabase el panel no funciona**, así que ya no hay modo SQLite sin internet. Lo demás tiene valores por defecto seguros.

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
| `NODE_ENV` | `development` | `development`, `test` o `production`. En producción las cookies son `Secure` y se exige `FRONTEND_ORIGIN`. |
| `PORT` | `4000` | Puerto de la API. |
| `HOST` | `127.0.0.1` | Interfaz donde escucha. Usá `0.0.0.0` en Docker o en un PaaS. |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Origen(es) permitidos por CORS y por el chequeo de Origin (CSRF). Esquema + host + puerto, sin barra final. **Admite una lista separada por comas**, por ejemplo para probar desde el celular: `http://localhost:5173,http://192.168.0.10:5173`. Sin comodines. Obligatoria en producción. |
| `SUPABASE_URL` | (obligatoria) | URL del proyecto, sin barra final: `https://iclsiweaqhupxvxbpekl.supabase.co`. De ahí se derivan `/auth/v1` (endpoints de Auth y `iss` exacto de los tokens) y el JWKS (`/auth/v1/.well-known/jwks.json`). |
| `SUPABASE_PUBLISHABLE_KEY` | (obligatoria) | Clave **publishable** (`sb_publishable_...`), del panel: *Project Settings > API Keys*. La usa solo el backend (cabecera `apikey`). **Una secret key (`sb_secret_...`) en esta variable se rechaza.** |
| `SUPABASE_SECRET_KEY` | (opcional) | Clave **secret** (`sb_secret_...`), de *Project Settings > API Keys > Secret keys*. **Secreto: salta RLS en todo el proyecto.** La usa solo el backend, solo para la API admin de Auth: que el superadmin cree y elimine usuarios y les cambie email o contraseña desde el panel. Va únicamente en la cabecera `apikey`, nunca se loguea ni llega al navegador. Sin ella el panel funciona, pero esas acciones responden `503` (y se avisa al arrancar). Las claves viejas `service_role` no se aceptan. |
| `DATABASE_URL` | (obligatoria) | Cadena de conexión de Supabase (Session pooler) con el rol `mgdetailing_app`: `postgresql://usuario:contraseña@host:5432/postgres`. **Secreto.** Se valida al arrancar y nunca se muestra en logs ni errores. Ver [Conectar Supabase](#conectar-supabase). |
| `DATABASE_SSL_CA_FILE` | (obligatoria con Postgres remoto) | Certificado raíz de Supabase para verificar al servidor (TLS verify-full). Ruta relativa a `backend/` o absoluta. Solo un Postgres local (`localhost`/`127.x`) se tolera sin ella fuera de producción, con un aviso. |
| `DB_DRIVER`, `DB_PATH`, `JWT_SECRET` | | **Ya no se usan.** `DB_DRIVER=postgres` se sigue aceptando (cualquier otro valor se rechaza); `DB_PATH` y `JWT_SECRET` solo generan un aviso al arrancar: borralos del `.env`. |
| `TRUST_PROXY` | `false` | Cuántos proxies hay delante (`1`) o una lista de IP/CIDR de confianza, para que el rate limit vea la IP real. `true` se rechaza a propósito (permite falsear la IP). |
| `PUBLIC_URL` | (vacía) | Origen público del sitio (ej. `https://mgdetailing.com.ar`). Opcional: si está, el aviso de WhatsApp incluye el link al panel. |
| `WHATSAPP_PROVIDER` | `none` | `none`, `callmebot`, `cloud` o `telegram`. Ver [Avisos por WhatsApp](#avisos-por-whatsapp). |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | | Solo con `telegram`. Vacías = avisos desactivados (advertencia en desarrollo; en producción no arranca). |
| `WHATSAPP_OWNER_PHONE` | | Número del dueño, con código de país y solo dígitos (`5493804781737`). |
| `CALLMEBOT_APIKEY` | | Solo con `callmebot`. Con la apikey vacía los avisos quedan desactivados (advertencia en desarrollo; en producción no arranca). |
| `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, `WHATSAPP_CLOUD_TEMPLATE`, `WHATSAPP_CLOUD_LANGUAGE` | idioma `es_AR` | Solo con `cloud` (el idioma puede ser `es_AR` o `es`). |
| `SERVE_FRONTEND` | `false` | `true`: la API también sirve `../frontend/dist` con fallback SPA a `index.html` para rutas que no empiezan con `/api`. |

## Supabase Auth: usuarios y roles

### Arquitectura (BFF)

```
navegador --/api (cookies httpOnly)--> backend --POST /auth/v1/token, /auth/v1/logout (apikey publishable)--> Supabase Auth
                                          |--verifica el access token con el JWKS del proyecto (ES256, caché 10 min)
                                          +--lee el perfil (rol, activo) y la sesión (auth.sessions) en cada request
```

- El frontend sigue llamando **solo a `/api`**: nada de `supabase-js` ni claves de Supabase en el navegador (no cambia la CSP ni el bundle).
- **Login**: el backend llama a `POST <SUPABASE_URL>/auth/v1/token?grant_type=password`, verifica el `access_token` con `jose` contra el JWKS (algoritmo **ES256** fijado, `iss` = `<SUPABASE_URL>/auth/v1`, `aud` = `authenticated`, `exp`, `sub` y `session_id` UUID, `role = authenticated`, no anónimo) y busca el **perfil** del usuario en `mgdetailing.perfiles`. Sin perfil o inactivo: `403` genérico (y se cierra en Supabase la sesión recién abierta).
- **Cookies**: `mg_at` (access token, `Path=/api`) y `mg_rt` (refresh token, `Path=/api/auth`), las dos `HttpOnly; SameSite=Strict`, `Secure` en producción, `Max-Age` 8 h desde el último login o refresco.
- **Tope absoluto**: una sesión dura como máximo **12 h desde el login** aunque se siga refrescando (`SESION_MAX_SEGUNDOS` en `src/domain/perfil.ts`; lo aplica `mgdetailing_private.sesion_vigente` contra `auth.sessions.created_at`, y la sesión se cierra también en Supabase). En el plan Free el refresh token de Supabase no vence: sin este tope, una sesión abierta (o un refresh token robado) se renovaría para siempre.
- **En cada request a `/api/admin/*`**: se verifica el access token, se carga el perfil (rol y `activo`) y se comprueba que la sesión siga existiendo en `auth.sessions` (función `mgdetailing_private.sesion_vigente`). Así **desactivar a alguien, cambiarle el rol, cerrar su sesión o borrarlo en Supabase tiene efecto en el request siguiente**, aunque su access token todavía no haya vencido.
- **Refresco**: el access token dura lo que diga Supabase (1 h por defecto). Cuando vence, `/api/admin/*` responde `401 SESSION_EXPIRED` (el refresh token no viaja ahí a propósito: su cookie es solo de `/api/auth`) y el frontend llama a `POST /api/auth/refresh`, que canjea el refresh token (`grant_type=refresh_token`, con rotación), reescribe las dos cookies y devuelve el usuario; después reintenta el pedido. `GET /api/auth/me` refresca solo. Si el refresh token fue revocado o reutilizado (Supabase detecta el reuso y cierra la sesión entera): `401` y se borran las cookies.
- **Logout**: `POST /auth/v1/logout?scope=local` con el access token (si venció, se refresca antes) y se borran las cookies.
- **Algoritmo**: el proyecto firma con una clave asimétrica **ES256** (JWT Signing Keys; el JWKS público tiene una clave EC P-256). Si algún día se rota a una clave RSA, hay que cambiar `SUPABASE_JWT_ALGORITHM` en `src/lib/access-token.ts`.
- La **secret key** (`SUPABASE_SECRET_KEY`, opcional) se usa solo en `src/lib/supabase-admin.ts`, para la API admin de Auth (`/auth/v1/admin/users`) que llaman las acciones de superadmin: crear y eliminar usuarios y cambiarles email o contraseña. El login, el refresco y el logout siguen usando la publishable.
- Logs: solo el id del usuario (`Inicio de sesión usuario=<uuid> rol=admin`); nunca tokens ni emails.

### Roles y permisos (la regla vive en el backend; la UI solo esconde botones)

| Rol | Ver turnos y agenda | Cambiar estado | Reprogramar | Borrar turnos | Gestionar usuarios | Ver catálogo | Editar catálogo |
|---|---|---|---|---|---|---|---|
| `superadmin` | sí | a cualquier estado | sí | sí | sí (crear, listar, cambiar rol, activar/desactivar, nombre, email y contraseña, eliminar) | sí | sí |
| `admin` | sí | a cualquier estado | sí | sí | no | sí | sí |
| `empleado` | sí | **solo a `completado`** | **no** | no | no | sí | **no** (solo lectura) |

"Reprogramar" = cambiar la fecha/franja confirmadas de un turno, también al confirmarlo "para otra fecha" o al volver a la que pidió el cliente (`puedeReprogramar` en `src/domain/permisos.ts`).

"Editar catálogo" = crear servicios, editarlos (textos, precio, duración, destacado, activo) y reordenarlos (`puedeEditarCatalogo` en `src/domain/permisos.ts`).

Lo que no está permitido responde `403 FORBIDDEN` con un mensaje en español. Reglas de usuarios: nadie puede cambiarse su propio rol, ni desactivarse ni eliminarse a sí mismo (`409 CONFLICT`), y **nunca puede quedar el sistema sin un superadmin activo** (lo garantiza un trigger en la base, también ante dos cambios simultáneos; `409 CONFLICT`).

### Alta de usuarios (pasos del dueño)

1. **Cerrar el registro público.** En https://supabase.com/dashboard/project/iclsiweaqhupxvxbpekl: *Authentication > Sign In / Providers > Email* y **desactivá "Allow new users to sign up"** (guardar). Aunque quedara abierto, un usuario registrado por su cuenta nace `empleado` e **inactivo** y no entra hasta que un superadmin lo active.
2. **Crear el usuario.** *Authentication > Users > Add user > Create new user*: email y contraseña (larga y única), con **"Auto Confirm User"** marcado. Un trigger crea su perfil en `mgdetailing.perfiles` como `empleado` inactivo.
3. **Promover al primer superadmin** (solo la primera vez). En el **SQL Editor** (o en el *Table Editor*, esquema `mgdetailing`, tabla `perfiles`):

   ```sql
   update mgdetailing.perfiles set rol_id = 'superadmin', activo = true where email = 'tu-email@ejemplo.com';
   ```

   El email va en minúsculas. Tiene que decir `UPDATE 1`.
4. **Configurá `SUPABASE_SECRET_KEY`** en el `.env` del backend (y en el entorno del servidor en producción) y reiniciá.
5. **Los demás usuarios los crea el superadmin desde el panel web** (*Usuarios > Nuevo usuario*: email, contraseña, nombre, rol y si entra desde ya). El backend los crea en Supabase Auth con el email ya confirmado (no se manda ningún email) y el trigger crea su perfil. Pasale la contraseña a la persona por un canal privado. Desde el mismo panel se les cambia el rol, el nombre, el email o la contraseña, se los desactiva (efecto inmediato) o se los elimina (borra el usuario de Supabase Auth; su perfil y sus sesiones se van en cascada).
6. **Contraseña olvidada:** no hay recuperación por email (no hay SMTP configurado). El superadmin le asigna una nueva desde *Usuarios > Cambiar contraseña*. Si el que la olvidó es el único superadmin, se cambia en Supabase (*Authentication > Users > (usuario)*).

## Base de datos

**Postgres en Supabase es el único motor** (proyecto `iclsiweaqhupxvxbpekl`, esquema propio `mgdetailing`, no expuesto por la Data API). SQLite se retiró: con Supabase Auth el panel no funciona sin Supabase, y tener un solo motor evita dos implementaciones de cada repositorio. Las migraciones están en `supabase/migrations/*.sql` (formato Supabase CLI) y **no** las aplica el backend: se aplican con la CLI o el MCP de Supabase. Al arrancar, el backend **verifica** que estén (tablas, columnas del catálogo editable, roles y la función de sesión) y si no, no arranca y dice qué falta. Si no hay ningún servicio activo, arranca igual pero lo avisa en el log (la web no podría recibir turnos).

### Conexión a Postgres

- Driver **`pg` (node-postgres)** con un `Pool` chico: `max` 5 conexiones, se cierran ociosas a los 30 s, timeout de conexión de 5 s, tope de 10 s por consulta, renovación cada 30 min. Un error en una conexión ociosa se loguea y el pool la reemplaza (no tumba el proceso).
- **Modo recomendado: Session pooler (Supavisor, puerto 5432)**, del botón *Connect* del panel. Es lo que Supabase recomienda para un servidor de larga vida en una red **IPv4** (la mayoría de los VPS, PaaS y conexiones domésticas). Si el servidor tiene **IPv6**, la conexión **directa** (`db.<ref>.supabase.co:5432`) también sirve y es un poco más rápida. **No uses el Transaction pooler (6543)**: es para funciones serverless que abren y cierran conexiones todo el tiempo.
- **TLS siempre.** Con `DATABASE_SSL_CA_FILE` (el certificado raíz de Supabase, *Supabase Root 2021 CA*) se verifica el certificado y el nombre del servidor (como `sslmode=verify-full`). Sin él, la conexión iría cifrada pero sin verificar quién responde (un intermediario en la red podría hacerse pasar por Supabase y quedarse con la sesión de la base): por eso se exige siempre que el host no sea local, incluso fuera de producción. Solo con un Postgres en la misma máquina (`localhost`/`127.x`/`::1`) se tolera sin el CA, con un aviso. Los parámetros `sslmode`/`sslrootcert` de la URL se ignoran: la URL se desarma en host, puerto, usuario, contraseña y base, y el TLS lo decide el backend.
- La contraseña nunca se loguea: en los logs aparece `host:puerto/base (usuario ...)`.
- Todas las consultas son SQL **parametrizado** (`$1, $2...`) y nombran el esquema (`mgdetailing.bookings`), sin depender del `search_path`. La regla de ESLint prohíbe interpolar o concatenar SQL en `.query()` y prohíbe importar `node:sqlite`.

### Modelo de datos (Postgres)

```mermaid
erDiagram
    servicios ||--o{ bookings : "servicio_id (FK, RESTRICT)"
    auth_users ||--|| perfiles : "id (FK, ON DELETE CASCADE)"
    roles ||--o{ perfiles : "rol_id (FK, RESTRICT)"
    auth_users ||--o{ auth_sessions : "user_id (Supabase Auth)"

    servicios {
        text id PK "slug inmutable: lavado-basico, pulido..."
        text nombre
        text resumen
        text descripcion
        jsonb incluye "array de textos"
        jsonb glosario "array de termino + significado"
        text duracion_estimada "null = sin confirmar"
        integer precio_desde "ARS; null = Consultá"
        boolean destacado "a lo sumo uno"
        boolean activo
        smallint orden
        timestamptz created_at
        timestamptz updated_at
    }
    bookings {
        bigint seq PK "identity, orden interno"
        uuid id UK "gen_random_uuid(), id público"
        text nombre
        text telefono
        text email "nullable"
        text vehiculo_tipo "CHECK auto, camioneta, moto"
        text vehiculo_modelo "nullable"
        text servicio_id FK
        date fecha_preferida
        text franja "CHECK manana, tarde"
        date fecha_confirmada "nullable; va con franja_confirmada"
        text franja_confirmada "nullable; CHECK manana, tarde"
        text comentario "nullable"
        text estado "CHECK pendiente, confirmado, completado, cancelado"
        timestamptz created_at
        timestamptz updated_at
    }
    roles {
        text id PK "superadmin, admin, empleado"
        text nombre
        text descripcion
        timestamptz created_at
    }
    perfiles {
        uuid id PK "= auth.users.id"
        text email "copia en minúsculas (la mantiene el trigger)"
        text nombre "nullable"
        text rol_id FK "default empleado"
        boolean activo "default false"
        timestamptz created_at
        timestamptz updated_at
    }
    auth_users {
        uuid id PK "esquema auth (Supabase)"
        text email
    }
    auth_sessions {
        uuid id PK "claim session_id del JWT"
        uuid user_id
        timestamptz not_after
    }
```

| Tabla | Para qué | Restricciones e índices |
|---|---|---|
| `servicios` | **Catálogo del taller, fuente de verdad** (editable desde el panel; ver [Catálogo editable](#catálogo-editable)). Sembrado con los 5 servicios y los textos que tenía `frontend/src/data/servicios.ts` (propuesta inicial, sin confirmar). Un servicio que se deja de ofrecer se **desactiva** (`activo = false`), no se borra: lo referencian turnos. | PK `id` (slug validado por CHECK, inmutable: `mgdetailing_app` no tiene `UPDATE` sobre él). CHECK de largos de `nombre`/`resumen`/`descripcion`/`duracion_estimada` (no vacía), `precio_desde` entero de 0 a 99.999.999, `incluye` y `glosario` validados ítem por ítem (funciones `mgdetailing.servicio_incluye_valido` / `servicio_glosario_valido`). Índice único parcial `servicios_un_destacado` (`WHERE destacado`): a lo sumo un destacado. Trigger `updated_at`. |
| `bookings` | Solicitudes de turno. | PK `seq` (bigint identity: inserciones ordenadas, índice compacto y orden estable aunque dos turnos tengan el mismo `created_at`); `id` UUID **único**, el único que sale por la API (un id secuencial revelaría cuántos turnos hay). FK `servicio_id -> servicios` (`RESTRICT`). CHECK de `vehiculo_tipo`, `franja`, `franja_confirmada`, `estado` y de los largos de zod; CHECK `bookings_confirmada_juntas`: `fecha_confirmada` y `franja_confirmada` las dos null o las dos con valor. Índices: `(estado, seq DESC)` para el listado filtrado y su `COUNT`; la PK sirve al listado sin filtro; `(servicio_id)` para la FK; `bookings_agenda_idx`, de expresión y parcial, `(coalesce(fecha_confirmada, fecha_preferida), coalesce(franja_confirmada, franja), seq) WHERE estado <> 'cancelado'`, para la agenda. |
| `roles` | Los 3 roles del panel (sembrados por migración). Los permisos de cada rol los aplica el backend (`domain/permisos.ts`). | PK `id` (slug). |
| `perfiles` | Un perfil por usuario de Supabase Auth: rol y si puede entrar. Lo crea el trigger de `auth.users`; se borra en cascada con el usuario. | PK/FK `id -> auth.users ON DELETE CASCADE`; FK `rol_id -> roles` con índice; CHECK de email en minúsculas y largo de nombre; trigger `updated_at`; trigger `perfiles_al_menos_un_superadmin`. |

Funciones y triggers (migración `perfiles_roles_supabase_auth`):

- `mgdetailing_private.sincronizar_perfil()`: trigger `AFTER INSERT OR UPDATE OF email ON auth.users`. Crea el perfil (`empleado`, **inactivo**) o copia el email nuevo; nunca toca rol ni activo. `SECURITY DEFINER` (el rol de Auth no tiene permisos fuera de `auth`, patrón recomendado por Supabase), `search_path` vacío, en el esquema **no expuesto** `mgdetailing_private`, sin `EXECUTE` para `public`, `anon`, `authenticated`, `service_role` ni `mgdetailing_app`. No lee `raw_user_meta_data` (lo edita el propio usuario).
- `mgdetailing_private.sesion_vigente(session_id, user_id, max_age_seconds)`: `SECURITY DEFINER`, `STABLE`, devuelve solo un booleano: si la sesión sigue en `auth.sessions`, no pasó su `not_after` y se abrió hace menos de `max_age_seconds` (tope absoluto, 12 h). Solo `mgdetailing_app` tiene `EXECUTE`. Es lo que hace que un logout invalide el access token al instante.
- `mgdetailing_private.impedir_sin_superadmin()` (SECURITY DEFINER desde la migración `superadmin_trigger_definer`: cuando el borrado viene de Supabase Auth, el trigger corre como `supabase_auth_admin`, que no tiene acceso a `mgdetailing`; como INVOKER, borrar cualquier superadmin activo fallaba con `42501`): triggers `AFTER UPDATE OF rol_id, activo` y `AFTER DELETE` que solo se disparan cuando una fila **deja** de ser superadmin activo (también al borrar el usuario de Auth, desde el panel o desde Supabase: si es el último superadmin activo el borrado falla y hay que dar el rol a otro antes); toma un advisory lock y, si no queda ninguno, falla con SQLSTATE `MG001` (la API responde `409`).

Decisiones:

- **`text` + `CHECK` en vez de enums** para `vehiculo_tipo`, `franja` y `estado`: la integridad queda en la base igual que con un enum, se leen como string sin conversiones y cambiar los valores es un `ALTER` de la constraint (quitar un valor de un enum de Postgres obliga a recrear el tipo).
- **`updated_at` con trigger** (`mgdetailing.set_updated_at`): el backend manda su propio `updated_at` (su reloj, el mismo que usan las respuestas y los tests); si una actualización no lo cambia (por ejemplo, una edición a mano desde el panel de Supabase), el trigger pone `now()`. Es `SECURITY INVOKER` y con `search_path` vacío.
- `telefonoWhatsapp` **no es columna**: se calcula al leer.
- **El pedido del cliente nunca se pisa**: `fecha_preferida`/`franja` son lo que pidió; lo que confirma el taller va en `fecha_confirmada`/`franja_confirmada` (null = la pedida). "Fecha de agenda" = `coalesce(fecha_confirmada, fecha_preferida)`, lo mismo para la franja. El rango de una fecha confirmada (hoy a hoy + 120 días) lo valida la API: un CHECK no puede depender de "hoy", y un turno viejo conserva la suya.
- `fecha_preferida` y `fecha_confirmada` son `date`; los repositorios las devuelven como `YYYY-MM-DD` (`to_char`) y los `timestamptz` como ISO 8601 UTC, igual que el contrato.
- **`perfiles.email` es una copia**: `mgdetailing_app` no puede leer `auth.users` (ni debe); el trigger la mantiene al día.

### Seguridad en la base (Supabase)

- Todo vive en los esquemas **`mgdetailing`** y **`mgdetailing_private`**, que **no** están entre los expuestos por la Data API (PostgREST/GraphQL publican `public` y `graphql_public`; un pedido con `Accept-Profile: mgdetailing` responde `PGRST106`). La web **nunca** habla con Supabase: ni `supabase-js`, ni claves en el frontend. El único cliente de la base y de Supabase Auth es este backend.
- **Rol dedicado `mgdetailing_app`** (migración `rol_app_minimo_privilegio`): el backend se conecta con él, **no** con `postgres`. Puede solo lo que el backend hace: `SELECT` en `roles`; `SELECT` en `servicios`, `INSERT` por columna (todas salvo `created_at`) y `UPDATE` por columna (los campos editables, `orden` y `updated_at`; nunca `id` ni `created_at`), sin `DELETE`, y `EXECUTE` de las dos funciones de validación del catálogo; `SELECT/INSERT/DELETE` en `bookings` y `UPDATE` solo de `estado`, `updated_at`, `fecha_confirmada` y `franja_confirmada` (nunca los datos del cliente ni el pedido original); `SELECT` en `perfiles` y `UPDATE` solo de `rol_id`, `activo`, `nombre` y `updated_at` (sin `INSERT` ni `DELETE`: los hace el trigger / la cascada); `EXECUTE` solo de `mgdetailing_private.sesion_vigente`. Sin DDL, sin `TRUNCATE`, sin `BYPASSRLS`, sin acceso a `auth`, `storage` ni `public`. Topes de sesión: `statement_timeout` 10 s, `lock_timeout` 5 s, `idle_in_transaction_session_timeout` 30 s. Se crea **NOLOGIN y sin contraseña** (no hay secretos en el repo): el dueño le pone la contraseña (ver [Conectar Supabase](#conectar-supabase)). Si el backend arranca conectado con un rol privilegiado (`postgres`), lo avisa en el log.
- **RLS habilitado en las 4 tablas**, con policies **solo para `mgdetailing_app`** (`USING (true)`: el backend es un único cliente de confianza que ve todas las filas; la autorización por usuario y por rol la hace la API con la sesión del panel). `anon`, `authenticated` y `service_role` no tienen ni privilegios ni policies: aunque alguien expusiera el esquema por error, no verían una fila. `postgres` (dueño de las tablas, con `BYPASSRLS`) queda para migraciones y backups.
- **`REVOKE` de todo** (tablas, secuencias, funciones y el `USAGE` del esquema) a `public`, `anon`, `authenticated` y `service_role`, y privilegios por defecto revocados para lo que se cree después en el esquema. Un test lo comprueba en PGlite (incluso haciendo `SET ROLE anon`).
- Advisors de Supabase (security y performance) después de aplicar: security sin avisos; performance solo con el INFO esperado *unused index* (la base está vacía; se usan en cuanto haya turnos). La migración `endurecer_rls_auto_enable` revocó el `EXECUTE` de `public.rls_auto_enable()` (una función de Supabase que ya venía en el proyecto, del event trigger que activa RLS en tablas nuevas de `public`) a `anon`/`authenticated`, que el linter marcaba como WARN.
- Al borrar un turno en Postgres, la fila deja de verse al instante pero sus bytes quedan en disco hasta que `autovacuum` reutiliza el espacio, y los backups la conservan durante su retención. Para la Ley 25.326 alcanza con que el dato no sea accesible y que la retención de backups esté acotada y documentada.
- **Región `us-east-1` (EE.UU.)**: los datos de los clientes se guardan fuera de Argentina. Es una transferencia internacional (Ley 25.326, art. 12): EE.UU. no figura entre los países con protección adecuada para la AAIP (y ninguna región de Supabase está en Argentina), así que hay que apoyarse en el consentimiento del cliente (mencionarlo en el aviso de privacidad del formulario) y en el acuerdo de tratamiento de datos (DPA) de Supabase. Ver el informe de seguridad.

### Migraciones (Postgres)

- Archivos `supabase/migrations/YYYYMMDDHHMMSS_descripcion.sql`: la fuente de verdad del esquema Postgres. Nunca se edita una migración aplicada; los cambios van en un archivo nuevo.
- Aplicadas en el proyecto remoto: `20261018211151_esquema_inicial`, `20261018211156_catalogo_servicios`, `20261018211232_endurecer_rls_auto_enable`, `20261018213342_rol_app_minimo_privilegio`. Los nombres de los archivos coinciden con las versiones registradas en Supabase, así `supabase migration list` / `supabase db push` los ven como aplicados.
- **Aplicadas el 2026-10-19 desde el SQL Editor** (Supabase Auth): `20261018234300_perfiles_roles_supabase_auth` (roles, perfiles, triggers, `mgdetailing_private`) y `20261018234301_eliminar_admins_sessions` (borró `admins` y `sessions`, que estaban vacías). Como se aplicaron a mano, no figuran en el historial de migraciones de Supabase: si algún día se usa `supabase db push`, marcarlas antes como aplicadas con `supabase migration repair --status applied 20261018234300 20261018234301`. Las migraciones nuevas: SQL Editor (en orden) o `supabase db push`, y después correr los advisors.
- `20261022185000_superadmin_trigger_definer` (2026-10-22): pasa el trigger "nunca sin superadmin activo" a `SECURITY DEFINER` en `mgdetailing_private`. Sin ella, eliminar un superadmin activo (desde el panel o desde Supabase) falla con `permission denied for schema mgdetailing`. Si se aplica desde el SQL Editor, no queda en el historial: marcala con `supabase migration repair --status applied 20261022185000` antes de un `db push`.
- Para aplicar una nueva: con la CLI (`supabase link --project-ref iclsiweaqhupxvxbpekl` y después `supabase db push`) o con el MCP de Supabase (`apply_migration`; después renombrá el archivo local a la versión que quedó registrada). Corré los advisors después de cada cambio.
- Los tests aplican **las mismas migraciones** a un Postgres en memoria (PGlite). Como PGlite no tiene lo de Supabase, el test crea antes de migrar los roles `anon`, `authenticated` y `service_role` (sin login) y un esquema `auth` mínimo (`auth.users` y `auth.sessions` con las columnas que se usan): así las migraciones se prueban tal cual, sin saltear sentencias.
- **`20261022200000_catalogo_editable` (2026-10-22): PENDIENTE de aplicar en Supabase, con aprobación del dueño.** Agrega `resumen`, `descripcion`, `incluye`, `glosario` y `destacado` a `servicios`, copia los textos del frontend, pasa `precio_desde` a `integer`, crea el índice de destacado único y da a `mgdetailing_app` `INSERT`/`UPDATE` por columna con sus policies. Hasta aplicarla, **el backend nuevo no arranca** ("Faltan columnas en mgdetailing.servicios"): aplicala antes de desplegar este backend y corré los advisors después.
- **`20261023120000_agenda_fecha_confirmada` (2026-10-23): PENDIENTE de aplicar en Supabase** (contrato `reportes/2026-10-22_08_agenda.md`). Agrega `fecha_confirmada` y `franja_confirmada` (nullable) a `bookings` con sus CHECK (franja válida; las dos juntas), el índice parcial `bookings_agenda_idx` y `GRANT UPDATE (fecha_confirmada, franja_confirmada)` a `mgdetailing_app`. Columnas nullable sin default: no reescribe la tabla. Hasta aplicarla, **el backend nuevo no arranca** ("Faltan columnas en mgdetailing.bookings"); aplicala (después de `catalogo_editable`) antes de desplegar y corré los advisors.
- Los servicios ya **no** se agregan por migración ni en el código: se crean desde el panel.

### Backups (Supabase)

- **Plan Free: Supabase no hace backups que puedas descargar o restaurar.** Hacé uno vos con `pg_dump` (o `supabase db dump`), por ejemplo una vez por semana, y guardalo cifrado y fuera de la PC (tiene datos personales). Los usuarios y contraseñas viven en `auth` (Supabase Auth), no en este dump: `perfiles` referencia `auth.users`, así que restaurarlo en otro proyecto exige crear antes los mismos usuarios:

  ```bash
  # Necesita pg_dump 17 (cliente de Postgres) y la cadena del Session pooler (o la directa).
  pg_dump "postgresql://postgres.iclsiweaqhupxvxbpekl:<CONTRASEÑA>@<host-del-pooler>:5432/postgres" \
    --schema=mgdetailing --data-only --format=custom --file=mgdetailing-2026-10-18.dump
  ```

  Para restaurar: aplicá las migraciones en la base vacía (así quedan RLS, `REVOKE` y el catálogo) y después `pg_restore --dbname "<cadena>" --data-only --disable-triggers mgdetailing-2026-10-18.dump` (vaciá antes `mgdetailing.servicios` y `mgdetailing.roles`, que la migración ya sembró). Corré los advisors al terminar.
- **Plan Pro**: backups diarios automáticos (7 días) en *Database > Backups*, y PITR como add-on. Igual conviene un `pg_dump` propio de vez en cuando.
- Un proyecto Free **se pausa tras una semana sin actividad**. Con el sitio en uso no pasa, pero si el panel muestra el proyecto pausado, se reactiva desde ahí (mientras tanto `/api/health` da `503`).

### Agenda

Contrato acordado con el frontend: `reportes/2026-10-22_08_agenda.md`.

- **Fecha de agenda** de un turno = `fechaConfirmada` si existe, si no `fechaPreferida`; lo mismo con la franja. El pedido original del cliente nunca se pisa.
- **Qué aparece**: `pendiente`, `confirmado` y `completado`; los `cancelado`, no. Orden: fecha de agenda, franja (`manana` antes que `tarde`) y orden de llegada (`seq`).
- **Rango de consulta**: `desde`..`hasta` inclusive, hasta 42 días (seis semanas).
- **Reprogramar** (`PATCH /api/admin/bookings/:id` con `fechaConfirmada` + `franjaConfirmada`): solo `admin`/`superadmin`; el turno no puede estar ni quedar `cancelado`/`completado`; la fecha va de hoy a hoy + 120 días, en hora de La Rioja (`fechaConfirmadaRange` en `domain/booking-dates.ts`). `null` en las dos = volver a la pedida. La condición "no cerrado" va en el mismo `UPDATE` (sin carreras con un cancelado simultáneo).
- **Sin cupos todavía**: la agenda no bloquea; cupos y días bloqueados son un objetivo posterior.
- Log: `Turno reprogramado id=... por=<uuid> fecha=<YYYY-MM-DD franja | la pedida> [estado=...]`; nunca datos del cliente.

### Catálogo editable

Contrato acordado con el frontend: `reportes/2026-10-22_07_catalogo-editable.md`. La tabla `mgdetailing.servicios` es la única fuente de verdad (la lista fija `SERVICIO_IDS` se retiró):

- **Landing**: `GET /api/servicios` (público) devuelve solo los activos, por `orden` y después por `id`, sin `activo`, `orden` ni `updatedAt`. Si la API falla, el frontend usa `frontend/src/data/servicios.ts` como respaldo.
- **Panel**: `GET /api/admin/servicios` (todos los roles) y, para `admin`/`superadmin`, `POST` (crear, queda al final), `PATCH /:id` (editar, activar/desactivar, destacar) y `PUT /orden` (reordenar). `empleado` recibe `403`.
- **Turnos**: `POST /api/bookings` acepta solo un `servicioId` que exista y esté **activo** en la base (si no, `400` en `fields.servicioId`; también con el honeypot, para no dar señales). El log del alta y el aviso al dueño usan el nombre del servicio de la base.
- **No se borran servicios** (no hay `DELETE`): se desactivan. El `id` (slug `^[a-z0-9]+(-[a-z0-9]+)*$`, hasta 64) no cambia después de crearlo; `orden` está reservado (es un segmento de ruta).
- **A lo sumo un destacado**: marcar uno desmarca al anterior en la misma transacción; el índice único parcial lo garantiza también en la base.
- **Un inactivo no puede ser el destacado**: desactivar el destacado lo desmarca en la misma operación (queda sin destacado hasta que se marque otro); destacar un inactivo, o desactivar y destacar en el mismo cambio, da `400` en `fields.destacado`. El CHECK `servicios_destacado_activo` lo garantiza también en la base.
- **Atomicidad**: crear, editar y reordenar corren en una transacción (`SqlClient.transaction`, una sola conexión del pool) que empieza con `pg_advisory_xact_lock(7340002)`: dos cambios simultáneos del catálogo se hacen de a uno. El reordenamiento guarda `orden = posición × 10` y solo cambia `updated_at` de los que se movieron.
- Logs: `Servicio creado id=... por=<uuid>`, `Servicio actualizado id=... por=... campos=...`, `Catálogo reordenado por=...`; nunca los textos.

## Conectar Supabase

El código ya está listo. El backend se conecta con el **rol dedicado `mgdetailing_app`** (mínimo privilegio, ver [Seguridad en la base](#seguridad-en-la-base-supabase)), **no** con `postgres`. El rol ya existe en el proyecto pero sin contraseña ni permiso de login: el paso 1 lo habilita. La contraseña **no** está en el repo; solo la tiene el dueño.

1. **Habilitá el rol del backend con una contraseña nueva.** Desde `backend/`:

   ```powershell
   npm run clave-db:dev
   ```

   Genera una contraseña aleatoria (segura dentro de una URL) y la sentencia `alter role mgdetailing_app with login password 'SCRAM-SHA-256$...';`. Guardá la contraseña en tu gestor de contraseñas y pegá **la sentencia** en el **SQL Editor** de Supabase. La sentencia lleva el **hash** SCRAM, no la contraseña: así la contraseña no queda en el historial del SQL Editor ni en los logs de Postgres (Supabase registra todo el DDL). **No** escribas `password 'la-contraseña'` en texto plano en el SQL Editor.

   Para revocar el acceso: `alter role mgdetailing_app nologin;` (o corré `clave-db` otra vez para rotarla). La contraseña de `postgres` **no** va en el `.env`: queda solo para migraciones y backups.

2. **Copiá el host del pooler.** Entrá a https://supabase.com/dashboard/project/iclsiweaqhupxvxbpekl, botón **Connect** (arriba), pestaña **Connection String**, tipo **URI**, **Session pooler**. De esa cadena solo necesitás el **host** (por ejemplo `aws-0-us-east-1.pooler.supabase.com`; el número y la región los da el panel, copialos de ahí). El usuario cambia: en vez de `postgres.iclsiweaqhupxvxbpekl` es `mgdetailing_app.iclsiweaqhupxvxbpekl` (rol + punto + id del proyecto, así lo pide el pooler para roles propios).

3. **Descargá el certificado de Supabase.** En **Database > Settings > SSL Configuration > Download certificate** se baja `prod-ca-2021.crt`. Guardalo como `backend/certs/supabase-ca.crt` (creá la carpeta `certs`). Es un certificado público, no un secreto. **Es obligatorio** para conectarse a Supabase, también desde tu PC: sin él el backend no arranca (protege la conexión de un intermediario). Opcional, para comprobarlo (Git Bash): `openssl x509 -in backend/certs/supabase-ca.crt -noout -subject -fingerprint -sha256` tiene que mostrar `CN = Supabase Root 2021 CA` y la huella `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

4. **Pegá la conexión y Supabase Auth en `backend/.env`** (está en `.gitignore`; nunca lo subas). Con tu host, la contraseña que te dio `clave-db` en el paso 1 y la **publishable key** (*Project Settings > API Keys*, empieza con `sb_publishable_`):

   ```
   DATABASE_URL=postgresql://mgdetailing_app.iclsiweaqhupxvxbpekl:LA-CONTRASEÑA-GENERADA@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   DATABASE_SSL_CA_FILE=./certs/supabase-ca.crt
   SUPABASE_URL=https://iclsiweaqhupxvxbpekl.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Si el backend no arranca y dice que la URL todavía tiene `[YOUR-PASSWORD]` o que no es válida, revisá este paso (el mensaje nunca muestra la URL). `Tenant or user not found` = el usuario no tiene el `.iclsiweaqhupxvxbpekl` o el host no es el del panel. Si al arrancar aparece el aviso *"conectado como postgres, un rol con privilegios de administrador"*, estás usando el usuario equivocado. `JWT_SECRET`, `DB_DRIVER` y `DB_PATH` ya no se usan: borralos.

5. **Creá tu usuario del panel** con Supabase Auth: ver [Alta de usuarios](#alta-de-usuarios-pasos-del-dueño) (cerrar el registro público, *Add user* con *Auto Confirm User* y la sentencia que te promueve a superadmin).

6. **Verificá.** Arrancá el backend (`npm run dev` en `backend/`, o `npm run dev` desde la raíz con el frontend). En la consola tiene que aparecer `Login del panel: Supabase Auth (https://iclsiweaqhupxvxbpekl.supabase.co)` y `Base de datos lista: Postgres ..., TLS verificado`. Después:

   ```powershell
   curl.exe http://localhost:4000/api/health
   # -> {"status":"ok"}
   ```

   Entrá a http://localhost:5173/admin con tu usuario, pedí un turno de prueba desde la landing y fijate que aparezca en el panel (y en Supabase: **Table Editor**, esquema `mgdetailing`, tabla `bookings`). Si `/api/health` responde `503`, Postgres no responde: revisá la contraseña, la conexión a internet y que el proyecto no esté pausado. Si el login responde `503`, el backend no llega a Supabase Auth (revisá `SUPABASE_URL`); si responde `403`, tu perfil no está activo (paso 3 de *Alta de usuarios*).

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

# Iniciar sesión (guarda las cookies mg_at y mg_rt en cookies.txt)
curl -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dueno@ejemplo.com","password":"una clave larga y unica"}'
# -> 200 {"usuario":{"id":"<uuid>","email":"dueno@ejemplo.com","nombre":null,"rol":"superadmin"}}

# Quién soy (si el access token venció, se refresca solo y reescribe las cookies)
curl -b cookies.txt -c cookies.txt http://localhost:4000/api/auth/me

# Renovar la sesión cuando /api/admin responde 401 SESSION_EXPIRED
curl -b cookies.txt -c cookies.txt -X POST http://localhost:4000/api/auth/refresh -H "Content-Type: application/json"

# Usuarios (solo superadmin)
curl -b cookies.txt http://localhost:4000/api/admin/usuarios
curl -b cookies.txt -X PATCH http://localhost:4000/api/admin/usuarios/<id> \
  -H "Content-Type: application/json" -d '{"rol":"empleado","activo":true,"nombre":"Lucía"}'

# Listar turnos (más nuevos primero), con filtro y paginación
curl -b cookies.txt "http://localhost:4000/api/admin/bookings?estado=pendiente&limit=20&offset=0"

# Cambiar el estado de un turno
curl -b cookies.txt -X PATCH http://localhost:4000/api/admin/bookings/<id> \
  -H "Content-Type: application/json" -d '{"estado":"confirmado"}'

# Confirmar para otra fecha (admin y superadmin); null en las dos = volver a la pedida
curl -b cookies.txt -X PATCH http://localhost:4000/api/admin/bookings/<id> \
  -H "Content-Type: application/json" -d '{"estado":"confirmado","fechaConfirmada":"2026-10-24","franjaConfirmada":"tarde"}'

# Agenda de una semana (lunes a domingo; hasta 42 días)
curl -b cookies.txt "http://localhost:4000/api/admin/agenda?desde=2026-10-19&hasta=2026-10-25"
# -> 200 {"turnos":[{...mismo objeto Turno que /api/admin/bookings...}]}

# Borrar un turno (aunque no lleve body, exige el Content-Type)
curl -b cookies.txt -X DELETE http://localhost:4000/api/admin/bookings/<id> \
  -H "Content-Type: application/json"

# Catálogo público (lo que muestra la landing: solo los activos)
curl http://localhost:4000/api/servicios

# Catálogo en el panel (todos los roles; incluye inactivos, orden y updatedAt)
curl -b cookies.txt http://localhost:4000/api/admin/servicios

# Crear un servicio (admin y superadmin; queda al final del orden)
curl -b cookies.txt -X POST http://localhost:4000/api/admin/servicios \
  -H "Content-Type: application/json" \
  -d '{"id":"tratamiento-ceramico","nombre":"Tratamiento cerámico","resumen":"Protección de larga duración.",
       "descripcion":"Aplicamos una capa cerámica sobre la pintura.","incluye":["Lavado","Descontaminación"],
       "glosario":[{"termino":"Cerámico","significado":"un recubrimiento duro y brillante."}],
       "duracion":"1 día","precioDesde":150000}'
# -> 201 {"servicio":{"id":"tratamiento-ceramico",...,"destacado":false,"activo":true,"orden":60,"updatedAt":"..."}}

# Editar: precio y destacarlo (desmarca al anterior), o desactivarlo
curl -b cookies.txt -X PATCH http://localhost:4000/api/admin/servicios/pulido \
  -H "Content-Type: application/json" -d '{"precioDesde":85000,"destacado":true}'
curl -b cookies.txt -X PATCH http://localhost:4000/api/admin/servicios/encerado \
  -H "Content-Type: application/json" -d '{"activo":false}'

# Reordenar (todos los ids, sin repetir, en el orden nuevo)
curl -b cookies.txt -X PUT http://localhost:4000/api/admin/servicios/orden \
  -H "Content-Type: application/json" \
  -d '{"ids":["pulido","lavado-premium","lavado-basico","encerado","restauracion-opticas"]}'

# Cerrar sesión
curl -b cookies.txt -c cookies.txt -X POST http://localhost:4000/api/auth/logout \
  -H "Content-Type: application/json"
```

## Contrato de la API

Esta sección es la referencia para el frontend. Todo viaja como JSON; las fechas de auditoría son ISO 8601 en UTC.

### Reglas generales

- **`POST`, `PATCH` y `DELETE` (y `PUT`) exigen `Content-Type: application/json` aunque no lleven body** (por ejemplo `logout` y `delete`); si no, responden `415`. Un body vacío se acepta en esos casos. El body se interpreta como UTF-8.
- **Si el pedido trae cabecera `Origin`, tiene que coincidir exactamente con uno de los `FRONTEND_ORIGIN`**; si no, `403 FORBIDDEN_ORIGIN`. Los navegadores la mandan solos. Los clientes sin `Origin` (curl, scripts) se aceptan.
- Con `fetch` hay que enviar las cookies: `credentials: "include"` (o `same-origin` si se usa el proxy de Vite / `SERVE_FRONTEND`). El JS nunca ve los tokens: son cookies httpOnly.
- Body máximo: **10 kb**. Los objetos de entrada son estrictos: **un campo desconocido se rechaza** con `400`.
- Las respuestas de `/api` llevan `Cache-Control: no-store`.
- Una ruta `/api/...` que no existe responde `404 NOT_FOUND` en JSON. Todo lo que cuelga de `/api/admin` pide sesión primero (`401`), exista o no la ruta.
- **Sesión del panel**: ante un `401 SESSION_EXPIRED` en `/api/admin/*`, llamá **una vez** a `POST /api/auth/refresh` y, si responde `200`, reintentá el pedido original; si responde `401` o `403 NO_ACCESS`, mandá al login. Un `403 FORBIDDEN` es solo "tu rol no puede hacer esto": la sesión sigue. Ante `401 UNAUTHORIZED` o `403 FORBIDDEN` con `message` de "no tiene acceso al panel", la sesión terminó: al login. Un `403 FORBIDDEN` de permisos (rol insuficiente) **no** cierra la sesión: mostrá el mensaje.

### Enums exactos

| Campo | Valores |
|---|---|
| `vehiculoTipo` | `"auto"`, `"camioneta"`, `"moto"` |
| `servicioId` | **Ya no es un enum fijo**: el `id` de un servicio del catálogo (`GET /api/servicios`). Los iniciales: `"lavado-basico"`, `"lavado-premium"`, `"pulido"`, `"encerado"`, `"restauracion-opticas"`. |
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
| `UNAUTHORIZED` | 401 | No hay sesión, el token es inválido, la sesión se cerró (logout, revocada en Supabase) o el refresh token ya no sirve. |
| `SESSION_EXPIRED` | 401 | El access token venció en un pedido a `/api/admin/*`: llamar a `POST /api/auth/refresh` y reintentar una vez. |
| `INVALID_CREDENTIALS` | 401 | Email o contraseña incorrectos (mensaje genérico: no dice cuál). |
| `FORBIDDEN_ORIGIN` | 403 | `Origin` no permitido. |
| `FORBIDDEN` | 403 | El rol no permite la acción (la sesión sigue). Mensaje en español apto para mostrar. |
| `NO_ACCESS` | 403 | La sesión es válida pero el usuario ya no tiene acceso al panel (desactivado o sin perfil): se borran las cookies y hay que volver al ingreso. |
| `NOT_FOUND` | 404 | Ruta inexistente, o turno / usuario / servicio inexistente (un id con formato inválido también da 404). |
| `CONFLICT` | 409 | Gestión de usuarios: cambiarte tu propio rol, desactivarte, o dejar el sistema sin ningún superadmin activo. |
| `SERVICIO_EXISTE` | 409 | `POST /api/admin/servicios` con un `id` que ya existe (activo o no). Trae `fields.id`. |
| `PAYLOAD_TOO_LARGE` | 413 | Body de más de 10 kb. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Falta `Content-Type: application/json` o el body viene comprimido. |
| `RATE_LIMITED` | 429 | Demasiados pedidos (los del backend traen `Retry-After` en segundos). También si Supabase Auth limita los logins. |
| `INTERNAL_ERROR` | 500 | Error inesperado (el detalle queda solo en el log del servidor). |
| `SERVICE_UNAVAILABLE` | 503 | `/api/health` si la base de datos no responde; login / sesión si Supabase Auth no responde. |

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
| `servicioId` | sí | `id` de un servicio que exista y esté **activo** en el catálogo (`GET /api/servicios`). Si no: `400` con `fields.servicioId` = *"Elegí un servicio de la lista."* |
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

### Usuario de la sesión (objeto `usuario`)

**Cambio de contrato:** antes `/api/auth/login` y `/api/auth/me` devolvían `{ "admin": { "email": "..." } }`. Ahora devuelven:

```json
{ "usuario": { "id": "5f0c2a3e-9b1d-4c7e-8a55-2d3f1e6b7a90", "email": "dueno@ejemplo.com", "nombre": "Mateo", "rol": "superadmin" } }
```

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `string` (UUID) | Id del usuario en Supabase Auth. |
| `email` | `string \| null` | En minúsculas. |
| `nombre` | `string \| null` | Lo pone un superadmin; `null` si no tiene. |
| `rol` | `"superadmin" \| "admin" \| "empleado"` | Para mostrar u ocultar botones; la API igual valida cada acción. |

### `POST /api/auth/login`

Body `{ "email": string, "password": string }` (estricto; `password` hasta 128 caracteres). `200 { "usuario": { id, email, nombre, rol } }` y las cookies de sesión. Errores: `401 INVALID_CREDENTIALS` con un único mensaje genérico (*"El email o la contraseña no son correctos, o tu usuario todavía no está habilitado para el panel."*) para contraseña incorrecta, email inexistente o sin confirmar **y también para un usuario sin perfil o inactivo**: así el login no confirma que la contraseña de un usuario inactivo es correcta (la sesión que Supabase abrió se cierra en segundo plano), `400 VALIDATION_ERROR`, `429 RATE_LIMITED`, `503 SERVICE_UNAVAILABLE` (Supabase Auth no responde). Límite: **5 intentos fallidos por IP cada 15 minutos** (`429`; los logins correctos no cuentan).

Cookies (el JS de la página no puede leerlas: para saber si hay sesión, llamar a `GET /api/auth/me`):

| Cookie | Contenido | Atributos |
|---|---|---|
| `mg_at` | access token de Supabase (JWT) | `HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800` y `Secure` en producción |
| `mg_rt` | refresh token de Supabase (rota en cada uso) | `HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=28800` y `Secure` en producción |

### `POST /api/auth/refresh`

Sin body (pero con `Content-Type: application/json`). Canjea el refresh token: `200 { "usuario": {...} }` y cookies nuevas; `401 UNAUTHORIZED` (sin refresh token, revocado o reutilizado; borra las cookies); `403 NO_ACCESS` (el usuario fue desactivado; borra las cookies).

### `POST /api/auth/logout`

`204` sin body. Cierra la sesión en Supabase y borra las dos cookies. Siempre responde `204`, haya o no sesión.

### `GET /api/auth/me`

`200 { "usuario": { id, email, nombre, rol } }`, `401 UNAUTHORIZED` o `403 NO_ACCESS`. Si el access token venció, refresca solo (acá sí viaja el refresh token) y reescribe las cookies.

### `GET /api/admin/bookings?estado=&limit=&offset=` (requiere sesión; todos los roles)

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
      "fechaConfirmada": null,
      "franjaConfirmada": null,
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

**`fechaConfirmada`** (`"YYYY-MM-DD" | null`) y **`franjaConfirmada`** (`"manana" | "tarde" | null`): la fecha y franja que confirmó el taller, si difieren de las pedidas. Van siempre juntas: las dos `null` (se confirmó, o se confirmará, para `fechaPreferida`/`franja`) o las dos con valor. **Fecha de agenda** = la confirmada si existe, si no la pedida (también para el mensaje de WhatsApp).

**`telefonoWhatsapp`** (`string | null`): el teléfono listo para `https://wa.me/<telefonoWhatsapp>`, solo dígitos y en formato internacional. Se calcula al leer (no es una columna) con `libphonenumber-js`, país por defecto Argentina: los celulares argentinos salen como `549` + 10 dígitos aunque el cliente no haya escrito el `0`, el `15` ni el `9` (`0380 15-4123456`, `380 4123456` y `+54 9 380 412-3456` dan `5493804123456`); un número válido de otro país va en E.164 sin `+` (`+1 415 555 2671` => `14155552671`). Si no se puede interpretar, es `null`: **nunca se rechaza un turno por eso**, así que el frontend tiene que manejar el `null` (mostrar el teléfono sin botón de WhatsApp).

### `PATCH /api/admin/bookings/:id` (requiere sesión)

Body estricto con **al menos uno** de: `estado`, o la pareja `fechaConfirmada` + `franjaConfirmada` (**juntas**; `null` las dos = volver a la fecha pedida).

```json
{ "estado": "confirmado", "fechaConfirmada": "2026-10-24", "franjaConfirmada": "tarde" }
```

`200 { "booking": { ...mismo objeto que el listado... } }`. `404 NOT_FOUND` si no existe.

- **Solo `estado`** (las reglas de siempre): `400` con `fields.estado` si es inválido. **`empleado` solo puede pasar a `completado`**: cualquier otro estado da `403 FORBIDDEN` (*"Con tu rol solo podés marcar los turnos como completados."*); `admin` y `superadmin`, a cualquiera. No toca la fecha confirmada.
- **Con fecha y franja** (reprogramar; si viene `estado`, se cambia en la misma escritura): solo `admin` y `superadmin`; `empleado` => `403 FORBIDDEN` (*"Con tu rol no podés cambiar la fecha de un turno."*). El turno no puede estar `cancelado` ni `completado`, ni pasar a uno de esos en el mismo pedido => `400 VALIDATION_ERROR` sin `fields` (*"No se puede cambiar la fecha de un turno cancelado o completado."*). Fecha inexistente, con otro formato, anterior a hoy o posterior a hoy + 120 días (hora de La Rioja) => `400` con `fields.fechaConfirmada`. Franja inválida => `fields.franjaConfirmada`.
- Falta una de las dos, o una es `null` y la otra no => `400` en el campo que falta (o en el que es `null`). Body vacío => `400` con `fields.estado`.

### `GET /api/admin/agenda?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` (requiere sesión; todos los roles)

| Parámetro | Regla |
|---|---|
| `desde` | Obligatorio. Fecha `YYYY-MM-DD` existente. |
| `hasta` | Obligatorio. Fecha `YYYY-MM-DD` existente, `>= desde`, y el rango inclusivo abarca **a lo sumo 42 días** (`desde` + 41). |

`200 { "turnos": Turno[] }` (el mismo objeto que `/api/admin/bookings`): los **no cancelados** cuya fecha de agenda (`fechaConfirmada ?? fechaPreferida`) cae en el rango, ordenados por fecha de agenda, franja de agenda (`manana` antes que `tarde`) y orden de llegada. Sin paginación. `400 VALIDATION_ERROR` con `fields.desde` / `fields.hasta` si faltan, tienen mal formato (también repetidos) o el rango es inválido (el error de rango va en `hasta`). Los parámetros desconocidos se ignoran, como en el listado.

### `DELETE /api/admin/bookings/:id` (requiere sesión; solo `admin` y `superadmin`)

`204` sin body. `404 NOT_FOUND` si no existe. `403 FORBIDDEN` para `empleado` (*"Con tu rol no podés borrar turnos."*). Exige `Content-Type: application/json` aunque no lleve body.

### `GET /api/admin/usuarios` (solo `superadmin`)

`200`, los más viejos primero. `403 FORBIDDEN` (*"Solo un superadmin puede gestionar usuarios."*) para los otros roles.

```json
{
  "usuarios": [
    {
      "id": "5f0c2a3e-9b1d-4c7e-8a55-2d3f1e6b7a90",
      "email": "lucia@ejemplo.com",
      "nombre": "Lucía",
      "rol": "empleado",
      "activo": true,
      "createdAt": "2026-10-18T15:00:00.000Z",
      "updatedAt": "2026-10-18T15:00:00.000Z"
    }
  ]
}
```

`email` y `nombre` pueden ser `null`. La respuesta trae además `"gestionCuentas": true | false`: `false` significa que falta `SUPABASE_SECRET_KEY` y no están disponibles el alta, la baja ni el cambio de email o contraseña. Los usuarios creados directamente en Supabase aparecen como `empleado` con `activo: false` hasta que un superadmin los active.

### `POST /api/admin/usuarios` (solo `superadmin`)

Body estricto: `email` (hasta 120 caracteres; se guarda en minúsculas), `password` (8 a 72 caracteres, máx. 72 bytes), `nombre` (opcional, como en el PATCH), `rol` y `activo`. Crea el usuario en Supabase Auth con el email confirmado y devuelve `201 { "usuario": { ... } }`. Errores: `400 VALIDATION_ERROR` (con `fields`; también si Supabase rechaza la contraseña por débil), `409 CONFLICT` (*"Ya existe un usuario con ese email."*), `503 SERVICE_UNAVAILABLE` (falta `SUPABASE_SECRET_KEY` o Supabase no responde), `429 RATE_LIMITED` (Supabase limitó los pedidos).

### `PATCH /api/admin/usuarios/:id` (solo `superadmin`)

Body estricto con al menos uno de: `rol` (`"superadmin" | "admin" | "empleado"`), `activo` (`boolean`), `nombre` (`string` de hasta 80 caracteres, una línea; `null` o `""` lo borran), `email` y `password` (mismas reglas que en el alta; se cambian en Supabase Auth y necesitan `SUPABASE_SECRET_KEY`). `200 { "usuario": { ...mismo objeto que el listado... } }`. Errores: `400 VALIDATION_ERROR` (campo desconocido, tipo inválido o body vacío), `404 NOT_FOUND` (usuario inexistente o id que no es UUID), `409 CONFLICT` (cambiar tu propio rol, desactivarte, dejar el sistema sin ningún superadmin activo o un email que ya usa otro), `403 FORBIDDEN` si no sos superadmin, `503` como en el alta. El cambio tiene efecto inmediato: el usuario afectado lo nota en su próximo pedido. Cambiar la contraseña no cierra las sesiones abiertas de esa persona: para cortarle el acceso, desactivala.

### `DELETE /api/admin/usuarios/:id` (solo `superadmin`)

`204` sin body. Borra el usuario de Supabase Auth; su perfil y sus sesiones se borran en cascada (si tenía una sesión abierta, su siguiente pedido recibe `403 NO_ACCESS`). Errores: `404 NOT_FOUND`, `409 CONFLICT` (*"No podés eliminar tu propio usuario."*), `403 FORBIDDEN` si no sos superadmin, `503` como en el alta. No se puede deshacer: si solo querés sacarle el acceso, desactivalo.

### Objeto `Servicio` (catálogo)

| Campo | Tipo | Regla | Público | Panel |
|---|---|---|---|---|
| `id` | `string` | slug `^[a-z0-9]+(-[a-z0-9]+)*$`, 1 a 64. Inmutable. `orden` está reservado. | sí | sí |
| `nombre` | `string` | trim, 1 a 80, una línea | sí | sí |
| `resumen` | `string` | trim, 1 a 200, una línea | sí | sí |
| `descripcion` | `string` | trim, 1 a 1500 (admite saltos de línea y tabs) | sí | sí |
| `incluye` | `string[]` | 0 a 15 ítems, cada uno trim 1 a 120 | sí | sí |
| `glosario` | `{ termino, significado }[]` | 0 a 10; `termino` 1 a 60, `significado` 1 a 300 (objetos estrictos) | sí | sí |
| `duracion` | `string \| null` | trim, hasta 60; `""` => `null` | sí | sí |
| `precioDesde` | `number \| null` | entero en ARS, 0 a 99.999.999; `null` = "Consultá" | sí | sí |
| `destacado` | `boolean` | a lo sumo uno en `true` | sí | sí |
| `activo` | `boolean` | | no | sí |
| `orden` | `integer` | menor primero (lo asigna el servidor) | no | sí |
| `updatedAt` | `string` (ISO 8601) | | no | sí |

Las respuestas traen **exactamente** estos campos (el público, solo los marcados "Público"; nunca `createdAt`). Higiene de texto igual que en los turnos: los controles bidireccionales se quitan y los de control (C0/C1) se rechazan.

### `GET /api/servicios` (público)

`200 { "servicios": ServicioPublico[] }`: solo los activos, por `orden` y después por `id`.

### `GET /api/admin/servicios` (requiere sesión; todos los roles)

`200 { "servicios": Servicio[] }`: todos (activos e inactivos), mismo orden.

### `POST /api/admin/servicios` (solo `admin` y `superadmin`)

Body estricto: `id`, `nombre`, `resumen`, `descripcion` obligatorios; `incluye` (default `[]`), `glosario` (default `[]`), `duracion` (default `null`), `precioDesde` (default `null`), `destacado` (default `false`), `activo` (default `true`). `orden` no se manda (`400`): queda al final. Si viene `destacado: true`, desmarca al anterior (con `activo: false` a la vez, `400` en `fields.destacado`). `201 { "servicio": Servicio }`. Errores: `400 VALIDATION_ERROR` con `fields` (en las listas la clave lleva la posición: `incluye.1`, `glosario.0.termino`), `409 SERVICIO_EXISTE`, `403 FORBIDDEN` para `empleado` (*"Con tu rol solo podés ver el catálogo de servicios."*).

### `PATCH /api/admin/servicios/:id` (solo `admin` y `superadmin`)

Body estricto con al menos uno de: `nombre`, `resumen`, `descripcion`, `incluye`, `glosario`, `duracion`, `precioDesde`, `destacado`, `activo` (mismas reglas; `null` en `duracion` o `precioDesde` los borra). `activo: false` también desmarca el destacado; `destacado: true` sobre un servicio que queda inactivo (ya lo estaba o se desactiva en el mismo body) da `400` en `fields.destacado` (*"No se puede destacar un servicio inactivo. Activalo primero."*). El `id` no se puede cambiar: si viene en el body, `400`. `200 { "servicio": Servicio }`. Errores: `404 NOT_FOUND` (no existe, o el id no tiene formato de slug), `400` (campo desconocido, tipo inválido o body vacío), `403 FORBIDDEN` para `empleado`.

### `PUT /api/admin/servicios/orden` (solo `admin` y `superadmin`)

Body estricto `{ "ids": string[] }` con **todos** los ids del catálogo (activos e inactivos), sin repetir, en el orden nuevo. Se guarda `orden = posición × 10` (10, 20, 30...) en una transacción. `200 { "servicios": Servicio[] }` (el catálogo completo, ya ordenado). `400 VALIDATION_ERROR` con `fields.ids` si faltan, sobran o se repiten ids; `403 FORBIDDEN` para `empleado`. Pasa por el mismo control CSRF que `POST`/`PATCH`/`DELETE` (`Origin` + `Content-Type`).

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

Un **solo proceso Node** con `SERVE_FRONTEND=true` (la API y la landing/panel en el **mismo origen**), detrás de **HTTPS**: Caddy en un VPS (proxy inverso a `127.0.0.1:4000`, certificados automáticos) o un PaaS. No hace falta volumen persistente: los datos y los usuarios viven en Supabase.

```
navegador --HTTPS--> Caddy / PaaS --HTTP--> node dist/index.js (API + estáticos del frontend)
                                                  |
                                                  +--TLS--> Postgres en Supabase (Session pooler, esquema mgdetailing)
                                                  +--HTTPS--> Supabase Auth (/auth/v1: token, logout, JWKS)
```

Con mismo origen no hay CORS de por medio, las cookies `SameSite=Strict` funcionan sin vueltas y el `Origin` que manda el navegador es el propio dominio. El build del frontend (`frontend/dist`) tiene que existir antes de arrancar con `SERVE_FRONTEND=true`; si no, el servidor no arranca y lo explica. Los estáticos se sirven comprimidos (gzip) y con caché larga para `/assets` (un año; nombres con hash); la API nunca se comprime. Las fotos de `/fotos` se cachean 7 días **y no llevan hash en el nombre: al reemplazar una foto hay que cambiarle el nombre** (por ejemplo `taller-2.jpg` en vez de `taller.jpg`), o los visitantes seguirán viendo la vieja hasta una semana. La CSP de la SPA es estricta: todo del mismo origen, sin scripts ni estilos inline, fuentes autoalojadas, sin iframes. Si el frontend pasa a cargar algo de otro dominio, hay que agregarlo a propósito en `src/middleware/security.ts`.

### Variables en producción

| Variable | Qué poner |
|---|---|
| `NODE_ENV` | `production`. |
| `FRONTEND_ORIGIN` | **Igual al origen público exacto** que ve el navegador, con esquema y sin barra final: `https://mgdetailing.com.ar`. Si no coincide, los `POST/PATCH/DELETE` dan `403`. Si el sitio responde en `www` y sin `www`, listá los dos separados por coma. |
| `SUPABASE_URL` | `https://iclsiweaqhupxvxbpekl.supabase.co`. |
| `SUPABASE_PUBLISHABLE_KEY` | La publishable key (`sb_publishable_...`). Nunca la secret key. |
| `SUPABASE_SECRET_KEY` | La secret key (`sb_secret_...`), para que el superadmin gestione usuarios desde el panel. **Secreto**: solo en el entorno del servidor, nunca en el repo ni en el frontend. |
| `HOST` | Con Caddy/nginx en la misma máquina dejá el default `127.0.0.1`. **En un PaaS o en Docker poné `0.0.0.0`**, si no la plataforma no llega al proceso. |
| `PORT` | El que indique la plataforma (muchos PaaS lo inyectan). |
| `TRUST_PROXY` | Con Caddy/nginx **en la misma máquina**: `loopback` (y `HOST=127.0.0.1`), así solo se cree el `X-Forwarded-For` que llega del proxy local. En un PaaS: `1` (el balanceador de la plataforma), siempre que el proceso no sea alcanzable sin pasar por él. Sin esto, el rate limit ve la IP del proxy y **todos los visitantes comparten el mismo cupo**; con un número y el puerto de Node expuesto a Internet, cualquiera puede conectarse directo, inventar su `X-Forwarded-For` y saltear el rate limit. |
| `DATABASE_URL` | La cadena del Session pooler con la contraseña, en el gestor de secretos de la plataforma (nunca en el repo). |
| `DATABASE_SSL_CA_FILE` | Ruta al certificado raíz de Supabase (obligatoria). |
| `SERVE_FRONTEND` | `true` para el despliegue de un solo proceso. |

### Límites conocidos

- **El rate limit vive en la memoria del proceso**: se reinicia con cada arranque y no se comparte entre instancias. Con Postgres la base ya admite varias réplicas del backend, pero cada una tendría su propio cupo de rate limit: para escalar horizontalmente hace falta un store compartido (Redis o la misma Postgres). Hoy una sola instancia sobra.
- Cada instancia abre hasta 5 conexiones (pool). El Session pooler de Supabase tiene un cupo de conexiones compartido por todo el proyecto (según el plan): no subas `max` sin mirarlo.
- La latencia a Supabase depende de la región (el proyecto está en AWS us-east-1): del orden de 150-250 ms por consulta desde Argentina, y un pedido hace una o dos. Para un formulario y un panel es aceptable; si se notara, conviene desplegar el backend cerca de la base.
- Las sesiones son de Supabase Auth: reiniciar el servidor **no** las cierra. Cada request a `/api/admin` hace una consulta más (perfil + sesión, en una sola query) y la verificación del token es local (el JWKS se cachea 10 min).
- **Todos los logins salen de la IP del servidor** hacia Supabase Auth, que tiene sus propios límites por IP. Para un taller sobra; si se notaran `429` en el login, revisá *Authentication > Rate Limits* en el panel de Supabase.

### Backup

Ver [Backups (Supabase)](#backups-supabase).

### Alta de usuarios en producción

Igual que en desarrollo: los usuarios se crean en el panel de Supabase y se activan desde el panel web (el primer superadmin, con la sentencia SQL). Ver [Alta de usuarios](#alta-de-usuarios-pasos-del-dueño). No hace falta ningún script ni acceso a la consola del servidor.

### Glosario

- **Booking** = turno / solicitud de turno. El dominio y la API están en español como el contrato (`turno`, `servicioId`, `franja`, `estado`...); el código técnico (clases, rutas internas, nombres de archivos de infraestructura) está en inglés.
- **Nombres en la base** (snake_case): las tablas técnicas en inglés como el código (`bookings`); las del panel en español (`roles`, `perfiles`); las columnas de negocio en español como el contrato (`nombre`, `telefono`, `vehiculo_tipo`, `fecha_preferida`, `franja`, `estado`) y las técnicas en inglés (`id`, `seq`, `created_at`, `updated_at`). `servicios` va en español porque es el catálogo del negocio y coincide con `domain/servicios.ts` y `servicioId`. `duracion_estimada` y `precio_desde` salen por la API como `duracion` y `precioDesde`. Los repositorios traducen a camelCase (`servicio_id` -> `servicioId`).
- **`mgdetailing`** = esquema propio de la app en Postgres (no expuesto por la Data API de Supabase).
- **Honeypot** = campo trampa `website` que solo completan los bots.
- **Repositorio** = capa de acceso a datos detrás de una interfaz (`src/domain/`); la implementación es Postgres (`src/repositories/postgres/`).
- **Perfil** = fila de `mgdetailing.perfiles`: rol y si el usuario de Supabase Auth puede entrar al panel.
- **BFF** (*backend for frontend*) = el backend media todo lo de Supabase; el navegador solo habla con `/api`.

## Seguridad

- **Contraseñas y sesiones**: las maneja **Supabase Auth** (el backend no guarda contraseñas). El backend verifica cada access token con `jose` contra el JWKS del proyecto con el algoritmo (**ES256**), emisor, audiencia y vencimiento **fijados**; exige `sub`/`session_id` UUID, `role = authenticated` y no anónimo. Los tokens viajan solo en cookies `HttpOnly; SameSite=Strict` (`Secure` en producción); el refresh token solo a `/api/auth`. Cada request comprueba en la base que la sesión siga en `auth.sessions` y que el perfil esté activo: **logout, desactivación y cambio de rol son inmediatos**.
- **Autorización**: por rol en el backend (`domain/permisos.ts`), no en la UI. Usuarios nuevos nacen inactivos.
- **CSRF**: `SameSite=Strict` + chequeo de `Origin` + `Content-Type: application/json` obligatorio en métodos que modifican.
- **Rate limits**: general por IP, 5 turnos / 15 min, 5 logins fallidos / 15 min (más los límites propios de Supabase Auth).
- **Entrada**: zod estricto (rechaza campos desconocidos), body máximo de 10 kb, sin cuerpos comprimidos. SQL siempre parametrizado (`$1, $2...`), y una regla de ESLint prohíbe construir SQL con interpolación o concatenación en `query()` y `exec()`.
- **Cabeceras**: helmet (CSP, HSTS en producción, `nosniff`, `X-Frame-Options: DENY`...), `Permissions-Policy`, `Cache-Control: no-store` en la API. El panel (`/admin`) lleva `X-Robots-Tag: noindex, nofollow`. Con `SERVE_FRONTEND`, lo que cuelga de `/assets`, `/fotos` y `/marca` y no existe da 404 (nunca el HTML de la SPA), igual que los dotfiles.
- **Datos personales**: nunca se escriben en los logs (una línea por request: método, ruta sin query, status y milisegundos; al crear un turno solo `id + servicio + fecha`; el aviso de WhatsApp solo `id` y status; login y gestión de usuarios solo ids de usuario, nunca emails ni tokens). Al borrar un turno, la fila queda en disco hasta que `autovacuum` reutiliza el espacio.
- **Base de datos (Postgres)**: esquemas `mgdetailing` y `mgdetailing_private` no expuestos por la Data API, RLS en todas las tablas con policies solo para `mgdetailing_app`, `REVOKE` a `anon`/`authenticated`/`service_role`, TLS con verificación del certificado de Supabase, contraseña solo en `DATABASE_URL` (nunca en logs ni errores). Ver [Seguridad en la base](#seguridad-en-la-base-supabase).
- **Errores**: formato único, sin stack traces ni detalles internos.
- **Quien muestre estos datos debe escaparlos** (React lo hace por defecto): nunca `innerHTML` / `dangerouslySetInnerHTML` con nombre, modelo o comentario.

## Estructura del proyecto

```
backend/
  src/
    index.ts            arranque, listen y apagado prolijo (SIGINT/SIGTERM)
    app.ts              createApp(): arma Express sin escuchar (recibe repositorios + checkDatabase; lo usan los tests)
    config.ts           lee .env y valida la configuración con zod
    domain/             tipos del negocio, reglas (permisos por rol) e interfaces async de los repositorios
    repositories/       fábrica de repositorios
      postgres/         implementación Postgres (turnos, perfiles, servicios; SQL con $1...)
    services/           casos de uso con lógica (sesiones con Supabase Auth, usuarios, alta de turno, agenda y reprogramación, catálogo)
    routes/             rutas HTTP (health, bookings, servicios, auth, admin/bookings, admin/agenda, admin/usuarios, admin/servicios)
    notifications/      avisos de WhatsApp al dueño (CallMeBot, Cloud API) y formato del mensaje
    middleware/         seguridad, CSRF, rate limit, errores, logger, estáticos
    schemas/            validación de entrada con zod
    db/                 database.ts (abre la base), postgres.ts (pool, TLS, verificación del esquema), rows.ts
    lib/                utilidades: errores, logger, fechas, cookies, cliente de Supabase Auth, verificación de JWT
    scripts/            clave-db (contraseña del rol mgdetailing_app)
  supabase/migrations/  migraciones de Postgres (fuente de verdad del esquema en Supabase)
  test/                 vitest + supertest (Postgres en memoria con PGlite y un Supabase Auth falso)
```

## Scripts y tests

| Comando | Qué hace |
|---|---|
| `npm run dev` | Desarrollo con recarga (`tsx watch`). |
| `npm run build` | Compila a `dist/` con `tsc`. |
| `npm start` | `node dist/index.js`. |
| `npm run clave-db:dev` / `npm run clave-db` | Genera la contraseña del rol `mgdetailing_app` y el `ALTER ROLE` con hash SCRAM para pegar en Supabase. |
| `npm test` | Tests (vitest + supertest). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint (typescript-eslint estricto). |

Los tests usan un reloj fijo, **PGlite** (Postgres compilado a WebAssembly, en memoria, sin servidor) con **las mismas migraciones** de `supabase/migrations/`, y un **Supabase Auth falso** (`test/supabase-fake.ts`): un par de claves ES256 generado en el test sirve como JWKS local y un `fetch` inyectado responde `/token` (password y refresh con rotación y detección de reuso) y `/logout`, guardando las sesiones en `auth.sessions` de PGlite. La app habla con la base como `mgdetailing_app`, igual que en producción.

- `auth.test.ts`: login, cookies, credenciales inválidas, usuario inactivo o sin perfil, Supabase caído o limitando, refresh, refresh reutilizado, logout (el token viejo deja de servir), tokens manipulados (otra clave, HS256, `none`, `iss`/`aud` ajenos, anónimo, sesión inexistente), vencido sin refresh, desactivación y cambio de rol con la sesión abierta.
- `usuarios.test.ts`: matriz de roles sobre los turnos y gestión de usuarios (listar, activar, no degradarse, nunca sin superadmin, validación).
- `postgres.test.ts`: RLS y privilegios de `anon`/`authenticated`/`service_role` y de `mgdetailing_app`, trigger de `auth.users`, CHECK y `updated_at`, CHECK de la agenda (fecha y franja confirmadas juntas) e índice `bookings_agenda_idx`, verificación del esquema y `/api/health` con Postgres caído.
- `repositories.contract.test.ts`: turnos (incluida la agenda y la reprogramación, con `TurnoCerradoError`), perfiles y servicios (backfill, alta al final, id repetido, destacado único, edición parcial, reordenamiento y CHECK de la base) sobre Postgres como `mgdetailing_app`.
- `agenda.test.ts`: `GET /api/admin/agenda` (roles, campos exactos, orden fecha/franja/llegada, sin cancelados, rango inclusivo, tope de 42 días, validaciones, fin de mes y de año, bisiesto) y `PATCH` con fecha/franja confirmadas (permisos, "juntas", rango hoy a hoy + 120 en hora de La Rioja, turnos cerrados, volver a la pedida, turno viejo que conserva su fecha).
- `servicios.test.ts`: API del catálogo (público y panel con los campos exactos, permisos por rol con `empleado` 403, validaciones 400, id reservado, caracteres de control, `409 SERVICIO_EXISTE`, 404, destacado único, orden, CSRF en `PUT`) y turnos contra la base (servicio inactivo, nuevo o renombrado).

No hace falta internet ni ninguna clave de Supabase para correr los tests: ninguno hace requests reales. Un test adicional falla si algún fuente contiene caracteres invisibles escritos literalmente (ataque "Trojan Source").
