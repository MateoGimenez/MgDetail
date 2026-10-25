# Objetivo 4: disponibilidad real, seguimiento del turno y recordatorios

Tres funciones para el cliente, todas alrededor del turno:

1. **Disponibilidad real**: el formulario solo deja elegir días y franjas en los que el taller atiende y que todavía tienen lugar. El dueño decide desde el panel qué días se trabaja (incluso un domingo o un feriado puntual) y cuántos turnos entran por franja.
2. **Seguimiento**: después de pedir el turno, el cliente tiene un enlace `/turno/<id>` donde ve si está pendiente, confirmado, completado o cancelado, sin tener que llamar.
3. **Recordatorio**: el día anterior a un turno confirmado, el cliente recibe un recordatorio automático.

Este documento es **el contrato** entre backend y frontend. Si algo hay que cambiarlo, se cambia acá primero.

## Decisiones

### Disponibilidad

- **Horario semanal** (la regla de siempre): para cada día de la semana, si se atiende y cuántos turnos entran a la mañana y a la tarde. Valor inicial: lunes a sábado abierto con **2 turnos por franja**; domingo cerrado. Un cupo en 0 cierra esa franja.
- **Días especiales** (la excepción, gana sobre el horario semanal): una fecha puntual marcada como **cerrada** (feriado, vacaciones, el taller no abre) o **abierta** con sus propios cupos (por ejemplo, un domingo o un feriado que el dueño decide trabajar). Cada día especial tiene un motivo opcional ("Feriado: Navidad", "Vacaciones").
- **Feriados precargados** como días especiales cerrados, para que el dueño solo tenga que abrir los que quiera trabajar. Se cargan **solo los inamovibles** de lo que queda de 2026 y de 2027, más el 20 de noviembre de 2026 trasladado al lunes 23 (Día de la Soberanía, motivo "a confirmar"):
  - 2026: 23/11 (Soberanía Nacional, trasladable: confirmar), 08/12 (Inmaculada Concepción), 25/12 (Navidad).
  - 2027: 01/01 (Año Nuevo), 08/02 y 09/02 (Carnaval), 24/03 (Memoria), 26/03 (Viernes Santo), 02/04 (Malvinas), 01/05 (Trabajador), 25/05 (Revolución de Mayo), 20/06 (Belgrano), 09/07 (Independencia), 08/12 (Inmaculada Concepción), 25/12 (Navidad).
  - Los trasladables y los puentes los decide el gobierno cada año: el panel lo aclara para que el dueño los revise.
- **Turnos que ocupan cupo**: los no cancelados (`pendiente`, `confirmado`, `completado`) cuya **fecha de agenda** (confirmada si existe, si no la pedida) y franja coinciden. Un pendiente ocupa lugar: si no, dos clientes podrían pedir el último lugar.
- **El formulario público** solo acepta un día y franja disponibles. Si se llenó mientras el cliente completaba el formulario, el backend lo rechaza con un mensaje claro y el formulario le ofrece elegir otro.
- **Sin carreras**: dos pedidos simultáneos por el último lugar no pueden entrar los dos (bloqueo por fecha dentro de la transacción del alta).
- **El panel manda**: el dueño **sí** puede confirmar o reprogramar un turno a un día o franja llena o cerrada (es su decisión). El panel le avisa ("Esa franja ya tiene 2 de 2"), pero no lo bloquea.
- **Rango** sin cambios: el cliente pide de hoy a hoy + 60 días (hora de La Rioja).
- **Permisos**: ver la disponibilidad, todos los roles. Cambiar el horario semanal y los días especiales: `superadmin` y `admin` (`puedeEditarDisponibilidad`).

### Seguimiento

