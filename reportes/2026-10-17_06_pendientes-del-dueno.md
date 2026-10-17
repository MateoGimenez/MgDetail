# Pendientes del dueño

Checklist de lo que tiene que hacer o decidir el taller. Cada punto dice **dónde** va el dato y **cómo se ve** un ejemplo. Los ejemplos son de formato: reemplazalos por los datos reales.

Marcá con `[x]` cuando esté hecho.

## 1. Datos del taller (`frontend/src/config/sitio.ts`)

Todo lo que queda vacío se oculta solo en la web. No hace falta tocar otro archivo.

- [ ] **WhatsApp público.** Primero decidir si se muestra en la web. Si no, dejar `whatsapp: ''`: los botones de contacto llevan al formulario de turnos.
  - Dónde: `whatsapp: '...'`
  - Formato: código de país y número, solo dígitos, sin `+` ni espacios. Ejemplo: `'5493804123456'`.

- [ ] **Instagram.** Usuario, sin `@`.
  - Dónde: `instagram: '...'`
  - Ejemplo: `'mgdetailing'`

- [ ] **Dirección del taller.**
  - Dónde: `direccion: '...'`
  - Ejemplo: `'Av. Ejemplo 123, La Rioja'`

- [ ] **Horarios.** Un renglón por ítem.
  - Dónde: `horarios: [...]`
  - Ejemplo: `['Lunes a viernes, de 9 a 18 h', 'Sábados, de 9 a 13 h']`

- [ ] **Link de Google Maps.** En Maps: Compartir → Copiar vínculo. Tiene que empezar con `https://`.
  - Dónde: `mapsUrl: '...'`
  - Ejemplo: `'https://maps.app.goo.gl/XXXXXXXX'`

- [ ] **Dirección pública de la web**, cuando haya dominio. Sin barra final.
  - Dónde: `url: '...'` (en `sitio.ts`) **y** en el backend, ver sección 4.
  - Ejemplo: `'https://mgdetailing.com.ar'`

## 2. Servicios (`frontend/src/data/servicios.ts`)

Hay cinco servicios. Las descripciones, lo que incluye cada uno y las duraciones son una propuesta sin confirmar. Cada bloque tiene un comentario `COMPLETAR: confirmar con el taller`.

- [ ] **Confirmar o corregir** la descripción, la lista "incluye" y la duración de cada servicio:

| Servicio (`id`) | Duración propuesta |
|---|---|
| Lavado Básico (`lavado-basico`) | 1 a 1,5 h |
| Lavado Premium (`lavado-premium`) | 3 a 4 h |
| Pulido (`pulido`) | Alrededor de 1 día |
| Encerado (`encerado`) | 2 a 3 h |
| Restauración de ópticas (`restauracion-opticas`) | 1,5 a 2 h |

- [ ] **Confirmar que el Pulido no saca rayas profundas.** La descripción lo dice así, y es la postura honesta de la web. Si el taller piensa distinto, cambiarla.

- [ ] **Precios.** Hoy todos están en `precioDesde: null` (la web muestra "Consultá"). Para cargar uno, poner el número en pesos, sin puntos ni `$`.
  - Dónde: `precioDesde: null,` dentro de cada servicio
  - Ejemplo: `precioDesde: 25000,` (se muestra como "Desde $ 25.000")

- [ ] **Servicio destacado.** Hoy es el Lavado Premium (`destacado: true`). Confirmar o cambiar.

## 3. Preguntas frecuentes (`frontend/src/data/preguntas.ts`)

- [ ] Leer las 10 preguntas y corregir lo que no sea cierto para el taller.

## 4. Hosting, dominio y configuración del servidor (`backend/.env` en producción)

Esto se define cuando se elige dónde publicar. Las variables van en el entorno del servidor o en `backend/.env`. **No subir el `.env` al repositorio.**

- [ ] **Elegir hosting** (un VPS con Caddy, o un servicio tipo PaaS con volumen persistente).
- [ ] **Elegir dominio.** Por ejemplo `mgdetailing.com.ar`.
- [ ] **Configurar las variables mínimas:**

| Variable | Valor de ejemplo |
|---|---|
| `NODE_ENV` | `production` |
| `FRONTEND_ORIGIN` | `https://mgdetailing.com.ar` (exacto, con https, sin barra final. Si el sitio responde con y sin `www`, poner los dos separados por coma) |
| `PUBLIC_URL` | `https://mgdetailing.com.ar` |
| `JWT_SECRET` | Un valor aleatorio de 32 caracteres o más. Generarlo con `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` |
| `SERVE_FRONTEND` | `true` |
| `HOST` y `TRUST_PROXY` | VPS con Caddy en la misma máquina: `HOST=127.0.0.1` y `TRUST_PROXY=loopback`, con el puerto 4000 cerrado desde afuera. PaaS: `HOST=0.0.0.0` y `TRUST_PROXY=1`. No usar `TRUST_PROXY=1` en un VPS con el puerto expuesto (hallazgo S1 del [informe 05](2026-10-17_05_seguridad.md)) |
| `DB_PATH` | `/data/mgdetailing.db` (en un volumen que no se borre al redeployar) |

- [ ] **Confirmar que el sitio responde en HTTPS** antes de probar el panel.

## 5. Avisos de turnos (`backend/.env`)

El dueño recibe un aviso cada vez que entra un turno. Hoy los avisos están **desactivados**. Hay que elegir una opción:

| Opción | Costo | Qué hace falta |
|---|---|---|
| **Telegram** (recomendada para arrancar) | Gratis | Un bot de @BotFather y el chat id |
| CallMeBot | Gratis, no oficial | Tiene que haber plazas. Hoy no las tiene |
| WhatsApp Cloud API (Meta) | Unos US$1 por mes (cifra a verificar) | Cuenta de Meta Business, número propio y plantilla aprobada |

