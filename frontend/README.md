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
  admin/        login y panel: turnos, agenda, servicios (catálogo) y usuarios
  lib/          fechas (hora de La Rioja, semana de lunes a domingo), reglas de la agenda y utilidades
  styles/       fuentes autoalojadas y estilos base
```

## Dónde se edita cada cosa

| Qué | Dónde |
|---|---|
| WhatsApp, Instagram, dirección, horarios, Maps, URL pública, logo | `src/config/sitio.ts` (lo vacío se oculta solo) |
| Servicios (textos, incluye, glosario, duración, precio, destacado, activo, orden) | panel `/admin` → **Servicios**. `src/data/servicios.ts` es solo el respaldo (ver abajo) |
| Fotos de trabajos y pares antes/después | archivos en `public/fotos/` + entradas en `src/data/galeria.ts` |
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
| `npm run marca` | regenera las imágenes livianas de marca con sharp (los originales no se tocan) |
| `npm test` | tests de fechas, del esquema del turno, de la sesión del panel, de usuarios, del catálogo, de la agenda y de notas, búsqueda e historial (vitest) |

## Probar desde el celular

1. Corré `npm run dev:lan`. Vite muestra la dirección de red, por ejemplo `http://192.168.0.20:5173`.
2. El backend solo acepta envíos (POST/PATCH/DELETE) desde los orígenes de `FRONTEND_ORIGIN`. Agregá esa dirección a la lista en `backend/.env`, separada por coma:
   `FRONTEND_ORIGIN=http://localhost:5173,http://192.168.0.20:5173`
3. Reiniciá el backend y abrí la dirección en el celular (misma red Wi-Fi).

## Panel `/admin`: acceso, roles y usuarios

El ingreso usa Supabase Auth a través del backend (modo BFF): el navegador solo habla con `/api` y la sesión vive en cookies httpOnly. No hay claves de Supabase en el frontend.

- **Sesión:** si un pedido a `/api/admin/*` responde `401 SESSION_EXPIRED`, `src/api/sesion.ts` llama una sola vez a `POST /api/auth/refresh` (aunque fallen varios pedidos a la vez) y reintenta. Si el refresh falla, vuelve al ingreso con el mensaje. Un `403 FORBIDDEN` (rol sin permiso) muestra el mensaje y la sesión sigue; un `403 NO_ACCESS` (usuario desactivado) vuelve al ingreso, sin pedidos extra.
- **Roles** (la regla real la aplica el backend; el panel solo esconde lo que no se puede hacer):

| Rol | Ver, buscar e historial | Cambiar estado | Reprogramar | Notas internas | Borrar | Usuarios | Servicios |
|---|---|---|---|---|---|---|---|
| Superadmin | sí | a cualquier estado | sí | sí | sí | sí | ver y editar |
| Admin | sí | a cualquier estado | sí | sí | sí | no | ver y editar |
| Empleado | sí | solo "Marcar completado" | no | sí | no | no | solo ver |

- **Usuarios** (solo superadmin, sección "Usuarios" del panel): lista con email, nombre, rol, estado y fecha de alta. Se puede cambiar el rol, activar o desactivar (con confirmación) y editar el nombre. Los inactivos aparecen arriba, en "Pendientes de activación", con el botón "Activar". Sobre tu propio usuario no podés cambiarte el rol ni desactivarte.
- **Usuarios (solo superadmin):** se crean, editan (rol, nombre, email, contraseña, activo) y eliminan desde *Usuarios*. Si el backend no tiene `SUPABASE_SECRET_KEY` (`gestionCuentas: false`), el alta, la baja y el cambio de email o contraseña se ocultan. La contraseña olvidada la repone el superadmin con *Cambiar contraseña*; el login solo lo explica. Los pasos completos están en `backend/README.md`.

## Catálogo de servicios

Contrato: `reportes/2026-10-22_07_catalogo-editable.md`.

- **Landing:** `landing/CatalogoProvider.tsx` pide `GET /api/servicios` una vez y lo comparte (`useCatalogo()`) con Servicios, el arranque del Hero, el formulario de turno, su resumen, el éxito y las preguntas frecuentes. Mientras carga se muestra `src/data/servicios.ts` con el precio esperando en su lugar; si la API falla queda ese respaldo, siempre sin precios ("Consultá"). Si la API responde una lista **vacía** (el dueño desactivó todo), NO se usa el respaldo (el backend rechazaría esos turnos): Servicios y Reservá muestran `landing/SinTurnosOnline.tsx` ("Por ahora no estamos tomando turnos online"), con WhatsApp/Instagram si están cargados en `src/config/sitio.ts`. El formulario solo acepta servicios del catálogo que se está mostrando; el backend vuelve a controlar que exista y esté activo.
- **Panel → Servicios:** lista en el orden de la web con precio, duración, destacado y activo/inactivo. Superadmin y admin crean (el identificador se sugiere desde el nombre y queda fijo al crear), editan todos los campos en un diálogo (listas editables para "Incluye" y "En palabras simples"), destacan (a lo sumo uno: el anterior se desmarca; un inactivo no se puede destacar), activan o desactivan (no se borran: hay turnos que los usan; desactivar el destacado lo desmarca) y suben o bajan el orden (`PUT /api/admin/servicios/orden`). El empleado ve la lista sin controles. Las validaciones (`admin/validacionServicio.ts`) son las del contrato y usan las mismas claves de error que el backend (`incluye.2`, `glosario.0.termino`).
- Turnos muestra el nombre del servicio con el catálogo del panel (o el del respaldo, o el id tal cual si ya no existe).

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

## Notas

- **ESLint 9 y no 10:** `eslint-plugin-jsx-a11y` todavía no soporta ESLint 10. Cuando lo haga, se pueden subir `eslint` y `@eslint/js`.
- **CSP:** la política de seguridad de contenido se define en un solo lugar, el backend (`backend/src/middleware/security.ts`).
- **Fuentes:** autoalojadas con `@fontsource`, solo el subset latin; se precargan las dos del primer viewport.
- **Sin imágenes de stock ni generadas por IA:** la web usa solo fotos reales del taller.
