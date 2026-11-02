# Precios por tipo de vehículo (auto, camioneta, moto) — 2026-11-01

Pedido del dueño: cada servicio puede tener un precio distinto según el vehículo. Las cards de la landing muestran el
precio del tipo elegido (auto / camioneta / moto) y el dueño los edita desde el panel (Servicios).

## Decisión de modelo (aditiva, sin romper nada)

Hoy hay una sola columna `precio_desde` (entero ARS, null = "Consultá"). Se mantiene como el precio de **auto** (así
no cambia el significado de nada que ya existe: cobro, presupuestos, JSON-LD, tests) y se suman dos columnas:

| Tipo | Columna | Campo de la API |
|---|---|---|
| auto | `precio_desde` (existente) | `precioDesde` (existente) |
| camioneta | `precio_desde_camioneta` (nueva) | `precioDesdeCamioneta` |
| moto | `precio_desde_moto` (nueva) | `precioDesdeMoto` |

- Las tres: entero en ARS de 0 a 99.999.999, o `null` = "Consultá". Mismas validaciones y mismos mensajes que `precioDesde`.
- Si el precio del tipo elegido es `null` se muestra **"Consultá"** (nunca se cae al precio de auto: sería engañoso).
- Migración **aditiva**: `backend/supabase/migrations/20261101100000_precios_por_vehiculo.sql` agrega las dos columnas
  `integer` nullable con CHECK `<= 99999999` (y `>= 0`), y amplía los GRANT de INSERT/UPDATE por columna de
  `mgdetailing_app` (mismo modelo que `precio_desde`). No toca filas existentes. Es compatible hacia atrás: el backend
  viejo sigue andando con las columnas nuevas. **No se aplica a Supabase sin que yo la revise y pasen las pruebas.**

## Backend (`mg-backend`)

- Dominio/esquemas/repositorio/rutas de servicios (`domain/servicios.ts`, `schemas/servicios.ts`,
  `repositories/postgres/servicios.ts`, `routes/admin-servicios.ts` y la ruta pública `GET /api/servicios`):
  leer, devolver, crear y editar (`POST`/`PATCH` del panel) los dos campos nuevos. En crear, si no vienen = `null`.
  En editar, lo que no viene no cambia; `null` borra el precio. `GET /api/servicios` (público) los incluye.
- Mismos permisos que ya tiene editar el catálogo (CAPACIDADES, sin cambios de roles).
- El cobro de un turno completado (`monto`) no cambia. No tocar estadísticas.
- Tests: crear/editar/borrar cada precio, límites (0, 99.999.999, 100.000.000, negativo, decimal, texto), `null`,
  que el público los vea, que el empleado no pueda editarlos, migración sobre base con datos y GRANT mínimo.
- Regenerar la fixture compartida: `ACTUALIZAR_FIXTURES=1 npx vitest run test/integracion-objetivo8.test.ts`
  (archivo `frontend/src/api/fixtures-backend/respuestas.json`); la toca SOLO el backend.
- Actualizar `backend/README.md` (tabla/endpoint de servicios) y este contrato.

## Frontend (`mg-frontend`, skill `impeccable`)

**Landing**
- Sobre las cards (sección Servicios) un selector de tipo de vehículo **Auto / Camioneta / Moto** (segmentado,
  accesible, teclado, 390 px y escritorio; mismas etiquetas `ETIQUETA_VEHICULO`). Por defecto **Auto**.
- Las cards (y `PaginaServicio` `/servicios/:id`) muestran el precio del tipo elegido: "Desde $ X" o "Consultá".
  El cambio de tipo es instantáneo (sin pedir nada a la API) y con transición sutil del número (respetar
  `prefers-reduced-motion`).
- La elección se comparte con la reserva: el selector de vehículo del hero y del formulario de turno y el selector de
  las cards son el mismo estado (si elegís "Moto" en las cards, el formulario de reserva queda con Moto, y al revés).
  Al tocar "Reservar" en una card se preselecciona servicio **y** tipo. Revisar `ReservaProvider`,
  `reserva-contexto.ts`, `Hero.tsx`, `useFormularioTurno.ts`, `ResumenPedido.tsx` y el enlace profundo
  `/?servicio=<id>#reservar`.
- `ResumenPedido` (resumen de la reserva): que el precio mostrado corresponda al tipo elegido.
- `lib/seoServicio.ts` (JSON-LD): `lowPrice` = el menor precio no nulo entre los tres; si no hay ninguno, sin oferta.
- Cuidar el layout: el selector no debe alargar la sección ni romper en 390 px; las cards no "saltan".