- [ ] **Decidir la opción.**
- [ ] **Si es Telegram**, seguir los 5 pasos de [backend/README.md](../backend/README.md#opción-3-telegram-gratis-oficial-sin-riesgo-de-baneo) y cargar en `backend/.env`:

```
WHATSAPP_PROVIDER=telegram
TELEGRAM_BOT_TOKEN=123456789:AAH...
TELEGRAM_CHAT_ID=123456789
```

- [ ] **Si es CallMeBot**, cargar `WHATSAPP_PROVIDER=callmebot`, `WHATSAPP_OWNER_PHONE` (código de país más número, solo dígitos, por ejemplo `5493804123456`) y `CALLMEBOT_APIKEY`.
- [ ] **Si es Cloud API**, requiere más pasos (ver backend/README.md). Antes conviene verificar el costo en la tarifa de Meta.
- [ ] **Probar el aviso** con un turno de prueba y comprobar que llega.

## 6. Cuenta de administrador

- [ ] **Crear la contraseña del panel** en producción. Usar una frase de **16 caracteres o más**, única, y guardarla en un gestor de contraseñas. El panel tiene un solo factor de acceso, así que la contraseña es lo que lo protege (hallazgo S5 del [informe 05](2026-10-17_05_seguridad.md)).

Comando (en el servidor, con el build hecho y el mismo `.env` que la API):

```bash
ADMIN_PASSWORD='una clave larga y unica' npm run crear-admin -- --email dueno@mgdetailing.com.ar
```

Usar el email real del dueño. En PowerShell (desarrollo): ver el [README de la raíz](../README.md#crear-el-administrador).

## 7. Fotos de trabajos

Hoy la sección "Trabajos" dice "Fotos reales muy pronto".

- [ ] **Sacar fotos reales** del taller y de los trabajos: sin imágenes de stock ni generadas por IA (es una regla de la web).
  - Recomendación: horizontales, unos 1600 px de ancho, menos de 400 KB cada una. Antes/después: mismo encuadre.
- [ ] **Copiarlas** a `frontend/public/fotos/`, con nombre descriptivo. Ejemplo: `hilux-pulido.jpg`.
- [ ] **Cargarlas** en `frontend/src/data/galeria.ts`, en `fotos` o en `antesDespues`. Ejemplo:

```ts
{
  src: '/fotos/hilux-pulido.jpg',
  alt: 'Capó de una Toyota Hilux gris recién pulido, reflejando el techo del taller',
  titulo: 'Toyota Hilux · Pulido',
  servicioId: 'pulido',
},
```

- [ ] **Si se reemplaza una foto**, cambiarle el nombre (por ejemplo `hilux-pulido-2.jpg`). Las fotos quedan en caché 7 días.

## 8. Marca y logo

- [ ] **Confirmar el logo.** Hoy el logo plano para fondo oscuro es el que usa la web (`logo: '/marca/logo-fondo-oscuro.png'` en `sitio.ts`).
- [ ] **Si cambia el logo original**, regenerar las versiones livianas con `npm --prefix frontend run marca`.

## 9. Diseño (terminado)

- [ ] **Ver la tipografía "Señalética de ruta" y el monograma que gira** (ambos terminados) y aprobarlos o pedir cambios.

## 10. Seguridad y datos personales

- [ ] **Leer el [informe de seguridad](2026-10-17_05_seguridad.md).** No tiene hallazgos críticos ni altos. Los puntos que dependen del dueño están en su checklist de producción.
- [ ] **Decidir el aviso de privacidad del formulario.** Hay un texto sugerido en el informe 05 (sección legal). Hay que completar el nombre del responsable y el plazo.
- [ ] **Decidir el plazo de retención:** propuesta de borrar los turnos completados o cancelados a los 6 meses y los pendientes viejos a los 3. Hoy no está implementado: hay que pedirlo como tarea.
- [ ] **Elegir proveedor de avisos con esto en cuenta.** Con un proveedor activo, los datos del cliente salen hacia ese proveedor. Telegram o Meta son las opciones recomendadas; CallMeBot es un servicio no oficial de terceros.

## 11. Repositorio

- [ ] **Decidir si se commitea el trabajo pendiente.** Hoy hay un commit del dueño (`e6684b4`) y todo lo demás está sin commitear. No se hace ningún commit sin pedido.
- [ ] **Decidir si el repo es público o privado.** Si es público, verificar que `backend/.env` no esté versionado (el `.gitignore` ya lo excluye).

## 12. Copias de seguridad

- [ ] **Programar una copia diaria** de la base (`VACUUM INTO` con `umask 077`, ver [backend/README.md](../backend/README.md#backup)). Guardarla cifrada, fuera del servidor, con acceso restringido y con rotación de 30 días. Probar una restauración al menos una vez.
- [ ] **Recordar:** borrar un turno no lo saca de los backups hasta que estos roten.

## 13. Pendientes técnicos menores (no los decide el dueño)

Quedan como tareas del proyecto. Se mencionan para que se sepa que existen:

- Nota vieja en `frontend/PRODUCT.md` que dice que el logo no existe.
- `frontend/DESIGN.md` enlaza a `.capturas/`, que está ignorada por git.
- Cookie de sesión sin el prefijo `__Host-` (hallazgo S6, opcional).
- Los originales de marca (unos 2,4 MB de PNG en `frontend/public/fotos/`) se publican aunque no se usen (hallazgo S7). Conviene moverlos fuera de `public/`.
