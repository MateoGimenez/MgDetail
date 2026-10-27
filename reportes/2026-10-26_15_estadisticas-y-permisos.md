# Objetivo 8: estadísticas del taller, cobro por trabajo y permisos por rol

## Pedido del dueño

1. Un **panel de estadísticas completo y con gráficos**: cuántos servicios se vendieron, cuáles son los más pedidos, **cuánto se generó** en el día, el mes y el año, y **qué trabajador lavó más**.
2. **Gestión de roles**: no recuerda qué permisos tienen los usuarios que no son superusuarios. Quiere que **quede claro qué puede hacer cada usuario**.

Este documento es **el contrato** entre backend y frontend. Si algo hay que cambiarlo, se cambia acá primero.

## Lo que falta en los datos (y por qué cambia la base)

Hoy el sistema **no sabe** ni cuánto se cobró en un trabajo ni quién lo hizo: solo guarda el servicio y el precio "desde" del catálogo (que ni siquiera está cargado). Sin eso, "cuánto generó" y "qué trabajador lavó más" no se pueden calcular de verdad. Por eso:

- Cada turno **completado** guarda **cuánto se cobró** (`monto`) y **quién lo hizo** (`trabajador`).
- Los números se calculan **solo con lo que se registró**; nunca se estima con el precio "desde". Si hay turnos completados sin monto, las estadísticas lo dicen ("3 trabajos sin cobro cargado") y avisan cómo completarlos.

## Decisiones

### Cobro y trabajador al completar un turno

- Al marcar un turno como **Completado**, la tarjeta pide (en la misma tarjeta, sin ventana aparte): **¿Cuánto cobraste?** (pesos enteros; se sugiere el "Desde" del servicio si está cargado, editable) y **¿Quién lo hizo?** (lista de personas activas del panel, por defecto quien está logueado).
- **Admin y superadmin**: cargan el monto y pueden elegir a cualquier persona activa. Pueden **corregirlos después** en un turno ya completado ("Editar cobro").
- **Empleado**: al completar un turno **queda como el trabajador** (no elige a otro) y **no carga monto** (no maneja plata): el turno queda "sin cobro cargado" y lo completa un admin. Esto evita que se pierdan trabajos y no expone importes.
- Si un turno **deja de estar Completado**, se borran `monto` y `trabajador` (para que no queden ingresos de un trabajo que ya no está hecho).
- `monto` es opcional: se puede completar sin monto ("lo cargo después").
- Se puede asignar a **cualquier persona activa**, también a un admin o al superadmin (el dueño también lava). Si esa persona se borra, el turno queda "Sin asignar".

### Qué cuenta en las estadísticas

- Todo se agrupa por la **fecha de agenda** del turno (la confirmada si existe, si no la pedida), en hora de La Rioja.
- **Pedidos** = turnos no cancelados (pendiente, confirmado, completado). **Vendidos / completados** = turnos completados. **Ingresos** = suma de `monto` de los completados. **Ticket promedio** = ingresos ÷ completados **con monto**. **Cancelación** = cancelados ÷ todos los turnos del período.
- Tarjetas fijas "Hoy / Este mes / Este año" (siempre calculadas con la fecha de hoy), cada una con su **comparación con el período anterior equivalente**: hoy vs. ayer; este mes (hasta hoy) vs. el mes pasado (los mismos días); este año (hasta hoy) vs. el año pasado (los mismos días).
- Además, un **rango elegible** para el resto de los gráficos: Hoy, 7 días, 30 días, **Este mes (por defecto)**, Mes pasado, Este año y Personalizado (hasta 366 días).
- La serie en el tiempo va **por día** si el rango tiene hasta 62 días y **por mes** si es más largo.

### Quién ve qué

- **Estadísticas completas (con plata)**: `superadmin` y `admin`.
- **Empleado**: ve **"Mis trabajos"** (cuántos trabajos hizo, por servicio y por día) **sin importes** y sin datos de los demás.
- La regla vive en el backend (`domain/permisos.ts`); la UI solo esconde lo que no corresponde.

### Permisos por rol, siempre claros

- Los roles siguen siendo **tres fijos** (`superadmin`, `admin`, `empleado`); no hay permisos sueltos por usuario (eso sería un objetivo aparte).
- Una **única fuente de verdad** en el backend (`CAPACIDADES` en `domain/permisos.ts`): lista de capacidades en español con qué roles pueden cada una (y el matiz cuando es parcial: "el empleado solo puede pasarlos a Completado"). Las funciones `puede*` existentes y la tabla que ve el usuario salen de la misma lista, con un test que verifica que coinciden.
- La UI la muestra en tres lugares: (1) **Usuarios → "Permisos por rol"**: tabla con una columna por rol; (2) al **elegir el rol** en el diálogo de crear/editar un usuario, un resumen de lo que va a poder y no poder hacer; (3) para **cualquier persona**, tocando su rol en el encabezado del panel: "Tu rol: Empleado — Podés: … · No podés: …".

### Gráficos

