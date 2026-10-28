# MgDetailing · frontend

Landing para pedir turnos (`/`) y panel de administración (`/admin`, se descarga aparte con `React.lazy`).
React 19 + TypeScript + Vite, react-router en modo declarativo, validación con `zod/mini`.

## Estructura

```
src/
  api/          único acceso a la red: contrato (enums y esquemas), request<T>(), llamadas
  config/       sitio.ts (datos del taller) y enlaces.ts (WhatsApp, Instagram, Maps… o null si falta)
  data/         servicios.ts (respaldo del catálogo), galeria.ts, preguntas.ts: el contenido editable
  components/   Logo, íconos SVG y ornamentos de filete
  landing/      secciones de la landing y el formulario de turno
  admin/        login y panel: turnos, agenda, disponibilidad, servicios (catálogo) y usuarios
  seguimiento/  página /turno/:id (se descarga aparte, como el panel)
  lib/          fechas (hora de La Rioja, semana de lunes a domingo), reglas de la agenda y utilidades
  styles/       fuentes autoalojadas y estilos base
```

## Dónde se edita cada cosa

| Qué | Dónde |
|---|---|
| WhatsApp, Instagram, dirección, horarios (texto y `horariosSemana` para el "Abierto ahora"), Maps, mapa embebido, URL pública, logo | `src/config/sitio.ts` (lo vacío se oculta solo) |
| Servicios (textos, incluye, glosario, duración, precio, destacado, activo, orden) | panel `/admin` → **Servicios**. `src/data/servicios.ts` es solo el respaldo (ver abajo) |
| Fotos de trabajos y pares antes/después | originales en `fotos-originales/` + `npm run fotos` + entradas en `src/data/galeria.ts` (ver el comentario de ese archivo) |
| Logo y archivos de marca | originales en `public/fotos/MgDetailing-*`; `npm run marca` genera las versiones livianas en `public/marca/` (logo, póster del monograma, og.jpg, favicon). El logo se elige en `sitio.ts` |
| Preguntas frecuentes | `src/data/preguntas.ts` |

Buscá `COMPLETAR` para ver todo lo pendiente.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo en http://localhost:5173 (`/api` va al backend en 127.0.0.1:4000) |
| `npm run dev:lan` | lo mismo, visible en la red local (para probar desde el celular) |
| `npm run build` | chequeo de tipos + build de producción en `dist/` |
| `npm run preview` | sirve el build en http://localhost:4173 |
| `npm run typecheck` | solo TypeScript |
| `npm run lint` | ESLint (incluye accesibilidad con jsx-a11y) |
| `npm run fotos` | optimiza las fotos de `fotos-originales/` (WebP de 480, 800 y 1080 px y JPG de respaldo) en `public/trabajos/`; los originales no se publican |
| `npm run marca` | regenera las imágenes livianas de marca con sharp, incluidos los logos para fondo oscuro y claro (los originales no se tocan) |
| `npm test` | tests de fechas, de la app instalable y los avisos push (`pwa/`, `api/push`), del esquema del turno, de la sesión del panel, de usuarios, del catálogo, de la agenda, de notas, búsqueda e historial y de disponibilidad y seguimiento (vitest) |

## Probar desde el celular

1. Corré `npm run dev:lan`. Vite muestra la dirección de red, por ejemplo `http://192.168.0.20:5173`.
2. El backend solo acepta envíos (POST/PATCH/DELETE) desde los orígenes de `FRONTEND_ORIGIN`. Agregá esa dirección a la lista en `backend/.env`, separada por coma:
   `FRONTEND_ORIGIN=http://localhost:5173,http://192.168.0.20:5173`
3. Reiniciá el backend y abrí la dirección en el celular (misma red Wi-Fi).

## Panel `/admin`: acceso, roles y usuarios

El ingreso usa Supabase Auth a través del backend (modo BFF): el navegador solo habla con `/api` y la sesión vive en cookies httpOnly. No hay claves de Supabase en el frontend.

- **Sesión:** si un pedido a `/api/admin/*` responde `401 SESSION_EXPIRED`, `src/api/sesion.ts` llama una sola vez a `POST /api/auth/refresh` (aunque fallen varios pedidos a la vez) y reintenta. Si el refresh falla, vuelve al ingreso con el mensaje. Un `403 FORBIDDEN` (rol sin permiso) muestra el mensaje y la sesión sigue; un `403 NO_ACCESS` (usuario desactivado) vuelve al ingreso, sin pedidos extra.
- **Roles** (la regla real la aplica el backend; el panel solo esconde lo que no se puede hacer):

| Rol | Ver, buscar e historial | Cambiar estado | Reprogramar | Notas internas | Cobro y trabajador | Borrar | Usuarios | Servicios |
|---|---|---|---|---|---|---|---|---|
| Superadmin | sí | a cualquier estado | sí | sí | carga y corrige monto y trabajador | sí | sí | ver y editar |
| Admin | sí | a cualquier estado | sí | sí | carga y corrige monto y trabajador | sí | no | ver y editar |
| Empleado | sí | solo "Marcar completado" | no | sí | no carga monto: al completar queda él como trabajador | no | no | solo ver |

- **Usuarios** (solo superadmin, sección "Usuarios" del panel): lista con email, nombre, rol, estado y fecha de alta. Se puede cambiar el rol, activar o desactivar (con confirmación) y editar el nombre. Los inactivos aparecen arriba, en "Pendientes de activación", con el botón "Activar". Sobre tu propio usuario no podés cambiarte el rol ni desactivarte.
- **Usuarios (solo superadmin):** se crean, editan (rol, nombre, email, contraseña, activo) y eliminan desde *Usuarios*. Si el backend no tiene `SUPABASE_SECRET_KEY` (`gestionCuentas: false`), el alta, la baja y el cambio de email o contraseña se ocultan. La contraseña olvidada la repone el superadmin con *Cambiar contraseña*; el login solo lo explica. Los pasos completos están en `backend/README.md`.

