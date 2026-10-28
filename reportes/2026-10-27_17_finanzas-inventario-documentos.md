# Objetivo 10: panel: gastos y ganancia neta, metas mensuales, inventario, presupuestos y comprobantes en PDF

## Pedido del dueño (textual)

"En el panel de funciones agregamos: gastos e insumos y ganancia neta, metas mensuales, presupuesto y comprobantes en PDF, e inventario."

Este documento es **el contrato** entre backend y frontend. Si algo hay que cambiarlo, se cambia acá primero. Se apoya en el objetivo 8 (`reportes/2026-10-26_15_estadisticas-y-permisos.md`): ingresos = suma de `monto` de los turnos completados, por fecha de agenda, en hora de La Rioja.

## Decisiones

- **Ganancia neta = ingresos − gastos** del período (criterio de caja: cuenta lo cobrado y lo gastado, no lo devengado). Los gastos se agrupan por la fecha del gasto. **No** se estiman costos de insumos por trabajo: lo que se compra se carga como gasto (a mano o desde Inventario), y se evita contarlo dos veces porque **una compra de inventario crea automáticamente su gasto**.
- **Quién ve qué**: gastos, metas, presupuestos, comprobantes y datos del taller → **superadmin y admin** (el empleado recibe 403). **Inventario**: todos los roles lo **ven** y registran **uso** (salidas); crear/editar insumos, **compras** y **ajustes** → solo admin y superadmin; **el empleado nunca recibe costos ni valores en pesos** del inventario (`costoUnitario`, `valorEnStock`, `costoTotal`, `valorTotal` van `null`).
- Las capacidades nuevas se suman a `CAPACIDADES` (fuente única de permisos, objetivo 8) para que "Permisos por rol" y "Tu rol" las muestren sin tocar el frontend.
- **Presupuestos y comprobantes NO son facturas.** Los PDF llevan la leyenda: presupuesto → "Presupuesto no vinculante hasta su aceptación. No es una factura."; comprobante → "Comprobante de pago interno. No es una factura ni tiene validez fiscal." (La facturación electrónica de ARCA no está incluida.)
- PDF generados en el **backend** con `pdfkit` (fuentes estándar, soportan acentos y ñ), a partir de los datos guardados. Nunca se guarda el PDF: se regenera igual cada vez.
- Moneda: pesos argentinos enteros (sin centavos), `$ 12.500`. Fechas en hora de La Rioja.
- Nada de datos personales extra: los presupuestos y comprobantes guardan solo nombre y teléfono del cliente, vehículo (texto) y lo que se cobra.

## Base de datos (migraciones nuevas, nunca se editan las existentes; no se aplican a Supabase remoto sin pasar las pruebas)

Todas las tablas nuevas: RLS habilitado, `REVOKE` a `public`, `anon`, `authenticated`, `service_role`, `GRANT` mínimo a `mgdetailing_app` con sus policies (mismo modelo que las anteriores), `CHECK` de rango/largo como segunda defensa, `created_at`/`updated_at` con el trigger existente.

**M1 `20261028100000_finanzas_gastos_metas_taller.sql`**
- `gastos(id uuid pk, fecha date, categoria text, descripcion text, monto integer, proveedor text null, origen text default 'manual', creado_por uuid null → perfiles on delete set null, created_at, updated_at)`: `categoria in ('insumos','herramientas','alquiler','servicios','sueldos','publicidad','mantenimiento','impuestos','otros')`, `origen in ('manual','inventario')`, `monto between 1 and 99999999`, `descripcion` 1–120, `proveedor` ≤ 80, índice por `fecha`.
- `metas_mensuales(mes date pk (siempre día 1), ingresos_objetivo integer null, trabajos_objetivo integer null, created_at, updated_at)`: al menos uno no nulo; ingresos 1–999.999.999, trabajos 1–9999.
- `taller(id smallint pk check (id = 1), nombre text not null default 'MgDetailing', telefono text null, direccion text null, instagram text null, cuit text null, leyenda_pdf text null, updated_at)`: una sola fila, sembrada con `nombre = 'MgDetailing'`, `telefono = '5493804781737'`, `direccion = 'Calle Olta Pasaje N2, La Rioja'`. `telefono` = solo dígitos internacional (8–15); `cuit` = 11 dígitos o `NN-NNNNNNNN-N`; `instagram` sin `@`.

