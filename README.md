# MgDetailing

Web del taller de detailing de autos de MgDetailing, en La Rioja, Argentina. Tiene dos partes que se ven como una sola web:

- **Landing** (`/`): explica los servicios en palabras simples y deja pedir un turno desde un formulario.
- **Panel de administración** (`/admin`): donde el dueño ve las solicitudes de turno, las confirma, las marca como completadas, las cancela o las borra, y puede escribirle al cliente por WhatsApp.

Estado: en desarrollo, todavía no publicada. Lo que falta para salir está en [reportes/2026-10-17_06_pendientes-del-dueno.md](reportes/2026-10-17_06_pendientes-del-dueno.md).

## Estructura

| Carpeta | Qué es |
|---|---|
| `frontend/` | Lo que ve el visitante y el panel. Está hecho con React (librería para armar pantallas). |
| `backend/` | La API: el servicio que guarda los turnos, maneja el login del dueño y envía los avisos. Usa Node.js (programa que corre JavaScript fuera del navegador) y una base SQLite (un archivo `.db`). |
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

Abrilo siempre como `localhost`, no como `127.0.0.1`: la API rechaza los pedidos que vienen de otro origen (responde 403). Para desarrollar no hace falta ningún archivo `.env`.

## Crear el administrador

El panel no tiene registro público: el usuario del dueño se crea por consola. La contraseña tiene que tener al menos 10 caracteres.

En PowerShell (Windows), con el proyecto instalado:

```powershell
$env:ADMIN_PASSWORD = "una clave larga y unica"
npm run crear-admin:dev -- --email dueno@ejemplo.com
Remove-Item Env:ADMIN_PASSWORD
```

- `crear-admin:dev` corre el código directo (sirve en desarrollo).
- `npm run crear-admin` corre la versión compilada, así que primero hay que hacer `npm run build`. Es la que se usa en producción; ver [backend/README.md](backend/README.md#alta-del-primer-administrador-en-producción).
- Si el email ya existe, el comando cambia su contraseña y cierra sus sesiones abiertas.

## Verlo desde el celular

1. Detené `npm run dev` y arrancá el backend y el frontend por separado:
   ```bash
   npm --prefix backend run dev
   npm --prefix frontend run dev:lan
   ```
2. Vite muestra una dirección de red, por ejemplo `http://192.168.0.20:5173`.
3. Creá `backend/.env` copiando `backend/.env.example` y agregá esa dirección a `FRONTEND_ORIGIN`, separada por coma:
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
| `npm run crear-admin:dev -- --email <email>` | Crea o actualiza el administrador, en desarrollo (código fuente). |
| `npm run crear-admin -- --email <email>` | Lo mismo, con la versión compilada (requiere `build`). Para producción. |

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
