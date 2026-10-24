# Objetivo 3: notas internas, búsqueda e historial del cliente

Tres funciones chicas del panel que se apoyan en lo mismo (el turno y su cliente), por eso van juntas:

1. **Notas internas**: lo que el taller anota de un turno y el cliente nunca ve ("rayón en la puerta trasera", "pidió que lo llamen antes", "cobrado"). La fecha confirmada ya quedó hecha en el objetivo 2.
2. **Búsqueda**: encontrar un turno por nombre, teléfono, email o vehículo, sin recorrer pestañas.
3. **Historial del cliente**: ver que "este cliente vino 3 veces" y abrir sus turnos anteriores. Es la base para fidelizar.

Este documento es **el contrato** entre backend y frontend. Si algo hay que cambiarlo, se cambia acá primero.

## Decisiones

- **Quién es "el mismo cliente"**: dos turnos son del mismo cliente si tienen el mismo `telefonoWhatsapp` (el número normalizado de `backend/src/domain/telefono.ts`: "0380 15-4123456" y "+54 9 380 4123456" son el mismo). Si el teléfono no se puede interpretar (`telefonoWhatsapp: null`), el turno no tiene historial. No se agrupa por nombre: dos "Juan" distintos no son la misma persona.
- **El número normalizado se guarda**: hoy `telefonoWhatsapp` se calcula al leer. Para buscar y contar por él, pasa a guardarse en una columna (`telefono_whatsapp`) que el backend llena al crear el turno. Los turnos que ya existen se completan con un script (`npm run normalizar-telefonos` en `backend/`), porque la regla vive en JavaScript (libphonenumber), no en SQL. El JSON sigue devolviendo `telefonoWhatsapp` igual que hoy.
- **Notas**: las puede escribir y editar **cualquier rol**, incluido `empleado` (es quien está con el auto). Una sola nota por turno, texto libre hasta 1000 caracteres, con saltos de línea. Vacía → `null`. Nunca sale por la API pública ni en avisos (Telegram, WhatsApp).
- **Búsqueda e historial**: los pueden usar todos los roles (son lecturas).
- **Patente**: queda para un objetivo posterior (hay que agregarla al formulario público). Por ahora se busca por modelo de vehículo.

## Base de datos

Migración nueva en `backend/supabase/migrations/`:

- `bookings.notas_internas text null`, CHECK de largo (≤ 1000).
- `bookings.telefono_whatsapp text null`, CHECK de formato (`^\d{8,15}$`).
- Índice sobre `telefono_whatsapp` (lo usan el conteo y el historial).
- `grant update (notas_internas, telefono_whatsapp)` a `mgdetailing_app` (el INSERT ya lo tiene a nivel tabla).
- La búsqueda por texto es sobre una tabla chica: un `ILIKE` con los comodines escapados alcanza; no hace falta pg_trgm. Si el backend necesita ignorar acentos, que lo haga sin depender de extensiones que no estén habilitadas en Supabase (o que habilite `unaccent` en la migración, en el esquema `extensions`).
- **No se aplica a Supabase remoto sin pasar las pruebas.**

## Modelo `Turno` (cambios)

Se agregan dos campos al JSON del turno (en `/api/admin/bookings`, en el PATCH y en `/api/admin/agenda`):

| Campo | Tipo | Notas |
|---|---|---|
| `notasInternas` | string \| null | |
| `turnosDelCliente` | integer \| null | cuántos turnos hay con el mismo `telefonoWhatsapp`, contando este y todos los estados. `null` si el turno no tiene `telefono_whatsapp` guardado (siempre que `telefonoWhatsapp` es null, y también en turnos viejos todavía sin normalizar, aunque `telefonoWhatsapp` se calcule al leer). Con `null` el panel no muestra sello. 1 = primer turno. |

El panel valida las respuestas en modo estricto: los dos lados se actualizan juntos.

## Endpoints

Formato de error, CSRF, rate limit y `strictObject` en los body: igual que el resto de la API. En los query params, los desconocidos se ignoran (como hoy).

### `GET /api/admin/bookings` (amplía el actual)

Nuevos parámetros opcionales, combinables con `estado`, `limit` y `offset`:

- `q`: texto de búsqueda, trim, 2 a 80 caracteres (fuera de eso → `400` con `fields.q`). Encuentra el turno si el texto aparece, sin importar mayúsculas (y, si se puede, acentos), en `nombre`, `email` o `vehiculoModelo`; o si los dígitos de `q` (cuando tiene al menos 4) aparecen en los dígitos del teléfono o en `telefonoWhatsapp`.
- `cliente`: un `telefonoWhatsapp` exacto (`^\d{8,15}$`, si no → `400` con `fields.cliente`). Devuelve todos los turnos de ese cliente.

El orden sigue siendo "más nuevos primero" y `total` cuenta lo filtrado.

### `PATCH /api/admin/bookings/:id` (amplía el actual)

Se suma `notasInternas` (string ≤ 1000 o `null`; vacío o solo espacios → `null`; se rechazan caracteres de control salvo salto de línea y tabulación). Se puede mandar solo, o junto con `estado` y/o la fecha confirmada. Todos los roles pueden cambiar la nota, aunque el turno esté cancelado o completado.

- `200 { "booking": Turno }`.

## Panel (`/admin`)

- **Turnos — buscador** arriba de las pestañas: "Buscar por nombre, teléfono o vehículo". Busca mientras se escribe (con una pausa breve, sin un pedido por tecla), respeta la pestaña elegida y se puede limpiar. Sin resultados: "No encontramos turnos para «…»". Accesible: label visible o asociado, resultados anunciados.
- **Tarjeta del turno** (en Turnos y en el detalle de la Agenda):
  - **Notas internas**: se ve la nota si hay; "Agregar nota" / "Editar nota" abre un campo en la misma tarjeta con contador de caracteres, Guardar y Cancelar. Se aclara que el cliente no la ve.
  - **Cliente**: un sello "Primer turno" si `turnosDelCliente` es 1, o "Cliente frecuente · N turnos" si es 2 o más, con el botón **Ver historial**.
- **Historial del cliente**: un diálogo con los turnos de ese cliente (más nuevos primero): fecha de agenda, servicio, vehículo, estado y nota interna si tiene. El turno desde el que se abrió queda marcado. Carga, error y sesión vencida como el resto.

## Estado

- [x] Backend: migración, script `normalizar-telefonos`, búsqueda, historial, notas, `turnosDelCliente`, tests, README.
- [x] Frontend: buscador, notas en la tarjeta, sello de cliente, diálogo de historial, tests.
- [x] Verificación: todo en verde, revisión cruzada del contrato, casos borde (búsqueda con comodines `%` y `_`, teléfonos mal escritos, cliente sin teléfono válido, nota con saltos de línea). Backend 370 tests, frontend 88; typecheck, lint y build en verde. Prueba de punta a punta en `backend/test/integracion-objetivo3.test.ts`. Arreglado en la verificación: la nota quita los controles bidireccionales como el resto de los textos libres; el panel cuenta el largo de `q` en caracteres como el backend (un emoji = 1); una recarga que llega tarde ya no pisa la nota o el estado recién guardados (Turnos y Agenda).
- [x] Aplicar la migración en Supabase y correr el script sobre los turnos existentes (2026-10-23: 1 turno actualizado, 0 sin teléfono interpretable; advisors sin hallazgos nuevos).