## Cobro, trabajador y permisos por rol

Contrato: `reportes/2026-10-26_15_estadisticas-y-permisos.md`. El Turno trae `monto` (entero o null; para el empleado siempre null) y `trabajador` (`{ id, nombre }` o null), validados estrictos; solo un completado puede tenerlos. `CambiosTurno` suma `monto` y `trabajadorId`. Lógica pura en `lib/cobro.ts` (leer "$ 25.000", formato en pesos, "falta cobro") y `lib/permisosRol.ts` (agrupar la matriz, armar "Podés / No podés"), con tests.

- **Completar con cobro** (`admin/cobro/FormularioCobro.tsx`, `useTrabajadores.ts`, `contextoCobro.ts`): "Marcar completado" (y elegir Completado en el selector) abre en la misma tarjeta **¿Cuánto cobraste?** (opcional; un botón sugiere el "Desde" del servicio si está cargado, no lo escribe solo) y **¿Quién lo hizo?** (`GET /api/admin/trabajadores`, por defecto quien está logueado). Un `fields.monto` o `fields.trabajadorId` del backend va en su campo, con el foco en él, y lo escrito no se pierde. Si la lista de personas falla, ofrece Reintentar y al guardar queda a nombre de quien completa. El empleado completa directo. Un formulario abierto cuenta como "Sin terminar" para "Plegar todas". Vale igual en Turnos y en el detalle de la Agenda.
- **Turno completado:** "Cobrado $ 60.000 · Lucas" o "Sin cobro cargado" y, para admin y superadmin, **Cargar cobro** / **Editar cobro** (los mismos campos). El empleado solo ve "Lo hizo Lucas". La fila plegada lleva la señal "Sin cobro".
- **Hoy:** admin y superadmin ven "N trabajos completados sin cobro cargado" con **Cargar cobros**, que abre Turnos > Completadas. N se cuenta con el listado (`GET /api/admin/bookings?estado=completado`, de a 100, hasta 500 trabajos); si hay más, dice "Al menos N".
- **Permisos** (`admin/permisos/`): todo sale de `GET /api/admin/permisos` (única fuente). Usuarios > **Permisos por rol**: tabla con capacidades agrupadas y una columna por rol desde 720 px, y apilada por rol en el celular; Sí / No / Parcial con icono y palabra, y el matiz en texto. Al elegir el rol en **Nuevo usuario** (y en el desplegable "Qué puede hacer…" de cada fila) se ve "Va a poder / No va a poder". En el encabezado, el rol es un botón que abre **Tu rol: Empleado** con "Podés / No podés" para cualquier persona. Las funciones `puede*` de `admin/permisos.ts` (incluida `puedeRegistrarCobro`) solo esconden botones.

## Catálogo de servicios

Contrato: `reportes/2026-10-22_07_catalogo-editable.md`.

- **Landing:** `landing/CatalogoProvider.tsx` pide `GET /api/servicios` una vez y lo comparte (`useCatalogo()`) con Servicios, el arranque del Hero, el formulario de turno, su resumen, el éxito y las preguntas frecuentes. Mientras carga se muestra `src/data/servicios.ts` con el precio esperando en su lugar; si la API falla queda ese respaldo, siempre sin precios ("Consultá"). Si la API responde una lista **vacía** (el dueño desactivó todo), NO se usa el respaldo (el backend rechazaría esos turnos): Servicios y Reservá muestran `landing/SinTurnosOnline.tsx` ("Por ahora no estamos tomando turnos online"), con WhatsApp/Instagram si están cargados en `src/config/sitio.ts`. El formulario solo acepta servicios del catálogo que se está mostrando; el backend vuelve a controlar que exista y esté activo.
- **Panel → Servicios:** lista en el orden de la web con precio, duración, destacado y activo/inactivo. Superadmin y admin crean (el identificador se sugiere desde el nombre y queda fijo al crear), editan todos los campos en un diálogo (listas editables para "Incluye" y "En palabras simples"), destacan (a lo sumo uno: el anterior se desmarca; un inactivo no se puede destacar), activan o desactivan (no se borran: hay turnos que los usan; desactivar el destacado lo desmarca) y suben o bajan el orden (`PUT /api/admin/servicios/orden`). El empleado ve la lista sin controles. Las validaciones (`admin/validacionServicio.ts`) son las del contrato y usan las mismas claves de error que el backend (`incluye.2`, `glosario.0.termino`).
- Turnos muestra el nombre del servicio con el catálogo del panel (o el del respaldo, o el id tal cual si ya no existe).

## Servicios como cards y revelado al scroll

Contrato: `reportes/2026-10-26_14_*` (cards y revelado). Estilos en `landing/servicios.css` y `landing/revelar.css`; solo variables semánticas (andan en los dos temas).

- **Cards:** `landing/Servicios.tsx` arma las `TarjetaServicio.tsx` dentro de `ListaTarjetas.tsx` (carrusel con scroll-snap y "1 de 5" en el celular; grilla de 2 y 3 columnas desde 700 px). "Ver qué incluye" despliega la descripción, el "Incluye" completo y el glosario sin desmontar nada (`inert` plegado); "Ver el servicio completo" lleva a `/servicios/:id`.
- **Revelado:** `landing/useRevelar.ts` (ref callback; `useRevelar()` lo devuelve para un elemento suelto y `revelar` sirve en listas) marca `data-revelar` solo en lo que está debajo de la pantalla al montar. Para animar algo nuevo: `ref={revelar}` y la clase `revelar` (más `revelar--sutil` o `revelar--tarjeta`); para escalonar hijos, `revelar-hijo` con `--i`. `CabeceraSeccion` dibuja el filete de cada título. Todo con `transform` y `opacity`, solo sin `prefers-reduced-motion`.