- El enlace usa el `id` (UUID aleatorio) que ya devuelve `POST /api/bookings`: no se puede adivinar.
- La página muestra **solo** el servicio, la fecha y franja de agenda, el estado y cuándo se actualizó. **Nunca** nombre, teléfono, email, vehículo, comentario ni notas internas.
- Un id inexistente o con formato inválido da el mismo 404 ("No encontramos ese turno"), sin revelar nada.
- El endpoint tiene su propio límite de pedidos por IP, y la página lleva `noindex`.
- El mensaje de WhatsApp que el taller le manda al cliente desde el panel incluye el enlace de seguimiento cuando hay URL pública configurada.

### Recordatorios

- Se mandan para los turnos **confirmados** cuya fecha de agenda es **mañana** (La Rioja), una sola vez por turno (`recordatorio_enviado_at`). Si se reprograma un turno que ya tuvo recordatorio, se limpia la marca para que reciba el nuevo.
- **Canales**, según lo que esté configurado y lo que haya dejado el cliente:
  - **Email con Resend**, si el turno tiene email y están `RESEND_API_KEY` y `RECORDATORIO_EMAIL_DESDE`.
  - **WhatsApp Cloud API**, si el turno tiene `telefono_whatsapp` y están las variables de Cloud más `WHATSAPP_CLOUD_TEMPLATE_RECORDATORIO` (plantilla aprobada por Meta).
  - Sin nada configurado, no se manda nada y no es un error (se registra en el log como "recordatorios desactivados").
- **Disparo**: un endpoint interno `POST /api/internal/recordatorios`, protegido con `Authorization: Bearer <CRON_SECRET>` (comparación en tiempo constante; sin la variable, el endpoint responde 404). Lo llama un cron una vez por día (por ejemplo a las 18:00 de La Rioja). El cron se configura **después** de publicar la web (pg_cron + pg_net en Supabase, o el cron del hosting); el README explica las dos opciones.
- **Idempotente**: si el cron corre dos veces, no se manda dos veces. Si un envío falla, ese turno queda sin marcar y se reintenta en la próxima corrida.
- El log y la respuesta solo dicen cuántos se mandaron, cuántos fallaron y cuántos no tenían canal. Nunca datos del cliente.

## Base de datos

Migración nueva en `backend/supabase/migrations/`:

- `mgdetailing.horario_semanal` (dia 0–6, lunes = 1 … domingo = 0 o la convención que elija el backend y documente; `abierto`, `cupo_manana`, `cupo_tarde` enteros 0–20). Siete filas sembradas con el valor inicial.
- `mgdetailing.dias_especiales` (`fecha` date PK, `abierto` boolean, `cupo_manana`, `cupo_tarde` (obligatorios si abierto, null si cerrado), `motivo` text ≤ 80). Sembrada con los feriados de arriba.
- `bookings.recordatorio_enviado_at timestamptz null`.
- RLS habilitado, sin policies para anon/authenticated, GRANT mínimo a `mgdetailing_app` (select en las dos tablas; insert/update/delete en `dias_especiales`; update de los cupos y `abierto` en `horario_semanal`; update de `recordatorio_enviado_at`), con sus policies, como en las migraciones anteriores.
- **No se aplica a Supabase remoto sin pasar las pruebas.**

## Endpoints

Formato de error, CSRF, rate limit y `strictObject` en los body: igual que el resto de la API.

### Públicos

- `GET /api/disponibilidad?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` (máximo 62 días, dentro de hoy..hoy+60; si no se mandan, ese rango completo) → `200 { "dias": [{ "fecha", "abierto": boolean, "manana": boolean, "tarde": boolean }] }`. `manana`/`tarde` = hay lugar. No se exponen cantidades.
- `POST /api/bookings` (amplía el actual): si el día está cerrado → `400` con `fields.fechaPreferida` ("Ese día no tomamos turnos. Elegí otro."); si la franja está llena o con cupo 0 → `409` código `FRANJA_LLENA` con `fields.franja` ("Esa franja se llenó. Elegí otra."). La respuesta `201` suma `seguimientoUrl` (ruta relativa `/turno/<id>`).
- `GET /api/turnos/:id` → `200 { "turno": { "id", "servicioNombre", "fecha", "franja", "estado", "actualizadoEl" } }` (fecha y franja de agenda) o `404`.

