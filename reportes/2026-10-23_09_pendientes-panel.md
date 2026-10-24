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
- [ ] **Tarjetas de turno muy largas en el celular:** con todos los datos, la nota y los botones, cada tarjeta ocupa casi dos pantallas. Conviene una vista compacta (nombre, servicio, fecha y estado) que se expanda al tocarla.

## Supabase

- [ ] **Protección de contraseñas filtradas** desactivada en Supabase Auth (*Authentication > Sign In / Providers > Passwords*). Única alerta de seguridad de los advisors.