## Landing: WhatsApp, dónde estamos, página por servicio, scrollspy y fotos

Contrato: `reportes/2026-10-27_16_landing-whatsapp-mapa-servicios.md`. El diseño está en `DESIGN.md` (cabecera y scrollspy, Dónde estamos, botón de WhatsApp, página de un servicio, galería y efectos).

- **WhatsApp:** `sitio.whatsapp` va en formato internacional, solo dígitos (`5493804781737`). `config/enlaces.ts` arma los enlaces (`whatsappUrl(mensaje)`, `MENSAJE_CONSULTA_TURNO`, `mensajeConsultaServicio(nombre)`). El botón flotante (`landing/BotonWhatsapp.tsx`) solo existe si hay número.
- **Dónde estamos** (`landing/DondeEstamos.tsx`): dirección, horarios y mapa. El "Abierto ahora / Cerrado ahora · abrimos…" sale de `sitio.horariosSemana` (día 0 = domingo, tramos `desde`/`hasta` "HH:MM", hora de La Rioja; `lib/horarioTaller.ts`). Si cambiás `sitio.horarios` (el texto), cambiá también `horariosSemana`. El mapa embebido es opcional: en Google Maps, Compartir → Insertar un mapa, copiá solo el `src` a `sitio.mapaEmbedUrl` (tiene que empezar con `https://www.google.com/maps/`); se carga al tocar "Ver el mapa acá". Sin él, queda la tarjeta con la dirección y "Cómo llegar". Sin dirección, horarios ni `mapsUrl`, la sección y su enlace del nav no se emiten.
- **Página por servicio:** `/servicios/:id` (`landing/PaginaServicio.tsx`, carga diferida) con el catálogo de `GET /api/servicios` y el respaldo. El SEO sale de `lib/seoServicio.ts` (título, descripción, Open Graph, canonical solo con `sitio.url`, JSON-LD `Service` y `BreadcrumbList`; el `provider` es `lib/negocioJsonLd.ts`, el mismo del `index.html`) y se aplica con `landing/useSeo.ts`. Enlace profundo de reserva: `/?servicio=<id>#reservar` (sirve para el link de Instagram). Una pregunta frecuente de un servicio se muestra en su página agregándole `servicioId` en `data/preguntas.ts`; las fotos, con `servicioId` en `data/galeria.ts`. El sitemap y el `robots.txt` los sirve el backend.
- **Scrollspy:** `landing/useSeccionActiva.ts` (IntersectionObserver) con la decisión en `lib/seccionActiva.ts`, usado por `Cabecera.tsx`.
- **Fotos de trabajos:** originales en `fotos-originales/` (fuera de `public/`), `npm run fotos` (`scripts/optimizar-fotos.mjs`) genera en `public/trabajos/` tres WebP (480, 800 y 1080 px) y un JPG de 800 px; `lib/fotos.ts` (`fotoOptimizada`) arma `src`, `srcset` y medidas. La galería (tira deslizable con la siguiente foto asomando en el celular; hasta cuatro fotos, una fila escalonada desde 900 px) muestra tarjetas 4:5 y el visor las abre enteras. Para sumar una foto, seguí los pasos del comentario de `data/galeria.ts`.
- **Efectos** (`landing/efectos.css`, `useMagnetico.ts`): ver `DESIGN.md`. Tests: `lib/horarioTaller.test.ts`, `seccionActiva.test.ts`, `seoServicio.test.ts`, `fotos.test.ts`, `config/enlaces.test.ts` y `seccionQuitada.test.ts` (que no queden restos de la sección quitada).

## Agenda

Contrato: `reportes/2026-10-22_08_agenda.md`.

- **Fecha de agenda** de un turno = la confirmada por el taller (`fechaConfirmada` + `franjaConfirmada`, van juntas) o, si no hay, la que pidió el cliente. Las reglas puras están en `lib/agenda.ts` y los cálculos de semana (lunes a domingo, hora de La Rioja) en `lib/fechas.ts`. La respuesta se valida estricta: un turno sin los dos campos, o con uno solo, se rechaza.
- **Panel → Agenda** (entre Turnos y Servicios) pide `GET /api/admin/agenda?desde&hasta` por semana. En el celular: tira de días (hoy marcado, punto en los días con turnos; flechas del teclado para recorrerla) y abajo el día elegido en Mañana / Tarde con la cantidad de cada franja. Desde 900 px: grilla de 7 días × 2 franjas (una `<table>` con encabezados de día y franja). Semana anterior / siguiente / Hoy. Los pendientes son tentativos: borde punteado, fondo rayado y sello "Pendiente". Si se confirmó para otro día, la ficha aclara "Pidió: jue 24".
- **Detalle:** tocar un turno abre la misma tarjeta de Turnos en un `<dialog>`, con sus acciones y **Reprogramar** (solo superadmin y admin; no en cancelados ni completados). Si un cambio lo saca de la semana (cancelado o movido), el detalle lo avisa y la grilla lo deja de mostrar.
- **Confirmar con otra fecha:** desde Turnos o desde la Agenda, "Confirmar" sobre un pendiente pregunta "Para lo que pidió" u "Otra fecha" (de hoy a hoy + 120 días, y franja) dentro de la misma tarjeta, y manda todo en un solo `PATCH`. El empleado no ve esa opción (no confirma).
- La tarjeta y su mensaje de WhatsApp usan la fecha de agenda y muestran lo pedido si difiere.

## Notas internas, búsqueda e historial del cliente

