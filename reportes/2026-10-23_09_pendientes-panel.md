# Pendientes conocidos del panel

Detalles menores que encontraron los agentes de pruebas y que quedaron sin cambiar a propósito (no son errores graves, o son decisiones de diseño). Marcá con `[x]` cuando se resuelvan.

## Catálogo de servicios (objetivo 1)

- [ ] **Sesión vencida mientras se edita un servicio:** el diálogo se cierra y se pierde lo escrito (el panel vuelve al ingreso). Se podría guardar un borrador local o reintentar después de renovar la sesión.
- [ ] **Lista desactualizada al destacar:** si otra pestaña desactivó un servicio y en esta se toca "Destacar", aparece el error 400 en la fila pero la lista no se recarga sola.
- [ ] **Preguntas frecuentes con servicios desactivados:** si el dueño desactiva Lavado Básico, Premium o Pulido, la pregunta frecuente los sigue nombrando (textos fijos en `frontend/src/data/preguntas.ts`).

## Agenda (objetivo 2)

- [ ] **Turno cancelado desde otra pestaña con el detalle abierto:** al reprogramar llega el 400 y se muestra el mensaje, pero el turno sigue figurando "pendiente" hasta tocar Actualizar. Se podría recargar la semana ante un 400 o 404.
- [ ] **"Hoy" fijo después de medianoche:** `VistaAgenda` y `ElegirFecha` calculan "hoy" al montarse; si el panel queda abierto pasada la medianoche, la marca "Hoy" queda vieja hasta recargar. El backend valida igual.
- [ ] **Escape con un guardado en curso:** el detalle de la agenda se puede cerrar con Escape mientras guarda (no hace daño: la respuesta se aplica por id). Los otros diálogos usan `bloquearEscape`.
- [ ] **Franja como texto en la ficha:** la ficha de la agenda no muestra "Mañana/Tarde" como texto (se deduce del grupo o la fila; para lector de pantalla sí se anuncia).
- [ ] **Orden dentro de una celda:** el front ordena por `createdAt` y el back por `seq`; solo difieren si hay empates exactos.
- [x] **Revisión visual de la agenda:** probada en Edge a 390 px y 1280 px (2026-10-23, capturas en `reportes/capturas/2026-10-23_panel/`).

## Notas, búsqueda e historial (objetivo 3)

- [ ] **Tildes en NFD:** nada normaliza a NFC (ni al guardar ni al buscar), así que una "á" escrita como letra + tilde suelta no coincide con "a". Se arregla con `normalize('NFC')` sobre `q` y sobre los textos del turno.
- [ ] **Nota a medio escribir que se pierde:** si vence la sesión, con Escape en el detalle de la agenda, o al escribir en el buscador o cambiar de pestaña (la lista se vuelve a pedir y las tarjetas se rehacen).
- [ ] **Búsqueda mixta:** con 4 o más dígitos también busca por teléfono, así que "Juan 2024" puede traer turnos de otra persona cuyo teléfono contiene 2024.
- [ ] **Sello desactualizado:** cuando entra un turno nuevo del mismo cliente, el "Cliente frecuente · N turnos" de las tarjetas ya visibles no cambia hasta recargar.
- [ ] **`normalizar-telefonos` cambia `updated_at`** de los turnos que completa (por el trigger). Documentado en el script.
- [x] **Revisión visual de búsqueda, notas e historial:** probada en Edge a 390 px y 1280 px (2026-10-23). En el celular, la barra de secciones del panel hacía desplazar toda la página de costado: corregido en `admin.css`.
- [x] **Tarjetas de turno muy largas en el celular** (resuelto 2026-10-25: en Turnos arrancan plegadas por debajo de 760 px, con "Expandir todas"): con todos los datos, la nota y los botones, cada tarjeta ocupa casi dos pantallas. Conviene una vista compacta (nombre, servicio, fecha y estado) que se expanda al tocarla.

## Disponibilidad, seguimiento y recordatorios (objetivo 4)

- [ ] **Carrera real del último lugar:** el bloqueo por fecha está probado en PGlite (una sola conexión); conviene una prueba contra un Postgres real antes de publicar.
- [ ] **Recordatorio por WhatsApp duplicado:** si el envío sale bien pero falla la marca en la base, la próxima corrida lo vuelve a mandar (el email lo evita con la Idempotency-Key de Resend; WhatsApp no tiene algo igual).
- [ ] **Ocupados de la agenda:** el front los cuenta con los turnos que muestra, no con `ocupadosManana`/`ocupadosTarde` del backend; se desalinearía si la agenda algún día filtra turnos.
- [ ] **Agenda con días pasados:** muestra "0/2" también en los días que ya pasaron; podría ocultarse el cupo ahí.
- [x] **Días especiales largos en el celular** (resuelto 2026-10-25: Disponibilidad pasó a ser un calendario mensual): con los 15 feriados precargados, la lista ocupa varias pantallas; podría agruparse por mes o plegar los lejanos.
- [ ] **"Elegir varios días" en el celular:** después de marcar los días hay que bajar para tocar "Cerrar N días"; podría ir en una barra fija abajo.
- [ ] **Tests de componentes del frontend:** son de lógica pura (no hay testing-library); el selector de días, el 409 y la página de seguimiento se verificaron con capturas, no con tests renderizados.
- [ ] **Tests del backend bajo carga:** con muchos workers, los primeros tests pueden pasar el timeout de 20 s al arrancar PGlite; `npx vitest run --maxWorkers=4` lo evita.
- [ ] **Activar los recordatorios:** cuenta de Resend (dominio verificado), plantilla de WhatsApp en Meta ({{1}} servicio, {{2}} día, {{3}} franja), `CRON_SECRET` y el cron diario a las 18:00 de La Rioja cuando la web esté publicada.

## Modo claro (objetivo 5)

- [ ] **Borde de los campos en el modo oscuro** (`#3a4047` sobre `#0f1214`) da 1,79:1, por debajo del 3:1 de WCAG. Es de antes del modo claro; no se tocó porque el oscuro tenía que quedar igual.
- [ ] **`DESIGN.md`** no documenta la paleta clara.
- [ ] **Botón de tema en el celular:** está solo dentro del menú (en la barra no entra a 360 px). Confirmar que alcanza.

## Supabase

- [ ] **Protección de contraseñas filtradas** desactivada en Supabase Auth (*Authentication > Sign In / Providers > Passwords*). Única alerta de seguridad de los advisors.