**M2 `20261028110000_inventario.sql`**
- `insumos(id uuid pk, nombre text, categoria text null, unidad text, stock numeric(12,2) default 0 check (>= 0), stock_minimo numeric(12,2) default 0, costo_unitario integer null, activo boolean default true, created_at, updated_at)`; `unidad in ('unidad','litro','ml','kg','g','par','caja')`; nombre único (sin distinguir mayúsculas) entre activos.
- `movimientos_stock(id uuid pk, insumo_id → insumos on delete restrict, tipo text ('compra','uso','ajuste'), cantidad numeric(12,2) (con signo: compra +, uso −, ajuste ±), costo_total integer null, proveedor text null, nota text null (≤ 200), turno_id uuid null → bookings on delete set null, gasto_id uuid null unique → gastos on delete set null, perfil_id uuid null → perfiles on delete set null, created_at)`.
- El stock se actualiza **en la misma transacción** que el movimiento, con un bloqueo por insumo (`pg_advisory_xact_lock`), y el `CHECK (stock >= 0)` es la red de seguridad: dos usos simultáneos no pueden dejar el stock negativo.

**M3 `20261028120000_presupuestos_comprobantes.sql`**
- `presupuestos(id uuid pk, numero integer generated always as identity unique, cliente_nombre text (1–80), cliente_telefono text null, vehiculo text null (≤ 80), items jsonb (1–30 ítems), descuento integer default 0, total integer, validez_dias smallint default 7 (1–90), estado text default 'borrador' ('borrador','enviado','aceptado','rechazado'), notas text null (≤ 500), turno_id uuid null → bookings on delete set null, creado_por uuid null → perfiles on delete set null, created_at, updated_at)`. Cada ítem: `{descripcion (1–120), cantidad (> 0, ≤ 999, 2 decimales), precioUnitario (0–99.999.999)}` con una función de validación `IMMUTABLE` como en el catálogo. `total` lo calcula el backend.
- `comprobantes(id uuid pk, numero integer generated always as identity unique, booking_id uuid not null unique → bookings on delete restrict, fecha_emision date, forma_pago text, cliente_nombre text, servicio_nombre text, vehiculo text null, monto integer, notas text null (≤ 200), creado_por uuid null → perfiles on delete set null, created_at)`. Es una **foto** del momento (nombre, servicio y monto copiados), para que no cambie si después se edita el turno. `forma_pago in ('efectivo','transferencia','debito','credito','otro')`.

## Endpoints

Formato de error, CSRF, rate limit, `strictObject` y `{ fields }` en los 400: igual que el resto de la API. Todos exigen sesión (`/api/admin/...`).

### Datos del taller (admin, superadmin)
- `GET /api/admin/taller` → `200 { "taller": { "nombre", "telefono", "direccion", "instagram", "cuit", "leyendaPdf" } }` (los opcionales pueden ser `null`).
- `PUT /api/admin/taller` con esos seis campos (los opcionales aceptan `null` para vaciar) → `200 { "taller" }`.

### Gastos (admin, superadmin)
Categorías (clave → etiqueta): `insumos` Insumos, `herramientas` Herramientas, `alquiler` Alquiler, `servicios` Servicios (luz, agua, internet), `sueldos` Sueldos, `publicidad` Publicidad, `mantenimiento` Mantenimiento, `impuestos` Impuestos, `otros` Otros.

`Gasto` = `{ "id", "fecha": "YYYY-MM-DD", "categoria", "descripcion", "monto": 12500, "proveedor": string|null, "origen": "manual"|"inventario", "creadoPor": { "id", "nombre" } | null, "createdAt", "updatedAt" }`.

