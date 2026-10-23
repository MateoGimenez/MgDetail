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
  admin/        login y panel: turnos, servicios (catálogo) y usuarios
  lib/          fechas (hora de La Rioja) y utilidades
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
| `npm test` | tests de fechas, del esquema del turno, de la sesión del panel, de usuarios y del catálogo (vitest) |

## Probar desde el celular

1. Corré `npm run dev:lan`. Vite muestra la dirección de red, por ejemplo `http://192.168.0.20:5173`.
2. El backend solo acepta envíos (POST/PATCH/DELETE) desde los orígenes de `FRONTEND_ORIGIN`. Agregá esa dirección a la lista en `backend/.env`, separada por coma:
   `FRONTEND_ORIGIN=http://localhost:5173,http://192.168.0.20:5173`
3. Reiniciá el backend y abrí la dirección en el celular (misma red Wi-Fi).

## Panel `/admin`: acceso, roles y usuarios

El ingreso usa Supabase Auth a través del backend (modo BFF): el navegador solo habla con `/api` y la sesión vive en cookies httpOnly. No hay claves de Supabase en el frontend.

- **Sesión:** si un pedido a `/api/admin/*` responde `401 SESSION_EXPIRED`, `src/api/sesion.ts` llama una sola vez a `POST /api/auth/refresh` (aunque fallen varios pedidos a la vez) y reintenta. Si el refresh falla, vuelve al ingreso con el mensaje. Un `403 FORBIDDEN` (rol sin permiso) muestra el mensaje y la sesión sigue; un `403 NO_ACCESS` (usuario desactivado) vuelve al ingreso, sin pedidos extra.
- **Roles** (la regla real la aplica el backend; el panel solo esconde lo que no se puede hacer):

| Rol | Ver turnos | Cambiar estado | Borrar | Usuarios | Servicios |
|---|---|---|---|---|---|
| Superadmin | sí | a cualquier estado | sí | sí | ver y editar |
| Admin | sí | a cualquier estado | sí | no | ver y editar |
| Empleado | sí | solo "Marcar completado" | no | no | solo ver |

- **Usuarios** (solo superadmin, sección "Usuarios" del panel): lista con email, nombre, rol, estado y fecha de alta. Se puede cambiar el rol, activar o desactivar (con confirmación) y editar el nombre. Los inactivos aparecen arriba, en "Pendientes de activación", con el botón "Activar". Sobre tu propio usuario no podés cambiarte el rol ni desactivarte.
- **Usuarios (solo superadmin):** se crean, editan (rol, nombre, email, contraseña, activo) y eliminan desde *Usuarios*. Si el backend no tiene `SUPABASE_SECRET_KEY` (`gestionCuentas: false`), el alta, la baja y el cambio de email o contraseña se ocultan. La contraseña olvidada la repone el superadmin con *Cambiar contraseña*; el login solo lo explica. Los pasos completos están en `backend/README.md`.

## Catálogo de servicios

Contrato: `reportes/2026-10-22_07_catalogo-editable.md`.

- **Landing:** `landing/CatalogoProvider.tsx` pide `GET /api/servicios` una vez y lo comparte (`useCatalogo()`) con Servicios, el arranque del Hero, el formulario de turno, su resumen, el éxito y las preguntas frecuentes. Mientras carga se muestra `src/data/servicios.ts` con el precio esperando en su lugar; si la API falla queda ese respaldo, siempre sin precios ("Consultá"). Si la API responde una lista **vacía** (el dueño desactivó todo), NO se usa el respaldo (el backend rechazaría esos turnos): Servicios y Reservá muestran `landing/SinTurnosOnline.tsx` ("Por ahora no estamos tomando turnos online"), con WhatsApp/Instagram si están cargados en `src/config/sitio.ts`. El formulario solo acepta servicios del catálogo que se está mostrando; el backend vuelve a controlar que exista y esté activo.
- **Panel → Servicios:** lista en el orden de la web con precio, duración, destacado y activo/inactivo. Superadmin y admin crean (el identificador se sugiere desde el nombre y queda fijo al crear), editan todos los campos en un diálogo (listas editables para "Incluye" y "En palabras simples"), destacan (a lo sumo uno: el anterior se desmarca; un inactivo no se puede destacar), activan o desactivan (no se borran: hay turnos que los usan; desactivar el destacado lo desmarca) y suben o bajan el orden (`PUT /api/admin/servicios/orden`). El empleado ve la lista sin controles. Las validaciones (`admin/validacionServicio.ts`) son las del contrato y usan las mismas claves de error que el backend (`incluye.2`, `glosario.0.termino`).
- Turnos muestra el nombre del servicio con el catálogo del panel (o el del respaldo, o el id tal cual si ya no existe).

## Notas

- **ESLint 9 y no 10:** `eslint-plugin-jsx-a11y` todavía no soporta ESLint 10. Cuando lo haga, se pueden subir `eslint` y `@eslint/js`.
- **CSP:** la política de seguridad de contenido se define en un solo lugar, el backend (`backend/src/middleware/security.ts`).
- **Fuentes:** autoalojadas con `@fontsource`, solo el subset latin; se precargan las dos del primer viewport.
- **Sin imágenes de stock ni generadas por IA:** la web usa solo fotos reales del taller.