Contrato: `reportes/2026-10-23_10_notas-busqueda-historial.md`. El Turno trae dos campos más, `notasInternas` (texto o null) y `turnosDelCliente` (entero ≥ 1, o null; siempre null si `telefonoWhatsapp` es null), y se valida estricto: sin ellos, o con un conteo sin teléfono, la respuesta se rechaza. Un turno viejo con teléfono pero todavía sin normalizar trae el conteo en null: no muestra sello hasta correr `npm run normalizar-telefonos` en el backend. "El mismo cliente" es el mismo `telefonoWhatsapp`, nunca el nombre.

- **Buscador** (Turnos, arriba de las pestañas): "Buscar por nombre, teléfono o vehículo". Pide `GET /api/admin/bookings?q=` después de una pausa de 350 ms (`lib/busqueda.ts`), o ya con Enter; respeta la pestaña elegida y vuelve a la página 1 en cada búsqueda nueva. Cada combinación de pestaña, búsqueda y página es una clave en `useTurnos`: el pedido anterior se cancela y una respuesta vieja no pisa a la nueva. Con 1 carácter no pide nada y lo avisa; más de 80 no se puede escribir (y `listarTurnos` corta antes de mandar un `q` o un `cliente` fuera de formato). Se limpia con la ✕ del campo, con Escape o desde el estado vacío ("No encontramos turnos para «…»", con "Buscar en todas" si se buscó en una pestaña). El resultado se anuncia en la línea de estado (`aria-live`); un `fields.q` del backend va debajo del campo.
- **Nota interna** (tarjeta del turno, en Turnos y en el detalle de la Agenda; `admin/NotaInterna.tsx`): se ve si hay; "Agregar nota" / "Editar nota" abre un campo en la misma tarjeta con contador (hasta 1000), Guardar y Cancelar, y la aclaración de que el cliente no la ve. Se manda sola en el `PATCH` (`{ notasInternas }`, recortada; vacía → null) y un `fields.notasInternas` se muestra en el campo. Cualquier rol, en cualquier estado. Va en un recuadro punteado para no confundirla con el comentario del cliente.
- **Sello de cliente** (dato "Cliente" de la tarjeta): "Primer turno" con 1, "Cliente frecuente · N turnos" con 2 o más y el botón **Ver historial**. Sin teléfono interpretable no se muestra.
- **Historial** (`admin/DialogoHistorial.tsx`, `useHistorial.ts`): `<dialog>` con `GET /api/admin/bookings?cliente=<telefonoWhatsapp>`, más nuevos primero, de a 20 con "Ver turnos anteriores". Cada turno muestra fecha de agenda, estado, servicio, vehículo, referencia y nota; el de origen queda marcado ("Este turno", `aria-current`). Carga, error con Reintentar y sesión vencida como el resto. Desde la Agenda se abre encima del detalle. Al cerrar, el foco vuelve a "Ver historial" (o al título de la vista si ya no está, `foco.ts`).

## Disponibilidad, seguimiento del turno y recordatorios

Contrato: `reportes/2026-10-23_11_disponibilidad-seguimiento-recordatorios.md` (los recordatorios son solo del backend).