- `GET /api/admin/gastos?desde=&hasta=&categoria=&q=&limit=&offset=` → `200 { "gastos": Gasto[], "total": N, "suma": N }` (`suma` = total en pesos de todo el filtro, no solo la página). Por defecto, el mes actual; `limit` 1–100 (50); orden fecha descendente. `q` busca en descripción y proveedor (sin distinguir mayúsculas ni acentos; comodines tratados como texto).
- `POST /api/admin/gastos` `{ fecha, categoria, descripcion, monto, proveedor? }` → `201 { "gasto" }`. La fecha no puede ser futura (`400` con `fields.fecha`).
- `PATCH /api/admin/gastos/:id` (al menos un campo) → `200 { "gasto" }`. `404` si no existe.
- `DELETE /api/admin/gastos/:id` → `204`.
- Un gasto con `origen = "inventario"` **no se edita ni se borra desde acá**: `409` con código `GASTO_DE_INVENTARIO` y el mensaje "Este gasto viene de una compra de inventario: corregilo desde Inventario."

### Metas mensuales (admin, superadmin)
- `GET /api/admin/metas/actual` → `200`:
  ```json
  { "mes": "2026-10",
    "meta": { "ingresosObjetivo": 1500000, "trabajosObjetivo": 40 } ,
    "progreso": { "ingresos": 1096000, "trabajos": 32, "porcentajeIngresos": 0.7307, "porcentajeTrabajos": 0.8,
      "diasDeAtencionTranscurridos": 20, "diasDeAtencionRestantes": 5, "diasDeAtencionTotales": 25,
      "proyeccionIngresos": 1370000, "necesarioPorDia": 80800,
      "estado": "en-ritmo" } }
  ```
  `meta` es `null` si no hay meta (`estado: "sin-meta"` y los porcentajes/proyección en `null`). **Días de atención** = días en que el taller atiende según el horario semanal y los días especiales (domingos y feriados cerrados no cuentan; un día especial abierto sí). `proyeccionIngresos` = ingresos ÷ transcurridos × totales (`null` si no hay transcurridos). `necesarioPorDia` = (objetivo − ingresos) ÷ restantes (`0` si ya se cumplió; `null` si no hay restantes). `estado`: `cumplida` (≥ 100 % del objetivo), si no, con `esperado = objetivo × transcurridos ÷ totales`: `adelantado` (ingresos ≥ 110 % de lo esperado), `en-ritmo` (90–110 %), `atrasado` (< 90 %).
- `GET /api/admin/metas?anio=YYYY` → `200 { "metas": [ { "mes": "2026-09", "ingresosObjetivo", "trabajosObjetivo", "ingresos", "trabajos", "cumplida": boolean } ] }` solo de los meses con meta, ordenados por mes.
- `PUT /api/admin/metas/:mes` (`YYYY-MM`, de 12 meses atrás a 12 adelante) `{ ingresosObjetivo?: int|null, trabajosObjetivo?: int|null }` (después de mezclar con lo guardado, al menos uno no nulo; si no, `400`) → `200 { "meta": { "mes", "ingresosObjetivo", "trabajosObjetivo" } }`.
- `DELETE /api/admin/metas/:mes` → `204`.

### Estadísticas (amplía `GET /api/admin/estadisticas`, solo admin y superadmin)
- `resumen.{hoy,mes,anio}.{actual,anterior}` suman `gastos` (entero) y `ganancia` (ingresos − gastos; puede ser negativa).
- `periodo` suma `gastos`, `gananciaNeta` y `margen` (gananciaNeta ÷ ingresos; `null` si ingresos es 0).
- `serie[]` suma `gastos` (mismas claves de día/mes que ya trae).
- Nuevo `gastosPorCategoria: [{ "categoria", "monto" }]` (monto descendente, solo > 0).
- Los endpoints del empleado (`/mias`) no cambian.

### Inventario
`Insumo` = `{ "id", "nombre", "categoria": string|null, "unidad", "stock": 4.5, "stockMinimo": 2, "costoUnitario": int|null, "activo": boolean, "bajoStock": boolean, "valorEnStock": int|null, "updatedAt" }`. `bajoStock` = `stockMinimo > 0 && stock <= stockMinimo`. `valorEnStock` = `round(stock × costoUnitario)` (`null` si no hay costo). Para el **empleado**, `costoUnitario` y `valorEnStock` son siempre `null`.