**Panel (/admin → Servicios)**
- `DialogoServicio.tsx`: tres campos de precio claros ("Precio desde — Auto / Camioneta / Moto"), vacío = "Consultá",
  con la misma validación (`validacionServicio.ts`) y los mismos mensajes; errores del servidor en su campo.
- `FilaServicio.tsx`: mostrar los tres precios de forma compacta (celular y escritorio).
- Cobro (`admin/cobro/FormularioCobro.tsx`, `contextoCobro.ts`, `Panel.tsx`): el monto sugerido de un trabajo debe
  tomar el precio del tipo de vehículo del turno (hoy toma el de auto); si es null, sin sugerencia.
- Clientes/esquemas zod estrictos: `api/contract.ts`, `api/contract-panel.ts`, `api/servicios*.ts`; actualizar tipos
  (`types.ts`), `data/servicios.ts` (`textoPrecio`, respaldo sin precios) y los tests.
- Los tests de contrato contra la fixture (`api/contrato-backend*.test.ts`) dependen de que el backend regenere la
  fixture: correrlos al final, cuando el Estado de abajo diga "backend listo".

## Verificación y cierre
- `mg-pruebas`: corre todo, compara backend ↔ frontend (forma de los campos nuevos, errores, permisos), casos límite,
  migración, y que nada de lo existente cambió (precio de auto, cobro, presupuestos, SEO).
- Yo: reviso, aplico la migración en Supabase (antes del push: Render despliega solo al subir a `main`), saco capturas
  y subo a git.

## Estado
- [x] **Backend LISTO (2026-11-01)**: migración + API + tests + fixture + README. Fixture `frontend/src/api/fixtures-backend/respuestas.json` regenerada (solo se agregaron capturas, nada existente cambió): `serviciosPublico`, `serviciosAdmin`, `servicioCrea`, `servicioPatchPrecios`, `servicioPatchBorraPrecio`, `error400PrecioCamioneta`, `error400PrecioMoto`, `error403ServicioEmpleado`. El frontend ya puede correr `api/contrato-backend*.test.ts`.
  - Forma JSON exacta del contrato: `Servicio` (panel) y servicio público suman `precioDesdeCamioneta` y `precioDesdeMoto` (`number | null`, entero 0 a 99.999.999, mismo mensaje de error que `precioDesde`: "El precio tiene que ser un número entero de pesos, de 0 a 99.999.999, o null (\"Consultá\")."). POST: si no vienen = `null`; PATCH: lo que no viene no cambia, `null` borra. Error de validación en `fields.precioDesdeCamioneta` / `fields.precioDesdeMoto`. Empleado: 403 al crear/editar, ve los tres precios al listar (igual que `precioDesde`).
  - Extra: el arranque del backend verifica que existan las columnas nuevas ("Faltan columnas en mgdetailing.servicios (...)"), como con las migraciones anteriores: **aplicar la migración antes del push**.
  - Verificado: vitest 44 archivos / 711 tests OK (más la fixture), tsc y eslint sin errores. Migración NO aplicada a Supabase.
- [x] Frontend: landing (selector + cards + reserva + SEO) y panel (diálogo, fila, cobro) + tests
  (hecho 2026-11-01: `lib/precios.ts`, `landing/SelectorVehiculo.tsx`, estado compartido en `ReservaProvider`; verificado con capturas
  en 390 y 1280, oscuro y claro, contra el backend del repo en PGlite. Tests de contrato contra la fixture regenerada: OK (vitest 52 archivos / 529 tests, tsc, eslint y build en verde).)
- [x] Pruebas: revisión cruzada y casos límite (2026-11-01, ver "Hallazgos de mg-pruebas")
- [ ] Capturas, migración aplicada en Supabase, push

## Hallazgos de mg-pruebas (2026-11-01)

**Resultados.** Backend: tsc y eslint sin errores; vitest 44 archivos / 712 tests OK (711 + 1 nuevo). Frontend: tsc -b, eslint, vitest 52 archivos / 529 tests y vite build OK. Nada rojo antes ni después.

**Contrato backend a frontend.** Las fixtures reales (pglite) de `serviciosPublico`, `serviciosAdmin`, `servicioCrea`, patches y errores validan contra los esquemas zod estrictos del frontend (los tests `contrato-backend*` pasan). `precioDesdeCamioneta` / `precioDesdeMoto` = `number | null` en la ruta pública y en la del panel; errores en `fields.precioDesdeCamioneta` / `fields.precioDesdeMoto`; empleado 403 al crear/editar y ve los tres precios; el catálogo público es público. Sin diferencias.