- **Formulario de turno** (`landing/useDisponibilidad.ts`, `landing/ElegirDia.tsx`, `lib/disponibilidad.ts`): pide `GET /api/disponibilidad` al abrir y muestra un calendario de los próximos 60 días, de a un mes (lunes primero). Cada día es un radio nativo: las flechas recorren solo los días con lugar; los cerrados (tachados) y los llenos (borde punteado, "lleno") están deshabilitados y el lector de pantalla dice por qué ("no atendemos", "sin lugar"). Elegido el día, Mañana / Tarde muestran solo las franjas con lugar (la otra dice "sin lugar"); cambiar de día borra una franja que ahí no tenga lugar. Si la API falla (o manda una forma que no cierra, o ningún día), vuelve el campo de fecha de antes con las dos franjas: el backend valida igual.
- **Rechazos del alta:** un `409 FRANJA_LLENA` borra la franja y un `400` con `fields.fechaPreferida` (día cerrado) borra día y franja; en los dos casos el mensaje del backend queda en el campo, se recarga la disponibilidad (`conciliarEleccion` en `useFormularioTurno.ts`: si el día entero quedó sin lugar, se pide otro día) y el foco va al campo para elegir de nuevo.
- **Éxito** (`landing/EnlaceSeguimiento.tsx`): la dirección completa de `/turno/<id>` (la `seguimientoUrl` del backend, solo si es una ruta propia `/turno/…`; si falta, se arma con el id), botón **Copiar enlace** (si el navegador no deja, lo selecciona para copiarlo a mano), el aviso de guardarlo y "Ver cómo va mi turno".
- **Página `/turno/:id`** (`seguimiento/`, cargada aparte con `React.lazy` como el panel, con `noindex`): `GET /api/turnos/:id`. Línea de tiempo Recibido → Confirmado → Listo (o Recibido → Cancelado; el paso actual con `aria-current="step"`), servicio, fecha y franja de agenda, cuándo se actualizó, "Consultar de nuevo" y WhatsApp / Instagram del taller si están cargados. Estados de carga, error con Reintentar y "No encontramos ese turno" (un id que no es UUID ni se consulta). Solo muestra lo que el contrato permite: el esquema descarta cualquier otro campo.
- **Panel → Disponibilidad** es un **calendario del mes** (`admin/VistaDisponibilidad.tsx`, `CalendarioMes.tsx`, `DetalleDia.tsx`, `HorarioHabitual.tsx`, `ControlesCupo.tsx`, `useDisponibilidadPanel.ts`, `useOcupadosDelMes.ts`; lógica pura en `lib/calendarioPanel.ts`, con tests):
  - **El mes:** grilla de seis semanas de lunes a domingo (42 días: lo que deja pedir `GET /api/admin/agenda`, de donde salen los turnos ocupados de cada día). Mes anterior / siguiente y "Hoy". Cada día muestra dos rayitas (arriba la mañana, abajo la tarde; un segmento por turno de cupo, lleno = ocupado; con más de 8, una barra que se llena) y, cuando la celda tiene lugar, la cifra "Mañana 1/2". Cerrado: rayado, borde punteado y número tachado. Feriado precargado: "Feriado". Cambiado a mano: un rombo chico. Hoy: el número en chapa grafito. Los días pasados se ven apagados y no se editan. A 390 px entra el mes entero sin desbordar.
  - **El estado de cada día** (`estadoDelDia`): de hoy en adelante manda lo guardado (día especial o, si no hay, el horario semanal), así un cambio se ve sin recargar la agenda; de la agenda solo salen los ocupados. Para días pasados (el backend no manda días especiales viejos) se usa lo que diga la agenda. Si la agenda no carga, el calendario se ve igual sin contar lo agendado y avisa con "Reintentar".
  - **Tocar un día** abre su detalle: en el celular, una hoja que sube desde abajo (`<dialog>` modal; desde 640 px, centrado); desde 900 px, un panel fijo al costado del calendario. Trae fecha, feriado (con el aviso de trasladable), turnos por franja y los controles: interruptor "Atiende ese día", por franja un interruptor (apagada = cupo 0) y el cupo con − / + (1 a 20), motivo opcional (hasta 80) y "Volver al horario habitual" si el día tiene un cambio (DELETE). Guardar manda el PUT del día especial (`cambioDelBorrador`); si el día queda igual que el horario semanal y sin motivo, no crea un día especial (o quita el que había: `accionDelBorrador`). Si se cierra o se achica algo que ya tiene turnos, avisa ("Ese día ya tiene 2 turnos: no se cancelan, solo deja de recibir pedidos nuevos") sin bloquear.
  - **Elegir varios días** (vacaciones): "De corrido" (primer toque y último toque marcan el rango) o "Sueltos" (cada toque suma o saca), un motivo, y "Cerrar N días" / "Abrir N días". Va un PUT (o DELETE) por día, de a uno: muestra el progreso y, por día, lo que falló; lo que salió bien queda guardado y los fallados quedan elegidos para reintentar. Abrir usa los cupos del horario habitual de ese día (2 y 2 si ese día no se atiende) y conserva el motivo de un feriado (`accionMasiva`).
  - **Horario habitual** (plegado debajo): los siete días con interruptor abierto/cerrado y cupos con − / + (0 a 20; `dia` va de 0 = domingo a 6 = sábado como en el backend); se guarda todo junto. **Próximos cambios** (plegado): los días especiales de hoy en adelante; tocar uno lleva a ese día del calendario. Los feriados precargados se reconocen por el motivo que manda el backend, que empieza con "Feriado: " (`feriadoPrecargado` en `lib/cupos.ts`); los trasladables y los puentes hay que revisarlos cada año.
  - **Teclado y lector de pantalla:** la grilla es un `role="grid"` con un solo día en el orden de tabulación; flechas (día y semana), Inicio / Fin (lunes y domingo), Re Pág / Av Pág (mes) y Enter / Espacio para abrir. Cada día tiene el nombre completo ("martes 27 de octubre, abierto, mañana 2 de 2 ocupados, completa, tarde 0 de 2 ocupados"). Al cerrar la hoja el foco vuelve al día.
  - **Permisos:** editar, superadmin y admin (`puedeEditarDisponibilidad`); el empleado ve el calendario y el detalle sin controles.
- **Agenda:** con los `cupos` de `GET /api/admin/agenda` cada franja muestra "ocupados/cupo" ("2/3", en rojo cuando está completa; "Cerrada" con fondo rayado si el día está cerrado o el cupo es 0) y los días cerrados llevan el sello "Cerrado". Los ocupados se cuentan con los turnos que muestra la agenda, así que siguen al día después de confirmar, reprogramar o cancelar. Con cupos, la grilla se ve aunque la semana no tenga turnos. Si el backend no manda cupos, la agenda se ve como antes.
- **Aviso al confirmar o reprogramar** (`admin/useCupoDelDia.ts`): al elegir el día y la franja (o "Para lo que pidió"), el panel pide la agenda de ese día y, si la franja está llena o cerrada, avisa ("Esa franja ya tiene 2 de 2. Podés agendarlo igual.") sin bloquear. El turno que ya ocupa ese lugar no se cuenta dos veces.
- **WhatsApp al cliente** desde la tarjeta: con `sitio.url` cargada, el mensaje suma "Podés ver cómo va acá: <sitio.url>/turno/<id>" (`seguimientoPublicoUrl` en `config/enlaces.ts`). Sin URL pública no se manda el enlace.

## Estadísticas

Contrato: `reportes/2026-10-26_15_estadisticas-y-permisos.md`. Sección "Estadísticas" del panel (entre Hoy y Turnos), cargada con `React.lazy` desde `Panel.tsx`: no engorda el panel de quien no la abre.