- `GET /api/admin/insumos?q=&bajoStock=true&activo=true|false|todos&limit=&offset=` (todos los roles) → `200 { "insumos": Insumo[], "total": N, "bajoStock": N, "valorTotal": int|null }` (`bajoStock` = cantidad de insumos activos con stock bajo en **todo** el inventario, no solo en la página; `valorTotal` `null` para el empleado). Orden: stock bajo primero, después por nombre. `limit` 1–100 (50); por defecto solo activos.
- `POST /api/admin/insumos` (admin, superadmin) `{ nombre, categoria?, unidad, stockInicial?, stockMinimo?, costoUnitario? }` → `201 { "insumo" }`. Un `stockInicial` > 0 deja un movimiento de ajuste "Stock inicial". Nombre repetido entre activos → `409` con `fields.nombre`.
- `PATCH /api/admin/insumos/:id` (admin, superadmin) `{ nombre?, categoria?, unidad?, stockMinimo?, costoUnitario?, activo? }` → `200 { "insumo" }`. No se borran insumos: se desactivan.
- `GET /api/admin/insumos/:id/movimientos?limit=&offset=` (todos) → `200 { "movimientos": [ { "id", "tipo": "compra"|"uso"|"ajuste", "cantidad": -1.5, "costoTotal": int|null, "proveedor": string|null, "nota": string|null, "persona": { "id", "nombre" } | null, "turnoId": string|null, "createdAt" } ], "total": N }` (`costoTotal` `null` para el empleado). Más nuevos primero.
- `POST /api/admin/insumos/:id/movimientos` → `201 { "insumo", "movimiento" }`, según `tipo`:
  - `{ "tipo": "uso", "cantidad": 0.5, "nota"?, "turnoId"? }` (**todos los roles**): resta stock; si no alcanza → `409` código `STOCK_INSUFICIENTE` con `fields.cantidad` ("Solo quedan 0,3 litros.").
  - `{ "tipo": "compra", "cantidad": 5, "costoTotal"?: 12500, "proveedor"?, "nota"? }` (admin, superadmin): suma stock; si hay `costoTotal` > 0, **crea el gasto** (`categoria: "insumos"`, `origen: "inventario"`, fecha de hoy, descripción `Compra: <nombre> (<cantidad> <unidad>)`) vinculado al movimiento, y actualiza `costoUnitario` = `round(costoTotal ÷ cantidad)`. Todo en una transacción.
  - `{ "tipo": "ajuste", "stockReal": 3, "nota"? }` (admin, superadmin): conteo físico; el movimiento guarda la diferencia con signo (si es 0, devuelve el insumo sin crear movimiento).
- Cantidades: número con hasta 2 decimales, > 0 (en `uso` y `compra`), ≤ 999999.

### Presupuestos (admin, superadmin)
`Presupuesto` = `{ "id", "numero": 7, "codigo": "P-0007", "clienteNombre", "clienteTelefono": string|null, "vehiculo": string|null, "items": [ { "descripcion", "cantidad": 1, "precioUnitario": 25000 } ], "descuento": 0, "subtotal": 25000, "total": 25000, "validezDias": 7, "venceEl": "YYYY-MM-DD", "estado": "borrador"|"enviado"|"aceptado"|"rechazado", "vencido": boolean, "notas": string|null, "turnoId": string|null, "creadoPor": { "id", "nombre" } | null, "createdAt", "updatedAt" }`. `subtotal` = suma de `round(cantidad × precioUnitario)`; `total` = `max(0, subtotal − descuento)`; `venceEl` = fecha de creación + `validezDias`; `vencido` = `borrador` o `enviado` con `venceEl` ya pasado (en La Rioja).

