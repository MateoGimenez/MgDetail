# Objetivo 1: catálogo de servicios editable desde el panel

Hoy los servicios están fijos en dos lugares: `backend/src/domain/servicios.ts` (IDs válidos) y `frontend/src/data/servicios.ts` (textos, duración, precio). La tabla `mgdetailing.servicios` existe pero solo aporta integridad. Este objetivo pasa el catálogo a la base: el dueño edita textos, precios y duraciones, crea servicios nuevos, los activa/desactiva y los ordena desde `/admin`, sin volver a publicar la web.

Este documento es **el contrato** entre backend y frontend. Si algo hay que cambiarlo, se cambia acá primero.

## Decisiones

- **No se borran servicios**: se desactivan (`activo = false`). Hay turnos que los referencian (FK `on delete restrict`).
- **El `id` (slug) es inmutable** después de crearlo. Formato: `^[a-z0-9]+(-[a-z0-9]+)*$`, hasta 64 caracteres.
- **A lo sumo un servicio destacado.** Marcar uno como destacado desmarca al anterior en la misma transacción (y un índice único parcial lo garantiza en la base).
- **Permisos**: ver el catálogo en el panel, todos los roles. Crear, editar y reordenar: `superadmin` y `admin`. `empleado`: solo lectura (403). La regla vive en `backend/src/domain/permisos.ts` (`puedeEditarCatalogo`); la UI solo esconde botones.
- **Turnos**: `POST /api/bookings` acepta solo un `servicioId` que exista en la base **y esté activo**. La lista fija `SERVICIO_IDS` deja de ser la fuente de verdad.
- **Landing**: lee el catálogo de `GET /api/servicios`. Si la API falla, usa `frontend/src/data/servicios.ts` como respaldo (sin precios: muestra "Consultá"), para que la web nunca quede sin servicios.
- **Ids reservados**: `orden` no se puede usar como id (choca con la ruta `/api/admin/servicios/orden`).
- **Textos**: se rechazan caracteres de control (C0/C1) y se quitan los bidireccionales, igual que en los turnos.
- **Desactivar el destacado** lo desmarca (`destacado = false`) en la misma operación. No se puede destacar un servicio inactivo (400).
- **Catálogo vacío**: si `GET /api/servicios` responde una lista vacía, la landing NO usa el respaldo (el backend rechazaría esos turnos): muestra un aviso de que por ahora no hay turnos online y lleva a WhatsApp/Instagram si están cargados.
- **Migración**: archivo nuevo en `backend/supabase/migrations/`. Agrega columnas, copia los textos actuales del frontend a la base y da al rol `mgdetailing_app` los permisos mínimos (`insert` y `update` por columna en `servicios`, con sus policies). **No se aplica a Supabase remoto sin aprobación del dueño.**

## Modelo `Servicio` (JSON, camelCase)

| Campo | Tipo | Reglas | Público | Panel |
|---|---|---|---|---|
| `id` | string | slug, 1–64 | sí | sí |
| `nombre` | string | trim, 1–80 | sí | sí |
| `resumen` | string | trim, 1–200 | sí | sí |
| `descripcion` | string | trim, 1–1500 | sí | sí |
| `incluye` | string[] | 0–15 ítems, cada uno trim 1–120 | sí | sí |
| `glosario` | `{ termino, significado }[]` | 0–10; `termino` 1–60, `significado` 1–300 | sí | sí |
| `duracion` | string \| null | trim, ≤60; vacío → null | sí | sí |
| `precioDesde` | number \| null | entero en ARS, 0–99.999.999; null = "Consultá" | sí | sí |
| `destacado` | boolean | a lo sumo uno en `true` | sí | sí |
| `activo` | boolean | | no | sí |
| `orden` | integer | menor primero | no | sí |
| `updatedAt` | string ISO 8601 | | no | sí |

En la base: `duracion` ↔ `duracion_estimada`, `incluye` y `glosario` ↔ `jsonb` (con CHECK de tipo array), `precioDesde` ↔ `precio_desde`.

## Endpoints

Formato de error, CSRF (Origin + Content-Type), rate limit y `strictObject` (campos desconocidos → 400): igual que el resto de la API (ver `backend/README.md`, "Contrato de la API").

### `GET /api/servicios` (público)

`200 { "servicios": ServicioPublico[] }`: solo los activos, ordenados por `orden` y después por `id`. `ServicioPublico` = los campos marcados "Público".

### `GET /api/admin/servicios` (sesión, todos los roles)

`200 { "servicios": Servicio[] }`: todos (activos e inactivos), mismo orden.

### `POST /api/admin/servicios` (superadmin, admin)

Body: `id`, `nombre`, `resumen`, `descripcion` obligatorios; `incluye` (default `[]`), `glosario` (default `[]`), `duracion` (default null), `precioDesde` (default null), `destacado` (default false), `activo` (default true) opcionales. `orden` se asigna solo (al final).

- `201 { "servicio": Servicio }`
- `409` con código `SERVICIO_EXISTE` si el `id` ya existe.

### `PATCH /api/admin/servicios/:id` (superadmin, admin)

Body parcial con al menos un campo de: `nombre`, `resumen`, `descripcion`, `incluye`, `glosario`, `duracion`, `precioDesde`, `destacado`, `activo`. El `id` no se puede cambiar (si viene en el body → 400).

- `200 { "servicio": Servicio }`
- `404` si no existe.

### `PUT /api/admin/servicios/orden` (superadmin, admin)

Body: `{ "ids": string[] }` con **todos** los ids del catálogo, sin repetir, en el orden nuevo. Se guarda `orden = posición × 10` en una transacción.

- `200 { "servicios": Servicio[] }`
- `400` si faltan, sobran o se repiten ids.

## Panel (`/admin`)

Nueva sección **Servicios** junto a Turnos y Usuarios:

- Lista en el orden del catálogo, con nombre, precio (o "Consultá"), duración, distintivo de destacado y estado activo/inactivo.
- Editar en un diálogo: todos los campos, con listas editables para "incluye" y "glosario".
- Crear servicio nuevo (el slug se sugiere a partir del nombre y se puede corregir antes de guardar; después queda fijo).
- Activar/desactivar, marcar como destacado, subir/bajar en el orden.
- `empleado` ve la lista sin controles de edición.
- Mismas validaciones que el backend (zod), mensajes en español rioplatense.

## Estado

- [x] Backend: migración, repositorio, servicio, rutas, permisos, validación de turnos contra la base, tests, README. Incluye ids reservados, textos con control, "desactivar el destacado lo desmarca / no se destaca un inactivo" (400 en `fields.destacado`, CHECK `servicios_destacado_activo` en la migración).
- [x] Frontend: cliente de API, landing desde la API con respaldo, sección Servicios del panel, tests. Incluye catálogo vacío (`SinTurnosOnline`, sin respaldo) y destacado deshabilitado en inactivos.
- [x] Verificación: typecheck, lint, tests (backend 269, frontend 36) y build en verde; revisión cruzada del contrato; prueba de punta a punta a nivel API (`backend/test/servicios.test.ts`, "de punta a punta").
- [ ] Aplicar la migración en Supabase (con aprobación del dueño).