- **Admin y superadmin** (`puedeVerEstadisticas`): selector de período (Hoy, 7 días, 30 días, Este mes por defecto, Mes pasado, Este año, Personalizado hasta 366 días, con la fecha de La Rioja), tarjetas Hoy / Este mes / Este año con la variación contra el período anterior equivalente ("—" sin base), resumen del período, avisos de "N trabajos sin cobro cargado" y "sin trabajador asignado", y cinco gráficos: ingresos en el tiempo, servicios, equipo, cuándo vienen (mapa de calor) y estado de los turnos. **Descargar CSV** arma el archivo en el navegador (`;`, BOM UTF-8, CRLF; los textos que empiezan con `=`, `+`, `-` o `@` llevan `'` delante).
- **Empleado:** "Mis trabajos" (`GET /api/admin/estadisticas/mias`): cantidad por día y por servicio, sin importes.
- **Dónde está cada cosa:** `src/api/estadisticas.ts` (esquemas estrictos y llamadas); la lógica pura en `src/lib/estadisticas.ts` (formato es-AR, abreviados, ticks lindos, escalas, variación, estados, mapa de calor), `rangosEstadisticas.ts` (períodos y validación) y `tablasEstadisticas.ts` (tablas "Ver los números" y CSV), todas con tests; los componentes en `src/admin/estadisticas/` y `graficos/`. Los datos de muestra de las pruebas están en `src/lib/muestraEstadisticas.ts` (ningún componente lo usa, no entra al build). Reglas de los gráficos: `DESIGN.md`.

## Panel: Hoy, avisos y esqueletos

Contrato: `reportes/2026-10-26_13_panel-pulido-y-app.md`, bloque B.

- **Hoy** (`admin/VistaHoy.tsx`, `useHoy.ts`; lógica pura en `lib/hoy.ts`, con tests): primera sección y la que abre el panel. Saludo con nombre ("Buen día, Mateo", hora de La Rioja), la fecha y tres tarjetas. **Pendientes**: un botón grande con la cantidad que lleva a Turnos > Pendientes, y los 3 que más esperan ("Llegó hace 3 días") con **Abrir**, que abre Turnos con ese nombre ya buscado. **Turnos de hoy**: Mañana / Tarde con el cupo ("1/2", en rojo si está completa) y el sello de estado de cada turno. **Mañana**: cuántos turnos o si figura cerrado. Arriba, avisos si hoy figura cerrado o una franja está llena o cerrada. Accesos a Agenda y Disponibilidad. Usa solo endpoints que ya existen: `GET /api/admin/agenda` (hoy y mañana, con cupos) y `GET /api/admin/bookings?estado=pendiente` (el total y, como viene del más nuevo al más viejo, una segunda consulta de 3 con `offset = total - 3` cuando hay más de 3). Todos los roles ven lo mismo y no hay controles de edición. Estados: vacío ("Hoy no hay turnos."), carga (esqueleto), error con Reintentar y sesión vencida como el resto.
- **`?vista=hoy|turnos|agenda|disponibilidad|servicios|usuarios`**: solo la vista inicial (`resolverVista` en `lib/hoy.ts`; lo usan los accesos directos de la app). Un valor inválido, con otras mayúsculas o que el rol no puede ver (Usuarios, salvo superadmin) abre Hoy.
- **Avisos (toasts)** (`admin/toast/`): `ProveedorToasts` envuelve el panel en `AdminApp.tsx` y `useAvisos()` da `exito(texto)` y `error(texto)`. El estado es un reducer puro (`toasts.ts`, con tests): el éxito se va solo a los 4 s (se pausa con el mouse o el foco encima), el error queda hasta cerrarlo, máximo 3 (se descarta el éxito más viejo) y el mismo texto no se apila. Dos regiones siempre presentes, `role="status"` y `role="alert"`. En el celular se apilan arriba de la barra fija de "Elegir varios días" (se mide su alto y se publica en `--toasts-barra`) y del área segura de abajo. Sin animación con `prefers-reduced-motion`. Reemplazan los mensajes fijos de éxito de Servicios (`useServicios`), Disponibilidad (`useDisponibilidadPanel` y la selección de varios días, que avisa lo hecho como éxito y lo fallado como error), Usuarios (`useUsuarios`, que antes no avisaba), Turnos y Agenda (`useTurnos`, `useAgenda`; textos en `lib/avisosTurno.ts` y `lib/avisosUsuario.ts`, con tests). Los errores por campo siguen en el campo.
- **Esqueletos** (`admin/Esqueleto.tsx`): Servicios, Usuarios, Agenda (tira y día en el celular, grilla 7 × 2 desde 900 px), Disponibilidad (mes de seis semanas y panel del día) y Hoy ocupan los mismos contenedores y alturas mínimas que el contenido real. Son `aria-hidden`; el brillo corre solo sin `prefers-reduced-motion`.
- **Borde de campos en oscuro:** `--campo-borde` pasó de #3a4047 (1,79:1 contra el campo) a **#6f777f**, y `--campo-borde-hover` a #9199a2. Contrastes del borde: 4,14 contra el campo (#0f1214), 4,03 contra las opciones (#121518), 3,96 contra el fondo (#14171a), 3,76 contra la superficie (#191c20), 3,64 contra la caja del ingreso (#1c1f23) y 3,48 contra la superficie 2 (#1f2327, el peor caso). Es lo único que cambió en el oscuro; el claro no se tocó. Detalle y paleta clara en `DESIGN.md`.

## El panel como app y avisos en el celular

Contrato: `reportes/2026-10-26_13_panel-pulido-y-app.md` (bloque C). Solo el panel `/admin` es instalable; la web pública no lleva manifest (el `<link rel="manifest">` y las metas de iOS se agregan desde `pwa/useInstalablePanel.ts` solo mientras está abierto `/admin`).

