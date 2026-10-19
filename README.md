# MgDetailing

Web del taller de detailing de autos de MgDetailing, en La Rioja, Argentina. Tiene dos partes que se ven como una sola web:

- **Landing** (`/`): explica los servicios en palabras simples y deja pedir un turno desde un formulario.
- **Panel de administración** (`/admin`): donde el equipo ve las solicitudes de turno, las confirma, las marca como completadas, las cancela o las borra (según su rol: `superadmin`, `admin` o `empleado`), y puede escribirle al cliente por WhatsApp.

Estado: en desarrollo, todavía no publicada. Lo que falta para salir está en [reportes/2026-10-17_06_pendientes-del-dueno.md](reportes/2026-10-17_06_pendientes-del-dueno.md).

## Estructura

| Carpeta | Qué es |
|---|---|
| `frontend/` | Lo que ve el visitante y el panel. Está hecho con React (librería para armar pantallas). |
| `backend/` | La API: el servicio que guarda los turnos, maneja el login del panel (con Supabase Auth) y envía los avisos. Usa Node.js (programa que corre JavaScript fuera del navegador) y una base Postgres en Supabase. |
| `reportes/` | Informes del proyecto: estado, decisiones, pendientes y capturas. |

## Requisitos

- **Node.js 24 o superior** (el archivo `.node-version` dice 24). Se instala desde nodejs.org.
- npm, que viene con Node.

## Instalación

```bash
npm run instalar
```

Instala las dependencias de la raíz, del backend y del frontend.

## Correrlo en desarrollo

```bash
npm run dev
```

Levanta el backend (puerto 4000) y el frontend (puerto 5173) juntos.

- Landing: http://localhost:5173
- Panel: http://localhost:5173/admin

Abrilo siempre como `localhost`, no como `127.0.0.1`: la API rechaza los pedidos que vienen de otro origen (responde 403). El backend necesita `backend/.env` con la conexión a Supabase (base y login): ver [backend/README.md](backend/README.md#conectar-supabase).

## Usuarios del panel

El panel no tiene registro público: los usuarios se crean en el panel de Supabase (*Authentication > Users > Add user*, con "Auto Confirm User") y nacen **inactivos**. El primer superadmin se activa con una sentencia SQL; después, el superadmin activa a los demás y les asigna rol desde el panel web. Los pasos exactos están en [backend/README.md](backend/README.md#alta-de-usuarios-pasos-del-dueño).

## Verlo desde el celular

1. Detené `npm run dev` y arrancá el backend y el frontend por separado:
   ```bash
   npm --prefix backend run dev
   npm --prefix frontend run dev:lan
   ```
2. Vite muestra una dirección de red, por ejemplo `http://192.168.0.20:5173`.
3. En `backend/.env` agregá esa dirección a `FRONTEND_ORIGIN`, separada por coma:
   ```
   FRONTEND_ORIGIN=http://localhost:5173,http://192.168.0.20:5173
   ```
4. Reiniciá el backend y abrí la dirección de red en el celular (tiene que estar en la misma Wi-Fi).

## Scripts de la raíz

| Script | Qué hace |
|---|---|
| `npm run instalar` | Instala dependencias de la raíz, `backend/` y `frontend/`. |
| `npm run dev` | Backend y frontend en desarrollo, con recarga automática. |
| `npm run build` | Compila el frontend (`frontend/dist/`) y el backend (`backend/dist/`). |
| `npm start` | Arranca el backend compilado (`node dist/index.js`). Requiere `npm run build` antes. |
| `npm test` | Tests del backend y del frontend. |
| `npm run verificar` | Chequeo completo: tipos, lint y tests de los dos, y build del frontend. |

## Dónde se edita cada contenido

| Qué | Dónde |
|---|---|
| WhatsApp, Instagram, dirección, horarios, link de Maps, URL pública | `frontend/src/config/sitio.ts`. Lo que queda vacío no se muestra. |
| Servicios: textos, qué incluye, duración y precio | `frontend/src/data/servicios.ts` (`precioDesde: null` muestra "Consultá") |
| Preguntas frecuentes | `frontend/src/data/preguntas.ts` |
| Fotos de trabajos | Fotos en `frontend/public/fotos/` y entradas en `frontend/src/data/galeria.ts` |
| Logo y archivos de marca | Originales en `frontend/public/fotos/MgDetailing-*`. Versiones livianas con `npm --prefix frontend run marca`. |
| Configuración del servidor (avisos, dominio, base de datos, claves) | `backend/.env`, a partir de `backend/.env.example` |
| Buscar todo lo que falta completar | Buscar el texto `COMPLETAR` en el código |

## Documentación

- [frontend/README.md](frontend/README.md): estructura del frontend, scripts y cómo probar desde el celular.
- [backend/README.md](backend/README.md): contrato de la API, variables de entorno, avisos de turnos, operación y backup.
- [reportes/README.md](reportes/README.md): índice de los informes del proyecto, incluido el [informe de seguridad](reportes/2026-10-17_05_seguridad.md).