- `GET /api/admin/presupuestos?estado=&q=&limit=&offset=` → `200 { "presupuestos", "total" }` (más nuevos primero; `q` busca en cliente, vehículo y código).
- `POST /api/admin/presupuestos` `{ clienteNombre, clienteTelefono?, vehiculo?, items, descuento?, validezDias?, notas?, turnoId? }` → `201 { "presupuesto" }`.
- `GET /api/admin/presupuestos/:id` → `200 { "presupuesto" }`.
- `PATCH /api/admin/presupuestos/:id` (cualquier campo; `items` se reemplaza entero; `estado` cambia libremente entre los cuatro valores) → `200 { "presupuesto" }`.
- `DELETE /api/admin/presupuestos/:id` → `204`; si está `aceptado` → `409` con código `PRESUPUESTO_ACEPTADO`.
- `GET /api/admin/presupuestos/:id/pdf` → `200`, `Content-Type: application/pdf`, `Content-Disposition: inline; filename="Presupuesto-P-0007.pdf"`, `Cache-Control: no-store`. Contenido: logo y datos del taller (de `taller`), código y fecha, validez, cliente y vehículo, tabla de ítems (descripción, cantidad, precio unitario, importe), descuento, **total**, notas, y la leyenda "no vinculante / no es una factura" (más `leyendaPdf` del taller si hay).

### Comprobantes (admin, superadmin)
`Comprobante` = `{ "id", "numero", "codigo": "R-0001", "fechaEmision": "YYYY-MM-DD", "formaPago", "monto", "clienteNombre", "servicioNombre", "vehiculo": string|null, "notas": string|null }`.
- `POST /api/admin/bookings/:id/comprobante` `{ formaPago, notas? }` → `201 { "comprobante" }`. **Idempotente**: si el turno ya tiene comprobante, devuelve `200` con el existente (no se emite otro). Si el turno no está completado o no tiene `monto` → `400` con el mensaje "Primero cargá el cobro del trabajo.".
- `GET /api/admin/bookings/:id/comprobante` → `200 { "comprobante" }` o `404`.
- `GET /api/admin/comprobantes/:id/pdf` → `application/pdf` (mismas cabeceras; nombre `Comprobante-R-0001.pdf`): logo y datos del taller, código y fecha, cliente, servicio y vehículo, forma de pago, **monto**, notas y la leyenda "comprobante interno, no es factura".

### Sitemap (lo pide el objetivo 9, mismo agente de backend de M1)
`GET /sitemap.xml` y `robots.txt` con `Sitemap:` solo con `PUBLIC_URL` (ver `reportes/2026-10-27_16_landing-whatsapp-mapa-servicios.md`). CSP: `frame-src https://www.google.com/maps/`.

### Permisos (se suman a `CAPACIDADES`, objetivo 8)
Grupo **Finanzas**: "Ver y cargar los gastos del taller" (admin y superadmin: sí; empleado: no), "Fijar y seguir las metas mensuales" (idem). Grupo **Documentos**: "Armar presupuestos y descargarlos en PDF", "Emitir comprobantes de pago en PDF" (idem), "Editar los datos del taller que salen en los PDF" (idem). Grupo **Inventario**: "Ver el inventario" (todos: sí), "Registrar el uso de insumos" (todos: sí), "Crear insumos, cargar compras y ajustar el stock" (admin y superadmin: sí; empleado: no). La descripción de los roles en `roles.descripcion` se actualiza en la migración M1 para que diga lo mismo.

## Panel (frontend)

**Navegación**: con las secciones nuevas el panel pasa de 7 a 10 (Hoy, Estadísticas, Turnos, Agenda, **Finanzas**, **Presupuestos**, **Inventario**, Disponibilidad, Servicios, Usuarios). Hay que reordenar la navegación para que no se amontone: agrupada (por ejemplo "Operación", "Negocio" y "Ajustes") o con un menú "Más", pero **cada sección a lo sumo en 2 toques en el celular**, con estado activo claro, sin desbordes a 390 px, accesible por teclado, y manteniendo `?vista=` (`hoy`, `turnos`, `agenda`, `estadisticas`, `finanzas`, `presupuestos`, `inventario`, `disponibilidad`, `servicios`, `usuarios`; los roles sin permiso caen en Hoy). Cada sección nueva se carga de forma diferida.

**Finanzas** (admin, superadmin): arriba, el resumen del mes (ingresos, gastos, **ganancia neta**, margen) con navegación de mes; dos pestañas: **Gastos** (lista del mes con filtro por categoría y búsqueda, "Agregar gasto", editar y borrar con confirmación, los gastos de inventario marcados y sin acciones, suma del filtro, esqueleto, vacío, error) y **Metas** (la meta de este mes con barra de progreso, ritmo, proyección, "te faltan $ X, $ Y por día de atención", estado en texto y no solo color; fijar o editar la meta; historial de meses anteriores cumplida / no cumplida).