- **Cómo se instala.** Abrí el panel en el celular, tocá la campana del encabezado ("Ajustes de la app") y después **Instalar la app**. En Android (Chrome, Edge, Samsung Internet) aparece el cuadro del sistema; en iPhone/iPad no hay botón: **Compartir → Agregar a inicio** en Safari. Los accesos directos del ícono (mantenelo apretado) llevan a Hoy y a Agenda (`/admin?vista=hoy|agenda`).
- **Cómo se activan los avisos.** En los mismos ajustes, el interruptor **Avisarme de turnos nuevos** pide el permiso, suscribe el dispositivo con la clave de `GET /api/admin/push/estado` y la registra en `POST /api/admin/push/suscripciones`. **Probar aviso** muestra una notificación local. Cada persona decide en su propio dispositivo. Si el servidor no tiene las claves VAPID, el interruptor no aparece (sí "Instalar la app"). Al **Salir**, ese dispositivo se desuscribe (`DELETE`) y se limpia el globito; si falla la red, la sesión se cierra igual. Al abrir el panel, una suscripción activa se vuelve a registrar y el globito se actualiza con los pendientes.
- **Límites en iPhone/iPad.** Los avisos solo andan con la app **instalada en la pantalla de inicio** (iOS 16.4 o más) y abierta desde su ícono; desde una pestaña de Safari la pantalla explica que hay que instalar primero. El globito del ícono depende de la versión del sistema y de que las notificaciones estén permitidas. Si se bloqueó el permiso, hay que volver a darlo desde los ajustes del teléfono (la pantalla lo explica).
- **Qué guarda el dispositivo.** El service worker (`public/admin/sw.js`) maneja solo `push`, el clic en el aviso y una página "Sin conexión" (`sin-conexion.html`, su CSS y el logo). No guarda nada de `/api` ni JS/CSS de la app. Los avisos no llevan datos del cliente.
- **Íconos.** `npm run marca` genera `public/marca/app-192.png`, `app-512.png` y `app-maskable-512.png` (este con el logo dentro del 80 % central, la zona segura).
- **Probar en desarrollo.** El service worker y los avisos solo andan en `https` o `localhost`: con `npm run dev:lan` desde un celular (http) no se activan. Para probar instalación y avisos de punta a punta hace falta el sitio publicado con `https` o un túnel https.
- **Alcance del service worker.** Se registra con alcance `/admin`; si el servidor no manda `Service-Worker-Allowed: /admin`, queda en `/admin/` y la página "Sin conexión" no cubre la ruta exacta `/admin` (los avisos funcionan igual).

## Inventario, presupuestos y comprobantes (F2)

Contrato: `reportes/2026-10-27_17_finanzas-inventario-documentos.md`. Las secciones se cargan aparte y `admin/secciones.ts` las toma solas (`inventario/VistaInventario.tsx`, `presupuestos/VistaPresupuestos.tsx`; exportan nombre y `default`).

| Capacidad | Superadmin | Admin | Empleado |
|---|---|---|---|
| Ver el inventario y anotar uso (**Usé**) | sí | sí | sí |
| Crear/editar/desactivar insumos, **Compré**, **Ajustar**, ver costos y valor en stock (`puedeGestionarInventario`) | sí | sí | no (el backend manda `null`) |
| Presupuestos, datos del taller, **Comprobante** y PDF (`puedeEmitirDocumentos`) | sí | sí | no |

- **Inventario** (`admin/inventario/`, `lib/inventario.ts`, `api/inventario.ts`): búsqueda, filtro **Stock bajo**, barra contra el mínimo y etiqueta con texto (Stock bajo / Sin stock), cantidades es-AR con unidad ("4,5 L", "3 unidades"), formularios en la tarjeta, historial por insumo, `409 STOCK_INSUFICIENTE` en el campo cantidad y nombre repetido en su campo. Se abre filtrado con `?vista=inventario&bajoStock=1` (vale una vez) o con `abrirCon="bajo-stock"`.
- **Presupuestos** (`admin/presupuestos/`, `lib/presupuestos.ts`, `lib/taller.ts`): lista con filtro por estado, búsqueda y «Vencido»; editor de ítems (catálogo con «Desde» o libre, cantidad con decimales) con total en vivo con la misma cuenta del backend; cambiar estado; borrar (`PRESUPUESTO_ACEPTADO`); **Descargar** y **Compartir** (solo si `navigator.canShare` con archivos); **Avisar por WhatsApp** (`wa.me` con texto en voseo; el PDF va aparte). Arriba, «Datos que salen en los PDF» (`GET/PUT /api/admin/taller`).
- **Comprobante** (`admin/comprobantes/ComprobanteDelTurno.tsx`): en turnos completados (Turnos, Agenda, Hoy). Sin cobro explica «Primero cargá el cobro» y abre el formulario de cobro; si ya hay comprobante lo reabre. El PDF se baja con `api/pdf.ts` (Blob con cookies y refresco de sesión). Ninguno es factura.

## Tema claro y oscuro

Contrato: `reportes/2026-10-23_12_modo-claro.md`. La web pública (landing, éxito del turno, 404 y la página de seguimiento) tiene dos temas; el panel `/admin` no cambia.

- **Oscuro por defecto** (la cara de la marca), sin atributo en `<html>`. El **claro** pone `data-tema="claro"` en `<html>` y `src/styles/base.css` redefine las mismas variables semánticas bajo `:root[data-tema='claro']` (`--fondo`, `--superficie`, `--texto*`, `--borde*`, `--acento*`, `--campo-*`, `--error*`, `--exito`, filete, cromo, sombras, y las superficies de la landing: `--cartel-fondo`, `--panel-fondo`, `--pie-fondo`…). **Los estilos nuevos usan solo estas variables**: así andan en los dos temas sin tocar nada más. `color-scheme` acompaña cada tema (fecha, scroll).
- **Botón:** `src/tema/BotonTema.tsx`, "Modo claro" con `aria-pressed` (presionado = claro). En la barra desde 520 px; en el celular, último renglón del menú.
- **Lógica:** `src/tema/tema.ts` (lectura y escritura de `localStorage` con try/catch, clave `mg-tema`; si no se puede guardar, el tema igual cambia en esa visita) y `useTema()` para los componentes. Tests en `src/tema/tema.test.ts`.
- **Sin parpadeo:** `public/tema-inicial.js` se carga sincrónico en el `<head>` y aplica el tema guardado antes de pintar, más el color de `<meta name="theme-color">` (`#14171a` / `#f7f8f9`). Es un archivo aparte y no un script inline porque la CSP del backend solo permite scripts del mismo origen. En `/admin` no hace nada.
- **Logo:** `Logo` usa `/marca/logo-fondo-claro.png` (`marca.logoClaro` en `sitio.ts`, generado con `npm run marca`) con el tema claro. El cuadro del monograma y la manija del comparador quedan oscuros a propósito en los dos temas (van sobre video y fotos).

