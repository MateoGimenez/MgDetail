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