### Panel (sesión)

- `GET /api/admin/disponibilidad` → `{ "horarioSemanal": [...7], "diasEspeciales": [...] (de hoy en adelante) }`. Todos los roles.
- `PUT /api/admin/disponibilidad/horario-semanal` body `{ "dias": [7 elementos] }` → el horario completo. superadmin/admin.
- `PUT /api/admin/disponibilidad/dias-especiales/:fecha` body `{ "abierto", "cupoManana"?, "cupoTarde"?, "motivo"? }` crea o reemplaza → `200 { "dia" }`. `DELETE` lo quita (vuelve al horario semanal) → `204`. superadmin/admin.
- `GET /api/admin/agenda` (amplía): suma `cupos: [{ "fecha", "abierto", "cupoManana", "cupoTarde", "ocupadosManana", "ocupadosTarde" }]` para cada día del rango, para mostrar "2/3" en la agenda.

### Interno

- `POST /api/internal/recordatorios` (Bearer `CRON_SECRET`) → `200 { "enviados", "fallidos", "sinCanal" }`.

## Frontend

- **Formulario de reserva**: la fecha deja de ser un `input date` libre. Un selector de días (próximos 60) que muestra cerrados y llenos como no disponibles (con el motivo legible para lector de pantalla), y después las franjas con lugar. Celular primero, accesible por teclado. Si la API de disponibilidad falla, se vuelve al campo de fecha de antes (el backend valida igual). Maneja el `409 FRANJA_LLENA` y el `400` de día cerrado recargando la disponibilidad y pidiendo otra elección.
- **Pantalla de éxito**: muestra el enlace de seguimiento con un botón para copiarlo y un aviso de que lo guarde.
- **Página `/turno/:id`**: estado con una línea de tiempo simple (Recibido → Confirmado → Listo; o Cancelado), servicio, fecha y franja, y los botones de contacto del taller (WhatsApp/Instagram si están cargados). `noindex`. Estados de carga, error y "No encontramos ese turno".
- **Panel, sección Disponibilidad** (dentro de Agenda o como sección propia, a criterio del diseño): horario semanal (7 filas: abierto sí/no, cupos mañana y tarde), lista de días especiales próximos con agregar/editar/quitar (cerrado, o abierto con cupos), con los feriados precargados marcados y la aclaración sobre los trasladables. Empleado: solo lectura.
- **Agenda**: cada celda muestra ocupados/cupo ("2/3") y marca los días cerrados. Al confirmar o reprogramar a una franja llena o cerrada, aviso (no bloqueo).
- **WhatsApp al cliente** desde la tarjeta: suma el enlace de seguimiento si hay URL pública (`sitio.url`).

## Lo que necesita el dueño (después, para activar los recordatorios)

- **Email**: una cuenta de Resend con el dominio verificado, `RESEND_API_KEY` y `RECORDATORIO_EMAIL_DESDE`.
- **WhatsApp**: una cuenta de WhatsApp Business en Meta con una plantilla de recordatorio aprobada.
- **Cron**: se configura cuando la web esté publicada.

## Estado

- [x] Backend: migración, disponibilidad (pública y panel), validación en el alta con bloqueo, seguimiento, recordatorios (endpoint, Resend, Cloud), tests, README.
- [x] Frontend: selector de días y franjas, éxito con enlace, página de seguimiento, sección Disponibilidad, cupos en la agenda, tests.
- [x] Verificación: todo en verde, revisión cruzada, casos borde (último lugar simultáneo, día especial que pisa al semanal, domingo abierto, feriado cerrado, reprogramación que libera o llena un cupo, recordatorio idempotente).
- [x] Aplicar la migración en Supabase (2026-10-25: 7 días de horario, 15 feriados; advisors sin hallazgos nuevos).