Contrastes del tema claro (WCAG 2.1 AA, calculados):

| Par | Colores | Contraste |
|---|---|---|
| Texto / fondo · superficie | `#15181b` / `#f7f8f9` · `#ffffff` | 16,8 · 17,8 |
| Texto 2 / fondo · hundido | `#3f454c` / `#f7f8f9` · `#edf0f2` | 9,1 · 8,5 |
| Texto 3 / fondo · hundido · pie | `#5b636c` / `#f7f8f9` · `#edf0f2` · `#e9ecef` | 5,7 · 5,3 · 5,1 |
| Acento texto (enlaces, sello) / fondo · blanco | `#a50c26` | 7,4 · 7,8 |
| Acento y filete (gráfico) / fondo · blanco | `#c8102e` | 5,5 · 5,9 |
| Error / blanco · fondo | `#b3261e` | 6,5 · 6,2 |
| Éxito / blanco · fondo | `#1d7a46` | 5,4 · 5,0 |
| Borde de campo / blanco · hundido | `#7b838c` | 3,8 · 3,4 |
| Foco / fondo · blanco | `#14171a` | 16,9 · 18,0 |
| Texto blanco / botón rojo (degradé) | `#ffffff` / `#d61c35`–`#c8102e` | 5,2–5,9 |
| Elegido: texto · acento / fondo elegido | `#15181b` · `#c8102e` / `#fbeef0` | 15,8 · 5,2 |

## Navegación, Finanzas y estadísticas ampliadas (objetivo 10, F1)

Contrato: `reportes/2026-10-27_17_finanzas-inventario-documentos.md`.

- **Registro de secciones** (`admin/secciones.ts`): las diez secciones (clave de `?vista=`, etiqueta, si va en la barra principal, quién la ve y, si se carga aparte, su componente con `React.lazy`). `Panel.tsx` arma navegación y contenido desde ahí; `lib/hoy.ts` tiene `VISTAS`. Un rol sin permiso cae en Hoy. Presupuestos e Inventario (F2) se enchufan con `import.meta.glob` a `./presupuestos/VistaPresupuestos.tsx` y `./inventario/VistaInventario.tsx` (export default o con nombre): sin el archivo muestran `Proximamente.tsx`. Reciben `PropsSeccion` (`rol`, `usuarioId`, `alVencerSesion`, `irA`, `catalogo`, `nombreServicio`, `abrirCon`; Hoy abre Inventario con `abrirCon='bajo-stock'`).
- **Navegación y perfil** (`NavegacionPanel.tsx`, `navegacion/`, `navegacion.css`): el encabezado lleva solo la marca y un avatar (`navegacion/PerfilPanel.tsx`) que abre la hoja de perfil con nombre, rol ("Tu rol", `BotonTuRol`), ajustes de la app y avisos (`BotonAjustes`) y Salir. Las secciones salen de `navegacionPara(rol)` (`secciones.ts`, campo `principal`): hasta 1179 px, barra fija abajo con Hoy, Turnos, Agenda y "Más" (hoja con el resto, filtrado por rol); desde 1180 px, una sola fila con todas bajo el encabezado. La barra publica su alto en `--panel-barra` (en `<html>`) para que "Elegir varios días" y los avisos queden encima. `navegacion/Hoja.tsx` es el `<dialog>` de las dos hojas.
- **Finanzas** (`admin/finanzas/`, `api/finanzas.ts`, `lib/finanzas.ts`; admin y superadmin): resumen del mes con navegación de mes (ganancia neta, ingresos, gastos, margen) y pestañas **Gastos** (búsqueda, categoría, lista por día, alta, edición y baja con confirmación; los de inventario van marcados y sin acciones; `409 GASTO_DE_INVENTARIO` muestra el mensaje y recarga) y **Metas** (barras, estado en texto, ritmo, proyección, "te faltan $ X, $ Y por día", fijar, cambiar, quitar, historial del año).
- **Estadísticas**: ganancia neta en las tarjetas con su comparación, gastos, ganancia y margen en el resumen, gráficos *Ingresos vs. gastos* y *Gastos por categoría*, CSV con las columnas nuevas y la meta del mes. **Hoy**: tarjeta del mes (ganancia neta y meta, solo admin) y aviso "N insumos con stock bajo" (todos).
- Los esquemas de estadísticas son estrictos con los campos nuevos; `contrato-backend.test.ts` completa en cero las capturas viejas hasta que el backend regenere las fixtures.

## Notas

- **ESLint 9 y no 10:** `eslint-plugin-jsx-a11y` todavía no soporta ESLint 10. Cuando lo haga, se pueden subir `eslint` y `@eslint/js`.
- **CSP:** la política de seguridad de contenido se define en un solo lugar, el backend (`backend/src/middleware/security.ts`).
- **Fuentes:** autoalojadas con `@fontsource`, solo el subset latin; se precargan las dos del primer viewport.
- **Sin imágenes de stock ni generadas por IA:** la web usa solo fotos reales del taller.