- **Sin librería de gráficos**: SVG propio (como el resto del proyecto, sin dependencias nuevas), con la skill `dataviz` como guía de diseño. Se carga de forma diferida (el panel no engorda para quien no abre Estadísticas).
- Gráficos: ingresos en el tiempo (barras), ranking de servicios (barras horizontales: pedidos y completados), ranking del equipo (barras horizontales), cuándo vienen los clientes (mapa de calor día de la semana × mañana/tarde), y estado de los turnos (barra apilada).
- Todos accesibles: nombre y descripción, valores visibles sin pasar el mouse (en el celular, tocar muestra el dato), y **tabla de datos alternativa** ("Ver los números") para lectores de pantalla; no dependen solo del color. **Descargar CSV** del período.
- Celular primero (390 px sin desborde); el panel es claro, así que los gráficos usan las variables del panel.

## Base de datos

Migración nueva en `backend/supabase/migrations/` sobre `mgdetailing.bookings`:

- `monto integer null`, CHECK `between 0 and 99999999`.
- `trabajador_id uuid null` → `perfiles(id)` `on delete set null`, con índice.
- CHECK de coherencia: `monto` y `trabajador_id` solo pueden tener valor si `estado = 'completado'`.
- `grant update (monto, trabajador_id)` a `mgdetailing_app`.
- Que editar solo `monto` o `trabajador_id` **no cambie `updated_at`** (es el "actualizado el" que ve el cliente en el seguimiento): extender la condición del trigger de `updated_at`, como se hizo con `recordatorio_enviado_at`, si se puede hacer sin romper nada.
- Índice(s) que hagan falta para las agregaciones (por fecha de agenda y estado; la tabla es chica, no sobreindexar).
- **No se aplica a Supabase remoto sin pasar las pruebas.**

## Modelo `Turno` (cambios)

Se agregan dos campos al JSON de turno (listado, PATCH, agenda y todo lo que devuelva turnos):

| Campo | Tipo | Notas |
|---|---|---|
| `monto` | integer \| null | pesos; solo en completados; **solo admin y superadmin lo reciben con valor** (para el empleado siempre `null`) |
| `trabajador` | `{ "id": uuid, "nombre": string }` \| null | `nombre` = nombre de la persona o, si no tiene, su email; null = sin asignar |

El panel valida las respuestas en modo estricto: los dos lados se actualizan juntos.

## Endpoints

Formato de error, CSRF, rate limit y `strictObject`: igual que el resto de la API.

### `PATCH /api/admin/bookings/:id` (amplía el actual)

Se suman `monto` (entero 0–99.999.999 o `null`) y `trabajadorId` (uuid o `null`).

- Solo valen si el turno **queda** `completado` (en el mismo pedido o ya lo está); si no → `400` con `fields.monto` / `fields.trabajadorId`.
- **Admin / superadmin**: pueden mandar `monto` y `trabajadorId` (persona activa; si no existe o está inactiva → `400` con `fields.trabajadorId`). Pueden editarlos sobre un turno ya completado.
- **Empleado**: al pasar un turno a `completado` el `trabajador` queda **él mismo** (si manda `trabajadorId` de otra persona o cualquier `monto` → `403`). No puede editar cobro de un turno ya completado (`403`).
- Si el `estado` pasa a algo distinto de `completado`, `monto` y `trabajador` se limpian.
- Cualquier combinación se valida entera antes de guardar nada (como hoy).

### `GET /api/admin/trabajadores` (admin, superadmin)

`200 { "trabajadores": [{ "id", "nombre", "rol" }] }`: personas **activas** de cualquier rol, ordenadas por nombre. Para el selector "¿Quién lo hizo?".

### `GET /api/admin/estadisticas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` (admin, superadmin)

Rango inclusivo, `hasta >= desde`, máximo 366 días (`400` con `fields.desde`/`fields.hasta` si no). Si faltan, el mes actual hasta hoy.

```json
{
  "rango": { "desde": "2026-10-01", "hasta": "2026-10-26" },
  "granularidad": "dia",
  "resumen": {
    "hoy":  { "actual": { "completados": 3, "ingresos": 95000 }, "anterior": { "completados": 2, "ingresos": 60000 } },
    "mes":  { "actual": {...}, "anterior": {...} },
    "anio": { "actual": {...}, "anterior": {...} }
  },
  "periodo": {
    "turnos": 40, "pedidos": 36, "pendientes": 4, "confirmados": 6, "completados": 24, "cancelados": 4,
    "ingresos": 1240000, "ticketPromedio": 51666, "completadosSinMonto": 3, "tasaCancelacion": 0.1
  },
  "serie": [ { "clave": "2026-10-01", "completados": 2, "ingresos": 80000 } ],
  "porServicio": [ { "servicioId": "lavado-premium", "nombre": "Lavado Premium", "pedidos": 14, "completados": 10, "ingresos": 600000 } ],
  "porTrabajador": [ { "id": "…" , "nombre": "Lucas", "completados": 12, "ingresos": 560000 } ],
  "porDiaSemana": [ { "dia": 1, "manana": 5, "tarde": 3 } ],
  "completadosSinTrabajador": 2
}
```