**Migración.** Aditiva (columnas integer nullable con CHECK 0..99.999.999, sin default, sin tocar filas ni `updated_at`; GRANT por columna igual que `precio_desde`). Compatibilidad hacia atrás: se copió el backend de `git HEAD` a una carpeta temporal, se le sumó la migración nueva y se corrió su suite entera: 665 de 666 tests OK; los 2 rojos son artefactos de la copia (faltaba `frontend/public` y la fixture compartida), no del backend viejo. Hueco cubierto: no había test del chequeo de arranque; se agregó en `backend/test/postgres.test.ts` ("sin la migración de precios por vehículo falla con un mensaje claro"): `Faltan columnas en mgdetailing.servicios (precio_desde_camioneta, precio_desde_moto). Aplicá la migración precios_por_vehiculo ...`. Lista para aplicar (antes del push).

**Sin cambios en lo existente.** Precio de auto = `precioDesde`; cobro sugiere el precio del tipo del turno y `null` = sin sugerencia (nunca cae a auto); presupuestos sin tocar; JSON-LD usa el menor precio cargado y sin precios no hay oferta; respaldo del catálogo sin los tres precios; `?servicio=<id>&vehiculo=moto#reservar` y el viejo `?servicio=<id>#reservar` funcionan (un `vehiculo` inválido cae a lo recordado o a auto). Capturas del otro agente (390 px, selector y diálogo) revisadas: bien, sin desbordes.

**Errores arreglados:** ninguno encontrado.

**Dudas (no se cambiaron):**
1. Un precio 0 se muestra "Desde $ 0" (backend y panel lo aceptan, igual que antes con auto). Casi seguro es un error de carga; decidir si se rechaza o se muestra "Consultá".
2. El formulario de reserva ahora arranca con vehículo "Auto" ya elegido (antes "Sin elegir" y obligatorio): se puede enviar sin haber tocado el vehículo. Consecuencia del estado compartido.
3. El enlace "Reservar" de la cabecera no lleva `&vehiculo=`; usa lo recordado en memoria del módulo (se pierde al recargar). Aceptable.
4. Si un tipo no tiene precio y otro sí, la card muestra "Consultá" (como pide el contrato); el JSON-LD igual publica el menor precio.

---

# Parte 2 (pedido del dueño, mismo día): los servicios dependen del vehículo

"Cuando se elija el vehículo se verían los servicios para ese y el precio." No solo cambia el precio: **cada servicio
se ofrece para un conjunto de vehículos**, y la landing muestra solo los servicios del tipo elegido.

## Modelo

- Nueva columna `vehiculos text[] not null default array['auto','camioneta','moto']` en `mgdetailing.servicios`, con
  CHECK: entre 1 y 3 elementos, sin repetidos, todos de `{'auto','camioneta','moto'}`. Migración aditiva
  `backend/supabase/migrations/20261101110000_servicios_por_vehiculo.sql` (se aplica DESPUÉS de la
  `20261101100000_precios_por_vehiculo.sql`; ninguna de las dos está aplicada aún en Supabase). Los servicios que ya
  existen quedan en los tres (nada desaparece de la web). GRANT por columna de INSERT/UPDATE para `mgdetailing_app`.
- API: campo `vehiculos: ('auto'|'camioneta'|'moto')[]` (público y panel). En crear: opcional, por defecto los tres.
  En editar: lo que no viene no cambia. Mínimo uno (un servicio sin vehículos sería invisible: para eso está
  "desactivar"); error por campo `fields.vehiculos` con mensaje claro. Se devuelve en orden canónico auto, camioneta, moto.
- Un precio puede estar cargado para un tipo que el servicio no ofrece (se ignora en la web); el panel lo avisa.
- **Reserva (`POST /api/bookings`)**: si el servicio no se ofrece para el `vehiculoTipo` pedido, 400 con
  `fields.servicioId` ("Ese servicio no se ofrece para <tipo>. Elegí otro."). Es defensa del servidor (el formulario ya
  filtra). Los turnos que ya existen no se tocan. Revisar también reprogramaciones o ediciones que cambien servicio o
  tipo si las hubiera.
