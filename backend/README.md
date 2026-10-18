# MgDetailing - backend

API REST de MgDetailing, taller de detailing de autos en La Rioja, Argentina. Hace tres cosas:

1. Recibe **solicitudes de turno** desde la landing (público, con anti-spam).
2. **Autentica** al dueño del taller (sesión con cookie httpOnly).
3. Le permite **gestionar** esas solicitudes desde el panel `/admin` (listar, filtrar, cambiar el estado, borrar).

Stack: Node 24 + TypeScript (strict, ESM) + Express 5, **Postgres en Supabase** (driver `pg`) como base principal y SQLite con el módulo nativo `node:sqlite` para desarrollo sin internet y tests, zod, helmet, cors, express-rate-limit, jose (JWT), scrypt nativo para contraseñas.

## Contenido

- [Instalación y uso](#instalación-y-uso)
- [Variables de entorno](#variables-de-entorno)
- [Crear el administrador](#crear-el-administrador)
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
| `DB_DRIVER` | según `DATABASE_URL` | `postgres` o `sqlite`. Sin definir: Postgres si hay `DATABASE_URL`, si no SQLite. **Obligatoria en producción.** Ver [Base de datos](#base-de-datos). |
| `DATABASE_URL` | (vacía) | Cadena de conexión de Supabase (Session pooler): `postgresql://usuario:contraseña@host:5432/postgres`. **Secreto.** Se valida al arrancar y nunca se muestra en logs ni errores. Ver [Conectar Supabase](#conectar-supabase). |
| `DATABASE_SSL_CA_FILE` | (vacía) | Certificado raíz de Supabase para verificar al servidor (TLS verify-full). Ruta relativa a `backend/` o absoluta. **Obligatoria en producción con Postgres**; en desarrollo, sin ella la conexión va cifrada pero sin verificar (con aviso). |
| `DB_PATH` | `./storage/mgdetailing.db` | Archivo SQLite (solo con el motor SQLite). Las rutas relativas se resuelven desde `backend/`. La carpeta se crea sola. |
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

El script lee `backend/.env` y usa **la misma base que el servidor**: Postgres si hay `DATABASE_URL` (o `DB_DRIVER=postgres`), si no el SQLite de `DB_PATH`. Al terminar dice en qué base escribió (sin mostrar la contraseña). Si la shell se come el `--`, el email también se acepta por la variable `ADMIN_EMAIL`.

## Base de datos

Hay **dos motores** detrás de las mismas interfaces (`src/domain/`): rutas y servicios no saben cuál se usa.

| Motor | Cuándo | Esquema | Migraciones |
|---|---|---|---|
| **Postgres (Supabase)** | Producción. Proyecto `iclsiweaqhupxvxbpekl`. | `mgdetailing` (propio, no expuesto) | `supabase/migrations/*.sql` (formato Supabase CLI). **No** las aplica el backend: se aplican con la CLI o el MCP de Supabase. Al arrancar, el backend **verifica** que estén (tablas y catálogo de servicios) y si no, no arranca. |
| **SQLite** (`node:sqlite`) | Desarrollo sin internet y tests rápidos. | archivo `DB_PATH` | `src/db/migrations.ts` (`PRAGMA user_version`), las aplica el backend al arrancar. |

### Cómo se elige el motor

| `DB_DRIVER` | `DATABASE_URL` | Resultado |
|---|---|---|
| (vacía) | (vacía) | SQLite en `DB_PATH`. Es el default de desarrollo: `npm run dev` anda sin nada configurado. |
| (vacía) | definida | Postgres. |
| `postgres` | definida | Postgres. Sin `DATABASE_URL`, el servidor no arranca. |
| `sqlite` | cualquiera | SQLite (si hay `DATABASE_URL`, se ignora con un aviso: sirve para trabajar sin internet sin tocar el resto del `.env`). |

**En producción `DB_DRIVER` es obligatorio**: si faltara el secreto `DATABASE_URL`, el servidor no debe caer en silencio a una base SQLite vacía. Con Postgres remoto (en cualquier entorno, también en la PC de desarrollo) es obligatorio `DATABASE_SSL_CA_FILE`.

### Conexión a Postgres

- Driver **`pg` (node-postgres)** con un `Pool` chico: `max` 5 conexiones, se cierran ociosas a los 30 s, timeout de conexión de 5 s, tope de 10 s por consulta, renovación cada 30 min. Un error en una conexión ociosa se loguea y el pool la reemplaza (no tumba el proceso).
- **Modo recomendado: Session pooler (Supavisor, puerto 5432)**, del botón *Connect* del panel. Es lo que Supabase recomienda para un servidor de larga vida en una red **IPv4** (la mayoría de los VPS, PaaS y conexiones domésticas). Si el servidor tiene **IPv6**, la conexión **directa** (`db.<ref>.supabase.co:5432`) también sirve y es un poco más rápida. **No uses el Transaction pooler (6543)**: es para funciones serverless que abren y cierran conexiones todo el tiempo.
- **TLS siempre.** Con `DATABASE_SSL_CA_FILE` (el certificado raíz de Supabase, *Supabase Root 2021 CA*) se verifica el certificado y el nombre del servidor (como `sslmode=verify-full`). Sin él, la conexión iría cifrada pero sin verificar quién responde (un intermediario en la red podría hacerse pasar por Supabase y quedarse con la sesión de la base): por eso se exige siempre que el host no sea local, incluso fuera de producción. Solo con un Postgres en la misma máquina (`localhost`/`127.x`/`::1`) se tolera sin el CA, con un aviso. Los parámetros `sslmode`/`sslrootcert` de la URL se ignoran: la URL se desarma en host, puerto, usuario, contraseña y base, y el TLS lo decide el backend.
- La contraseña nunca se loguea: en los logs aparece `host:puerto/base (usuario ...)`.
- Todas las consultas son SQL **parametrizado** (`$1, $2...`) y nombran el esquema (`mgdetailing.bookings`), sin depender del `search_path`. La regla de ESLint que prohíbe interpolar o concatenar SQL cubre también `.query()`.

### Modelo de datos (Postgres)

```mermaid
erDiagram
    servicios ||--o{ bookings : "servicio_id (FK, RESTRICT)"
    admins ||--o{ sessions : "admin_id (FK, ON DELETE CASCADE)"

    servicios {
        text id PK "slug: lavado-basico, pulido..."
        text nombre
        text duracion_estimada "null = sin confirmar"
        numeric precio_desde "null = Consultá"
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
        text comentario "nullable"
        text estado "CHECK pendiente, confirmado, completado, cancelado"
        timestamptz created_at
        timestamptz updated_at
    }
    admins {
        integer id PK "identity"
        text email "minúsculas, UNIQUE lower(email)"
        text password_hash "scrypt PHC"
        timestamptz created_at
        timestamptz updated_at
    }
    sessions {
        uuid id PK "jti del JWT"
        integer admin_id FK
        timestamptz expires_at
        timestamptz created_at
    }
```

| Tabla | Para qué | Restricciones e índices |
|---|---|---|
| `servicios` | Catálogo del taller (5 servicios, sembrados por migración con los nombres de `domain/servicios.ts` y las duraciones propuestas, sin confirmar). Un servicio que se deja de ofrecer se **desactiva** (`activo = false`), no se borra. | PK `id` (slug validado por CHECK), `precio_desde >= 0` (null = "Consultá"), largos. |
| `bookings` | Solicitudes de turno. | PK `seq` (bigint identity: inserciones ordenadas, índice compacto y orden estable aunque dos turnos tengan el mismo `created_at`); `id` UUID **único**, el único que sale por la API (un id secuencial revelaría cuántos turnos hay). FK `servicio_id -> servicios` (`RESTRICT`). CHECK de `vehiculo_tipo`, `franja`, `estado` y de los largos de zod. Índices: `(estado, seq DESC)` para el listado filtrado y su `COUNT`; la PK sirve al listado sin filtro; `(servicio_id)` para la FK. |
| `admins` | Dueños del panel. | `email` en minúsculas (CHECK) y **único sin distinguir mayúsculas** (índice único sobre `lower(email)`, que también usa la búsqueda). `integer`: son un puñado de filas y se mapea directo a `number`. |
| `sessions` | Allowlist de sesiones (logout real; cambiar la contraseña cierra todas). | FK `admin_id -> admins ON DELETE CASCADE`; índices `(admin_id)` y `(expires_at)`. Las vencidas se borran **al iniciar sesión** (`purgeExpired`): con un solo dueño no hace falta `pg_cron`. |

Decisiones:

- **`text` + `CHECK` en vez de enums** para `vehiculo_tipo`, `franja` y `estado`: la integridad queda en la base igual que con un enum, se leen como string sin conversiones (igual que en SQLite) y cambiar los valores es un `ALTER` de la constraint (quitar un valor de un enum de Postgres obliga a recrear el tipo).
- **`updated_at` con trigger** (`mgdetailing.set_updated_at`): el backend manda su propio `updated_at` (su reloj, el mismo que usan las respuestas y los tests); si una actualización no lo cambia (por ejemplo, una edición a mano desde el panel de Supabase), el trigger pone `now()`. Es `SECURITY INVOKER` y con `search_path` vacío.
- `telefonoWhatsapp` **no es columna**: se calcula al leer, igual que con SQLite.
- `fecha_preferida` es `date`; los repositorios la devuelven como `YYYY-MM-DD` (`to_char`) y los `timestamptz` como ISO 8601 UTC, igual que el contrato.
- En SQLite no hay tabla `servicios` ni FK (el esquema SQLite no se reescribió): ahí la única validación del servicio es la de zod, que usa la misma lista.

### Seguridad en la base (Supabase)

- Todo vive en el esquema **`mgdetailing`**, que **no** está entre los expuestos por la Data API (PostgREST/GraphQL publican `public` y `graphql_public`; un pedido con `Accept-Profile: mgdetailing` responde `PGRST106`). La web **nunca** habla con Supabase: ni `supabase-js`, ni Supabase Auth, ni claves anon/publishable en el frontend. El único cliente es este backend.
- **Rol dedicado `mgdetailing_app`** (migración `rol_app_minimo_privilegio`): el backend se conecta con él, **no** con `postgres`. Puede solo lo que el backend hace: `SELECT` en `servicios`; `SELECT/INSERT/DELETE` en `bookings` y `UPDATE` solo de `estado` y `updated_at`; `SELECT/INSERT` en `admins` y `UPDATE` solo de `password_hash` y `updated_at`; `SELECT/INSERT/DELETE` en `sessions`. Sin DDL, sin `TRUNCATE`, sin `BYPASSRLS`, sin acceso a `auth`, `storage` ni `public`. Topes de sesión: `statement_timeout` 10 s, `lock_timeout` 5 s, `idle_in_transaction_session_timeout` 30 s. Se crea **NOLOGIN y sin contraseña** (no hay secretos en el repo): el dueño le pone la contraseña (ver [Conectar Supabase](#conectar-supabase)). Si el backend arranca conectado con un rol privilegiado (`postgres`), lo avisa en el log.
- **RLS habilitado en las 4 tablas**, con policies **solo para `mgdetailing_app`** (`USING (true)`: el backend es un único cliente de confianza que ve todas las filas; la autorización por usuario la hace la API con la sesión del panel). `anon`, `authenticated` y `service_role` no tienen ni privilegios ni policies: aunque alguien expusiera el esquema por error, no verían una fila. `postgres` (dueño de las tablas, con `BYPASSRLS`) queda para migraciones y backups.
- **`REVOKE` de todo** (tablas, secuencias, funciones y el `USAGE` del esquema) a `public`, `anon`, `authenticated` y `service_role`, y privilegios por defecto revocados para lo que se cree después en el esquema. Un test lo comprueba en PGlite (incluso haciendo `SET ROLE anon`).
- Advisors de Supabase (security y performance) después de aplicar: security sin avisos; performance solo con el INFO esperado *unused index* (la base está vacía; se usan en cuanto haya turnos y sesiones). La migración `endurecer_rls_auto_enable` revocó el `EXECUTE` de `public.rls_auto_enable()` (una función de Supabase que ya venía en el proyecto, del event trigger que activa RLS en tablas nuevas de `public`) a `anon`/`authenticated`, que el linter marcaba como WARN.
- Al borrar un turno en Postgres, la fila deja de verse al instante pero sus bytes quedan en disco hasta que `autovacuum` reutiliza el espacio (no hay equivalente al `secure_delete` de SQLite), y los backups la conservan durante su retención. Para la Ley 25.326 alcanza con que el dato no sea accesible y que la retención de backups esté acotada y documentada.
- **Región `us-east-1` (EE.UU.)**: los datos de los clientes se guardan fuera de Argentina. Es una transferencia internacional (Ley 25.326, art. 12): EE.UU. no figura entre los países con protección adecuada para la AAIP (y ninguna región de Supabase está en Argentina), así que hay que apoyarse en el consentimiento del cliente (mencionarlo en el aviso de privacidad del formulario) y en el acuerdo de tratamiento de datos (DPA) de Supabase. Ver el informe de seguridad.

### Migraciones (Postgres)

- Archivos `supabase/migrations/YYYYMMDDHHMMSS_descripcion.sql`: la fuente de verdad del esquema Postgres. Nunca se edita una migración aplicada; los cambios van en un archivo nuevo.
- Aplicadas en el proyecto remoto: `20261018211151_esquema_inicial`, `20261018211156_catalogo_servicios`, `20261018211232_endurecer_rls_auto_enable`, `20261018213342_rol_app_minimo_privilegio`. Los nombres de los archivos coinciden con las versiones registradas en Supabase, así `supabase migration list` / `supabase db push` los ven como aplicados.
- Para aplicar una nueva: con la CLI (`supabase link --project-ref iclsiweaqhupxvxbpekl` y después `supabase db push`) o con el MCP de Supabase (`apply_migration`; después renombrá el archivo local a la versión que quedó registrada). Corré los advisors después de cada cambio.
- Los tests aplican **las mismas migraciones** a un Postgres en memoria (PGlite). Como PGlite no tiene los roles de Supabase, el test los crea (`anon`, `authenticated`, `service_role`, sin login) antes de migrar: así las migraciones se prueban tal cual, sin saltear sentencias.
- Si se agrega un servicio en `src/domain/servicios.ts`, hay que agregarlo también con una migración (`insert into mgdetailing.servicios ...`): el backend no arranca si al catálogo de la base le falta algún id que el código acepta.

### Backups (Supabase)

- **Plan Free: Supabase no hace backups que puedas descargar o restaurar.** Hacé uno vos con `pg_dump` (o `supabase db dump`), por ejemplo una vez por semana, y guardalo cifrado y fuera de la PC (tiene datos personales y hashes de contraseña):

  ```bash
  # Necesita pg_dump 17 (cliente de Postgres) y la cadena del Session pooler (o la directa).
  pg_dump "postgresql://postgres.iclsiweaqhupxvxbpekl:<CONTRASEÑA>@<host-del-pooler>:5432/postgres" \
    --schema=mgdetailing --data-only --format=custom --file=mgdetailing-2026-10-18.dump
  ```

  Para restaurar: aplicá las migraciones en la base vacía (así quedan RLS, `REVOKE` y el catálogo) y después `pg_restore --dbname "<cadena>" --data-only --disable-triggers mgdetailing-2026-10-18.dump` (vaciá antes `mgdetailing.servicios`, que la migración ya sembró). Corré los advisors al terminar.
- **Plan Pro**: backups diarios automáticos (7 días) en *Database > Backups*, y PITR como add-on. Igual conviene un `pg_dump` propio de vez en cuando.
- Un proyecto Free **se pausa tras una semana sin actividad**. Con el sitio en uso no pasa, pero si el panel muestra el proyecto pausado, se reactiva desde ahí (mientras tanto `/api/health` da `503`).

### Próximo paso natural: catálogo editable

Hoy la lista de servicios válidos sigue fija en `src/domain/servicios.ts` (el contrato no cambió) y la tabla `servicios` solo aporta integridad. El siguiente paso es **leer el catálogo desde la base**: precios y duraciones editables desde el panel `/admin`, `activo` para dejar de ofrecer un servicio sin romper los turnos viejos, y que el frontend lo pida a la API en lugar de tenerlo en `frontend/src/data/servicios.ts`. No está implementado.

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

4. **Pegá la conexión en `backend/.env`** (está en `.gitignore`; nunca lo subas). Agregá estas tres líneas con tu host y la contraseña que te dio `clave-db` en el paso 1:

   ```
   DB_DRIVER=postgres
   DATABASE_URL=postgresql://mgdetailing_app.iclsiweaqhupxvxbpekl:LA-CONTRASEÑA-GENERADA@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   DATABASE_SSL_CA_FILE=./certs/supabase-ca.crt
   ```

   Si el backend no arranca y dice que la URL todavía tiene `[YOUR-PASSWORD]` o que no es válida, revisá este paso (el mensaje nunca muestra la URL). `Tenant or user not found` = el usuario no tiene el `.iclsiweaqhupxvxbpekl` o el host no es el del panel. Si al arrancar aparece el aviso *"conectado como postgres, un rol con privilegios de administrador"*, estás usando el usuario equivocado.

5. **Creá tu admin en Postgres** (la base de Supabase arranca sin administradores; el de SQLite no se copia). Desde `backend/`, en PowerShell:

   ```powershell
   $env:ADMIN_PASSWORD = "una clave larga y unica"
   npm run crear-admin:dev -- --email dueno@mgdetailing.com.ar
   Remove-Item Env:ADMIN_PASSWORD
   ```

   Tiene que terminar con `Administrador creado: ...` y `Base de datos: Postgres ...:5432/postgres (usuario mgdetailing_app.iclsiweaqhupxvxbpekl), esquema mgdetailing, TLS verificado`.

6. **Verificá.** Arrancá el backend (`npm run dev` en `backend/`, o `npm run dev` desde la raíz con el frontend). En la consola tiene que aparecer `Base de datos lista: Postgres ..., TLS verificado`. Después:

   ```powershell
   curl.exe http://localhost:4000/api/health
   # -> {"status":"ok"}
   ```

   Entrá a http://localhost:5173/admin con el admin del paso 5, pedí un turno de prueba desde la landing y fijate que aparezca en el panel (y en Supabase: **Table Editor**, esquema `mgdetailing`, tabla `bookings`). Si `/api/health` responde `503`, Postgres no responde: revisá la contraseña, la conexión a internet y que el proyecto no esté pausado.

Para volver a SQLite sin borrar nada: poné `DB_DRIVER=sqlite` en el `.env` (o comentá las tres líneas).

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

Un **solo proceso Node** con `SERVE_FRONTEND=true` (la API y la landing/panel en el **mismo origen**), detrás de **HTTPS**: Caddy en un VPS (proxy inverso a `127.0.0.1:4000`, certificados automáticos) o un PaaS. Con Postgres en Supabase no hace falta volumen persistente (con SQLite sí, para el archivo `.db`).

```
navegador --HTTPS--> Caddy / PaaS --HTTP--> node dist/index.js (API + estáticos del frontend)
                                                  |
                                                  +--TLS--> Postgres en Supabase (Session pooler, esquema mgdetailing)
                                                            (o SQLite en DB_PATH, en un volumen persistente)
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
| `DB_DRIVER` | `postgres` (obligatoria: elige el motor a propósito). |
| `DATABASE_URL` | La cadena del Session pooler con la contraseña, en el gestor de secretos de la plataforma (nunca en el repo). |
| `DATABASE_SSL_CA_FILE` | Ruta al certificado raíz de Supabase (obligatoria con Postgres en producción). |
| `DB_PATH` | Solo si se usa SQLite: ruta absoluta dentro de un **volumen persistente** (ej.: `/data/mgdetailing.db`). Sin volumen, la base se pierde en cada despliegue. |
| `SERVE_FRONTEND` | `true` para el despliegue de un solo proceso. |

### Límites conocidos

- **El rate limit vive en la memoria del proceso**: se reinicia con cada arranque y no se comparte entre instancias. Con Postgres la base ya admite varias réplicas del backend, pero cada una tendría su propio cupo de rate limit: para escalar horizontalmente hace falta un store compartido (Redis o la misma Postgres). Hoy una sola instancia sobra.
- Cada instancia abre hasta 5 conexiones (pool). El Session pooler de Supabase tiene un cupo de conexiones compartido por todo el proyecto (según el plan): no subas `max` sin mirarlo.
- La latencia a Supabase depende de la región (el proyecto está en AWS us-east-1): del orden de 150-250 ms por consulta desde Argentina, y un pedido hace una o dos. Para un formulario y un panel es aceptable; si se notara, conviene desplegar el backend cerca de la base.
- **Con SQLite: una sola instancia** (no escalar con varias réplicas escribiendo el mismo archivo), **el modo WAL no funciona sobre sistemas de archivos de red** (NFS, SMB) y las consultas son síncronas (bloquean el event loop milisegundos).
- Las sesiones se guardan en la base: reiniciar el servidor **no** las cierra (salvo que cambie `JWT_SECRET`).

### Backup

Con Postgres en Supabase: ver [Backups (Supabase)](#backups-supabase). Con SQLite:

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

Con el build hecho y las variables de entorno cargadas (el script lee el mismo `.env` y usa la misma base que el servidor):

```bash
npm ci
npm run build
npm prune --omit=dev                 # opcional: deja solo las dependencias de producción
ADMIN_PASSWORD='una clave larga y unica' npm run crear-admin -- --email dueno@mgdetailing.com.ar
```

`npm run crear-admin` no usa `tsx`, así que funciona sin devDependencies. Se puede correr con el servidor andando. Repetirlo con el mismo email cambia la contraseña y cierra las sesiones abiertas. En un PaaS, ejecutalo en una consola del servicio (con el volumen montado).

### Glosario

- **Booking** = turno / solicitud de turno. El dominio y la API están en español como el contrato (`turno`, `servicioId`, `franja`, `estado`...); el código técnico (clases, rutas internas, nombres de archivos de infraestructura) está en inglés.
- **Nombres en la base** (snake_case en los dos motores): las tablas técnicas en inglés como el código (`bookings`, `admins`, `sessions`); las columnas de negocio en español como el contrato (`nombre`, `telefono`, `vehiculo_tipo`, `fecha_preferida`, `franja`, `estado`) y las técnicas en inglés (`id`, `seq`, `created_at`, `updated_at`, `expires_at`, `password_hash`). `servicios` va en español porque es el catálogo del negocio y coincide con `domain/servicios.ts` y `servicioId`. Los repositorios traducen a camelCase (`servicio_id` -> `servicioId`).
- **`mgdetailing`** = esquema propio de la app en Postgres (no expuesto por la Data API de Supabase).
- **Honeypot** = campo trampa `website` que solo completan los bots.
- **Repositorio** = capa de acceso a datos detrás de una interfaz (`src/domain/`); hay dos implementaciones: Postgres (`src/repositories/postgres/`) y SQLite (`src/repositories/`).

## Seguridad

- **Contraseñas**: scrypt nativo (N=2^15, r=8, p=3, equivalente OWASP), salt aleatorio por usuario, comparación con `timingSafeEqual`. El login hace el trabajo de scrypt aunque el email no exista, para no revelar por tiempo qué emails están registrados.
- **Sesión**: JWT HS256 firmado con `jose`, con el algoritmo fijado al verificar (más emisor, audiencia y vencimiento), en cookie `HttpOnly; SameSite=Strict` (`Secure` en producción), 8 horas. Además cada sesión se registra en la base: **cerrar sesión la revoca de verdad**, y cambiar la contraseña cierra todas las sesiones de ese admin.
- **CSRF**: `SameSite=Strict` + chequeo de `Origin` + `Content-Type: application/json` obligatorio en métodos que modifican.
- **Rate limits**: general por IP, 5 turnos / 15 min, 5 logins fallidos / 15 min.
- **Entrada**: zod estricto (rechaza campos desconocidos), body máximo de 10 kb, sin cuerpos comprimidos. SQL siempre parametrizado (`?` en SQLite, `$1` en Postgres), y una regla de ESLint prohíbe construir SQL con interpolación o concatenación en `prepare()`, `exec()` y `query()`.
- **Cabeceras**: helmet (CSP, HSTS en producción, `nosniff`, `X-Frame-Options: DENY`...), `Permissions-Policy`, `Cache-Control: no-store` en la API. El panel (`/admin`) lleva `X-Robots-Tag: noindex, nofollow`. Con `SERVE_FRONTEND`, lo que cuelga de `/assets`, `/fotos` y `/marca` y no existe da 404 (nunca el HTML de la SPA), igual que los dotfiles.
- **Datos personales**: nunca se escriben en los logs (una línea por request: método, ruta sin query, status y milisegundos; al crear un turno solo `id + servicio + fecha`; el aviso de WhatsApp solo `id` y status). Con SQLite, al borrar un turno se sobrescribe su contenido (`secure_delete`); con Postgres la fila queda en disco hasta que `autovacuum` reutiliza el espacio.
- **Base de datos (Postgres)**: esquema `mgdetailing` no expuesto por la Data API, RLS en todas las tablas sin policies, `REVOKE` a `anon`/`authenticated`/`service_role`, TLS con verificación del certificado de Supabase, contraseña solo en `DATABASE_URL` (nunca en logs ni errores). Ver [Seguridad en la base](#seguridad-en-la-base-supabase).
- **Errores**: formato único, sin stack traces ni detalles internos.
- **Quien muestre estos datos debe escaparlos** (React lo hace por defecto): nunca `innerHTML` / `dangerouslySetInnerHTML` con nombre, modelo o comentario.

## Estructura del proyecto

```
backend/
  src/
    index.ts            arranque, listen y apagado prolijo (SIGINT/SIGTERM)
    app.ts              createApp(): arma Express sin escuchar (recibe repositorios + checkDatabase; lo usan los tests)
    config.ts           lee .env y valida la configuración con zod
    domain/             tipos del negocio, reglas e interfaces async de los repositorios
    repositories/       implementación SQLite de esas interfaces
      postgres/         implementación Postgres (mismo comportamiento, SQL con $1...)
    services/           casos de uso con lógica (auth, alta de turno, alta de admin)
    routes/             rutas HTTP (health, bookings, auth, admin)
    notifications/      avisos de WhatsApp al dueño (CallMeBot, Cloud API) y formato del mensaje
    middleware/         seguridad, CSRF, rate limit, errores, logger, estáticos
    schemas/            validación de entrada con zod
    db/                 database.ts (elige y abre el motor), postgres.ts (pool, TLS, verificación del esquema),
                        conexión y migraciones SQLite (PRAGMA user_version), chequeo de salud
    lib/                utilidades: errores, logger, scrypt, JWT, fechas, cookies
    scripts/            crear-admin
  supabase/migrations/  migraciones de Postgres (fuente de verdad del esquema en Supabase)
  test/                 vitest + supertest (SQLite en memoria y Postgres en memoria con PGlite)
```

## Scripts y tests

| Comando | Qué hace |
|---|---|
| `npm run dev` | Desarrollo con recarga (`tsx watch`). |
| `npm run build` | Compila a `dist/` con `tsc`. |
| `npm start` | `node dist/index.js`. |
| `npm run crear-admin:dev -- --email <email>` | Crea/actualiza el admin (desarrollo, `tsx`). |
| `npm run clave-db:dev` / `npm run clave-db` | Genera la contraseña del rol `mgdetailing_app` y el `ALTER ROLE` con hash SCRAM para pegar en Supabase. |
| `npm run crear-admin -- --email <email>` | Crea/actualiza el admin (producción, `dist/`). |
| `npm test` | Tests (vitest + supertest). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint (typescript-eslint estricto). |

Los tests usan una base SQLite en memoria y un reloj fijo. Para Postgres usan **PGlite** (Postgres compilado a WebAssembly, en memoria, sin servidor) con **las mismas migraciones** de `supabase/migrations/`:

- `repositories.contract.test.ts`: la **misma batería** contra SQLite y contra Postgres (crear, listar en orden estable, filtrar, paginar, cambiar estado, borrar, inexistente o id mal formado, admin por email sin distinguir mayúsculas, sesiones: crear, vencer, revocar, purgar) y la FK de servicio inválido en Postgres.
- `postgres.test.ts`: RLS y privilegios de `anon`/`authenticated`/`service_role`, CHECK y trigger de `updated_at`, verificación del esquema al arrancar, el flujo HTTP completo sobre Postgres, `/api/health` con Postgres caído (`503`, pool real de `pg` contra un puerto cerrado) y `crear-admin` sobre Postgres.

No hace falta internet ni la contraseña de Supabase para correr los tests. Un test adicional falla si algún fuente contiene caracteres invisibles escritos literalmente (ataque "Trojan Source").