- `serie`: **todos** los días (o meses) del rango, con ceros donde no hubo nada (el gráfico no tiene que rellenar). `clave` = `YYYY-MM-DD` o `YYYY-MM`.
- `porServicio`: ordenado por `pedidos` descendente; incluye servicios sin pedidos solo si están activos (con 0); un servicio desactivado aparece solo si tuvo pedidos. `porTrabajador`: ordenado por `completados` descendente; `id: null` con `nombre: "Sin asignar"` agrupa los completados sin trabajador. `porDiaSemana`: 0 = domingo … 6 = sábado, con `manana` y `tarde` = pedidos de ese día de la semana en el rango.
- `ticketPromedio`, `tasaCancelacion` y las comparaciones son `null` cuando el denominador es 0.

### `GET /api/admin/estadisticas/mias?desde&hasta` (todos los roles)

Mismo rango que arriba. `200 { "rango", "completados": N, "porServicio": [{ servicioId, nombre, completados }], "serie": [{ clave, completados }] }` con los turnos que **esa persona** completó. Nunca importes.

### `GET /api/admin/permisos` (todos los roles)

```json
{
  "roles": [ { "id": "empleado", "nombre": "Empleado", "descripcion": "…" } ],
  "capacidades": [
    { "id": "turnos.ver", "grupo": "Turnos", "texto": "Ver los turnos y la agenda",
      "roles": { "superadmin": "si", "admin": "si", "empleado": "si" } },
    { "id": "turnos.estado", "grupo": "Turnos", "texto": "Cambiar el estado de un turno",
      "roles": { "superadmin": "si", "admin": "si", "empleado": "parcial" },
      "matiz": { "empleado": "Solo puede marcarlos como Completado" } }
  ],
  "tuRol": "empleado"
}
```

Valores de `roles[...]`: `"si"`, `"no"` o `"parcial"`. Las capacidades cubren **todo** lo que hoy decide `domain/permisos.ts` más lo nuevo: turnos (ver, cambiar estado, reprogramar, borrar, notas internas, clientes e historial), cobro (registrar y corregir monto y trabajador), catálogo (ver, editar), disponibilidad (ver, editar), estadísticas (completas con importes, las propias), usuarios (gestionar), avisos push (activar en su dispositivo). Los textos de `descripcion` de los roles se actualizan en la tabla `roles` (migración) para que digan lo mismo que la matriz.

## Panel (frontend)

### Cobro y trabajador (en Turnos, Agenda y Hoy: donde aparezca la tarjeta del turno)

- "Marcar completado" abre en la tarjeta los campos **¿Cuánto cobraste?** y **¿Quién lo hizo?** (admin) o completa directo (empleado). Valida (entero ≥ 0), muestra errores `fields.monto` / `fields.trabajadorId` en su campo, foco correcto, sin perder lo escrito.
- Un turno completado muestra "**Cobrado $ 60.000 · Lucas**" o "**Sin cobro cargado**" (con botón "Cargar cobro" para admin).
- En **Hoy**: un aviso "**N trabajos completados sin cobro cargado**" para admin que lleva a esos turnos.

### Estadísticas (sección nueva, entre Hoy y Turnos o al final, a criterio del diseño)

Rango elegible (por defecto "Este mes"), las tres tarjetas Hoy / Este mes / Este año con su comparación, y los gráficos descritos arriba; aviso de "sin cobro cargado" cuando corresponda; Descargar CSV. Empleado: vista "Mis trabajos". Estados de carga (esqueleto), vacío ("Todavía no hay datos en este período"), error con reintentar y sesión vencida como el resto.

### Permisos

Usuarios → "Permisos por rol" (tabla), resumen al elegir rol en el diálogo de usuario, y "Tu rol" al tocar el rol en el encabezado.

## Lo que necesita el dueño

- **Cargar los precios y completar con cobro**: las estadísticas solo cuentan lo que se registra. Los turnos viejos completados quedan "sin cobro cargado" hasta que los cargues desde la tarjeta.

## Estado

- [x] Backend: migración, PATCH ampliado, trabajadores, estadísticas (completas y propias), permisos (fuente única), tests, README.
- [x] Frontend, estadísticas: sección, gráficos SVG, rango, CSV, "Mis trabajos", tests.
- [x] Frontend, cobro y permisos: completar con cobro y trabajador, tarjeta, aviso en Hoy, matriz de permisos, resumen al elegir rol, "Tu rol", tests.
- [x] Verificación: todo en verde, revisión cruzada (respuestas reales del backend contra los esquemas del panel), casos borde (fin de mes y año, años bisiestos, comparaciones con períodos vacíos, empleado sin acceso a importes), migración probada sobre una base con turnos.
- [x] Aplicar la migración en Supabase (2026-10-26: columnas, índices y descripciones de roles; advisors sin hallazgos nuevos). Revisión visual en Edge a 390 y 1280 px con datos de ejemplo: se corrigieron "Tu rol" (texto blanco sobre blanco por heredar el color del encabezado) y los permisos duplicados en pantalla ancha.