**Estadísticas**: tarjetas Hoy / Este mes / Este año suman **Ganancia neta** con su comparación; el resumen del período suma gastos, ganancia y margen; gráfico nuevo **Ingresos vs. gastos** (barras agrupadas por día o mes) y **Gastos por categoría**; el CSV suma las columnas; aviso de "Meta del mes" con su barra.

**Hoy**: tarjeta de la **meta del mes** (barra y estado) y la ganancia neta del mes para admin; para todos, el aviso "N insumos con stock bajo" con enlace a Inventario filtrado.

**Inventario** (todos los roles): lista con búsqueda y filtro "Stock bajo", barra de stock contra el mínimo, etiqueta "Stock bajo" (con texto), acciones rápidas **Usé** (todos), **Compré** y **Ajustar** (admin), historial de movimientos de cada insumo, crear/editar/desactivar (admin). El empleado no ve costos ni valores en pesos; el admin ve el valor en stock. Cantidades con unidad y formato es-AR ("4,5 L").

**Presupuestos** (admin, superadmin): lista con filtro por estado y búsqueda (con "vencido" visible), crear/editar con editor de ítems (agregar desde el catálogo de servicios con su precio "Desde" si lo tiene, o libre; cantidad, precio, descuento, validez, notas; total en vivo), cambiar estado, borrar, y **PDF**: "Descargar" y, donde el navegador lo permita (`navigator.canShare` con archivos), **"Compartir"** (WhatsApp, etc.); además "Avisar por WhatsApp" (`wa.me` al teléfono del cliente con un texto prearmado en voseo; el PDF se comparte aparte). Arriba, "Datos que salen en los PDF" (formulario de `taller`).

**Comprobante** (en las tarjetas de turnos completados, solo admin y superadmin; Turnos, detalle de Agenda y Hoy): botón "Comprobante" → elegir forma de pago → PDF (descarga/compartir). Si ya existe, lo reabre.

Todos: celular primero, `prefers-reduced-motion`, errores `fields.*` en su campo, sesión vencida como el resto del panel, avisos de éxito con los toasts existentes, sin librerías de gráficos ni de PDF en el frontend (el PDF lo arma el backend), y solo variables de color del panel.

## Lo que necesita el dueño

- Cargar los **gastos** y, con el tiempo, el inventario: los números valen lo que se registre.
- Revisar los **datos del taller** en Presupuestos (nombre, teléfono, dirección, CUIT si corresponde) antes de mandar el primer PDF.
- Recordar que **no son facturas**: si necesita facturar, sigue por ARCA.

## Estado

- [x] Backend M1: gastos, metas, datos del taller, estadísticas ampliadas, permisos, sitemap y CSP (migración `20261028100000_finanzas_gastos_metas_taller.sql` sin aplicar a Supabase; `registrarGastoDeInventario(tx, datos)` en `services/gastos.ts` y `TallerService.obtener()` listos para M2/M3).
- [x] Backend M2/M3: inventario, presupuestos, comprobantes y PDF (migraciones `20261028110000_inventario.sql` y `20261028120000_presupuestos_comprobantes.sql` sin aplicar a Supabase; `pdfkit` en el backend; fixture compartida regenerada).
- [x] Frontend F1: navegación, Finanzas, metas, Estadísticas ampliadas y Hoy.
- [x] Frontend F2: Inventario, Presupuestos, Comprobantes y datos del taller.
- [x] Verificación: todo en verde, revisión cruzada con respuestas reales del backend (fixture ampliada con los errores 404/409/400 nuevos y `contrato-backend-objetivo10.test.ts`), cuentas idénticas en los dos lados, migraciones revisadas (EXPLAIN, función de ítems), día completo por la API, casos borde y hallazgos de seguridad. Pendiente: capturas en celular y pantalla ancha (las hace el dueño).
- [ ] Aplicar las migraciones en Supabase.