- Sin migraciones que toquen datos. Los precios iniciales van en un SQL aparte que se corre a mano una vez:
  `backend/supabase/seeds/2026-11-01_precios-iniciales.sql` (NO dentro de `migrations/`: los tests aplican todas las
  migraciones y suponen precios en `null`). Debe ser idempotente y actualizar solo por `id`:

  | servicio | auto | camioneta | moto |
  |---|---|---|---|
  | `lavado-basico` | 20.000 | 30.000 | 10.000 |
  | `lavado-premium` | 40.000 | 50.000 | 15.000 |

  Los otros servicios (encerado, pulido, restauración de ópticas, y cualquier otro) NO se tocan: sin precios nuevos y
  disponibles para los tres vehículos; el dueño los ajusta desde el panel.

## Frontend

- Landing: al cambiar el selector Auto/Camioneta/Moto, las cards muestran **solo los servicios que se ofrecen para ese
  tipo**, con su precio; la cantidad de cards puede cambiar (transición suave, sin saltos bruscos de layout;
  `prefers-reduced-motion`). La bajada de la sección ("Cinco servicios…") cuenta los del tipo elegido. Si un tipo no
  tiene ningún servicio, mostrar un estado vacío amable con el botón de WhatsApp.
- El formulario de reserva (select de servicio) y el resumen muestran solo los servicios del tipo elegido; si se cambia
  el tipo y el servicio elegido no aplica, se limpia el servicio (con aviso accesible) en vez de enviarlo inválido.
  El enlace profundo `/?servicio=<id>&vehiculo=moto#reservar`: si el servicio no aplica a ese tipo, no se preselecciona.
- `/servicios/:id`: si el servicio no se ofrece para el tipo elegido, decirlo claro (p. ej. "Este servicio no se ofrece
  para motos") con los tipos para los que sí, y sin botón de reservar para ese tipo.
- JSON-LD (`lowPrice`): menor precio entre los tipos que el servicio ofrece.
- Panel: en `DialogoServicio` un grupo "Se ofrece para" con tres casillas (Auto / Camioneta / Moto, al menos una) y los
  precios por tipo; el precio de un tipo que no se ofrece se deshabilita o se avisa que no se verá. `FilaServicio`
  muestra para qué vehículos se ofrece cada servicio y sus precios. Mismos mensajes de error por campo.
- Esquemas zod estrictos, tipos y tests al día. Capturas 390/1280 en oscuro y claro (moto con menos servicios, estado
  vacío, formulario, panel).

## Estado (parte 2)
- [x] **Backend LISTO (parte 2, 2026-11-01)**: migración 2 + API + validación en reserva + seed SQL + tests + fixture regenerada (`frontend/src/api/fixtures-backend/respuestas.json`; capturas nuevas: `servicioPatchVehiculos`, `serviciosPublicoConVehiculos`, `error400Vehiculos`, `error400ReservaServicioNoOfrecido`; `serviciosPublico`/`serviciosAdmin` ya traen `vehiculos`).
  - Forma JSON: `vehiculos: ("auto"|"camioneta"|"moto")[]` en el servicio público y del panel, siempre en orden canónico. POST: opcional, por defecto los tres; PATCH: lo que no viene no cambia. Cualquier error (vacío, repetidos, tipo desconocido, no es lista, `null`) sale en `fields.vehiculos` (nunca `vehiculos.0`). Mensajes: vacío / no lista / null = "Elegí al menos un vehículo (auto, camioneta o moto) para el servicio."; tipo desconocido = "Los vehículos válidos son auto, camioneta y moto."; repetidos = "No repitas vehículos en la lista.". Empleado: 403 al crear o editar, ve el campo.
  - Reserva: `POST /api/bookings` con un servicio que no se ofrece para el `vehiculoTipo` => 400, `fields.servicioId` = "Ese servicio no se ofrece para <tipo>. Elegí otro." (también en el camino del honeypot). Turnos existentes y reprogramaciones no se tocan (reprogramar solo cambia fecha y franja).
  - Seed: `backend/supabase/seeds/2026-11-01_precios-iniciales.sql` (fuera de `migrations/`, idempotente, solo lavado-basico y lavado-premium). Arranque: `db/postgres.ts` exige la columna `vehiculos`. Ni las migraciones ni el seed están aplicados en Supabase.
- [x] Frontend: filtrado por vehículo + reserva + página de servicio + SEO + panel (2026-11-01; tsc, eslint, vitest 534 tests con la fixture regenerada y build en verde; capturas 390 y 1280, oscuro y claro, en el demo PGlite)
- [ ] Pruebas: revisión cruzada
- [ ] Migraciones aplicadas en Supabase (1 y 2), seed corrido, push
