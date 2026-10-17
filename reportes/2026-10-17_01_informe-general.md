# Informe general: MgDetailing

**Fecha de corte:** 2026-10-17. **Repositorio:** `C:\Users\Admin\Desktop\MgDetail`.

## Resumen ejecutivo

MgDetailing tiene una web de dos partes: una **landing** que explica los servicios de detailing y deja pedir un turno, y un **panel** en `/admin` donde el dueño gestiona esas solicitudes. Detrás hay una **API** que guarda los turnos en una base de datos de archivo único (SQLite), valida todo lo que llega y protege el acceso del dueño.

Lo que está listo: la landing con diseño propio, el formulario de turnos, el panel, la API con seguridad básica, los archivos de marca y los tests. La prueba de punta a punta (reserva, login, gestión y cierre de sesión) pasó 10 de 10, según el resumen del orquestador (no la volví a correr).

Lo que falta para salir al aire no es técnico en su mayoría: son datos del taller (dirección, horarios, precios, servicios confirmados), fotos de trabajos, un dominio y hosting, y la decisión sobre cómo recibir los avisos de turnos. El detalle está en el [informe 06](2026-10-17_06_pendientes-del-dueno.md).

Al cierre, la tipografía nueva, el monograma que gira en 3D y la auditoría de seguridad están terminados. La auditoría no encontró hallazgos críticos ni altos; sus hallazgos de riesgo bajo o medio están corregidos o aceptados, y lo que queda depende de cómo se opere la web. Ver el [informe 05](2026-10-17_05_seguridad.md).

## Qué se construyó

| Parte | Qué hay | Estado |
|---|---|---|
| Landing (`frontend/`) | Cabecera, portada, servicios, cómo trabajamos, trabajos, beneficios, preguntas, formulario de turno, contacto y pie | Lista, con datos del taller pendientes |
| Panel (`/admin`) | Login, pestañas por estado, confirmar, marcar completado, cancelar, volver a pendiente, eliminar con confirmación, escribir por WhatsApp | Lista |
| API (`backend/`) | Turnos, login y sesión, gestión de turnos, salud del servicio | Lista, con prueba punta a punta de 10 de 10 (según el orquestador) |
| Avisos de turnos | Módulos para CallMeBot, Telegram y WhatsApp Cloud API | Implementados y **desactivados**; falta elegir proveedor. Los tres tienen tests con un `fetch` falso (simulado). Ninguno se probó contra el servicio real, y Cloud API tampoco contra Meta |
| Archivos de marca | Logo plano, monograma 3D animado, póster, favicon, imagen para compartir | Listos; el monograma giratorio también está terminado |
| Tests | Backend y frontend | Backend: 212 pasan y 1 se saltea en Windows (test de permisos POSIX), en 14 archivos. Frontend: 9. Según el orquestador; `npm test` en la raíz corre los dos |

## Equipo de agentes y modelos

El flujo fue de agentes que trabajan por separado, con el orquestador coordinando. Los modelos y el motivo de cada elección están en la tabla. **Los motivos no están escritos en el repo**: son la razón que se propone para la elección y hay que confirmarla con el orquestador.

| Agente | Modelo | Rol | Motivo de la elección (decisión del orquestador) |
|---|---|---|---|
| Frontend | Opus | Diseño "cartel fileteado", componentes, skill de diseño impeccable | Es lo que ven los clientes; necesita el mejor criterio visual y de React |
| Backend | Sonnet | API, repositorios, servicios, avisos, seguridad básica | API con un contrato cerrado: rápido y sólido. Para los avisos de WhatsApp se usó Sonnet con esfuerzo medio, a pedido del dueño |
| Revisor de calidad y escalabilidad | Sonnet | Solo lectura, en tres checkpoints | Lo pidió el dueño |
| Ciberseguridad | Opus | Auditoría y correcciones (terminada) | Auditar exige el razonamiento más profundo |
| Documentación | Haiku 5.5 | Estos informes y los README | Leer y resumir: rápido y económico |

Reglas de trabajo de esta pasada de documentación: solo se escriben archivos `.md`; no se leen `backend/.env` ni los archivos de contraseñas; no se hacen commits, no se instala nada y no se levantan servidores.

## Línea de tiempo

Las fechas salen de la última modificación de los archivos y del historial de git. Los hitos de los checkpoints no tienen fecha registrada.

| Fecha y hora (aprox.) | Hito | Fuente |
|---|---|---|
| 2026-10-16 20:04 a 20:08 | Capturas del panel y la landing | Fecha de los archivos en `reportes/capturas/` y `frontend/.capturas/` |
| 2026-10-16 20:30 | Commit `e6684b4` ("firts commit"), del dueño. Es el único commit: todo lo demás está sin commitear | `git log` |
| 2026-10-16 20:37 a 20:38 | Módulos de avisos (CallMeBot, Cloud, mensaje) y monograma animado | Fecha de los archivos |
| 2026-10-17 14:02 a 14:09 | Aviso por Telegram, monograma giratorio, build del frontend | Fecha de los archivos |
| Sin fecha registrada | Checkpoints 0, 1 y 2 de la revisión; prueba punta a punta 10/10; auditoría de seguridad; cierre de tipografía y monograma | Resumen del orquestador |

## Estado actual

| Tema | Estado | Detalle |
|---|---|---|
| Landing y panel | Listos | Falta cargar datos del taller y confirmar servicios |
| Tipografía | Terminada (frontend) | "Señalética de ruta", elegida entre tres propuestas. Ver [informe 02](2026-10-17_02_frontend.md) |
| Monograma 3D giratorio | Terminado (frontend) | Archivo `frontend/src/landing/MonogramaGiratorio.tsx` (sin commitear) |
| Seguridad | Terminada (ciberseguridad) | Hallazgos corregidos o aceptados. Ver [informe 05](2026-10-17_05_seguridad.md) |
| Avisos de turnos | Desactivados | El dueño no eligió proveedor. Por defecto `WHATSAPP_PROVIDER=none` en `backend/.env.example` |
| Número de WhatsApp público | Sin decidir | `frontend/src/config/sitio.ts` queda vacío hasta que decida |
| Hosting y dominio | Sin elegir | Hace falta para `sitio.url`, `PUBLIC_URL` y `FRONTEND_ORIGIN` |
| Repositorio | Un commit del dueño (`e6684b4`); el resto sin commitear | Ver "Inconsistencias" en el [informe 03](2026-10-17_03_backend.md) |

## Decisiones clave

- **Se mantienen las restricciones (CHECK) de la base de datos**: los valores válidos se controlan en la base además de en la API.
- **Despliegue de un solo proceso**: la API sirve también la web (`SERVE_FRONTEND=true`), detrás de HTTPS, en el mismo dominio.
- **Acceso a datos detrás de interfaces**: el código habla con los turnos a través de interfaces en `backend/src/domain/`. Si algún día hace falta, se puede pasar de SQLite a PostgreSQL cambiando solo `backend/src/repositories/`.
- **Telegram como opción para arrancar**: es gratis y oficial. El resumen del orquestador lo recomienda; el dueño todavía no lo eligió.
- **Servicios con datos provisorios**: las descripciones, lo que incluye cada servicio y las duraciones son una propuesta del orquestador, marcadas `COMPLETAR`. El dueño no las confirmó.

## Próximos pasos (por prioridad)

1. **El dueño decide el aviso de turnos** (Telegram recomendado para arrancar) y carga el token y el chat id. Sin esto no le llega ningún aviso. Ver [informe 03](2026-10-17_03_backend.md#avisos-de-turnos).
2. **El dueño confirma los servicios**: descripción, qué incluye, duración y precio, en `frontend/src/data/servicios.ts`.
3. **El dueño carga los datos del taller** en `frontend/src/config/sitio.ts`: dirección, horarios, Instagram y Maps. Y decide si muestra el WhatsApp.
4. **Elegir hosting y dominio**, y configurar el backend para producción.
5. **Crear la contraseña de admin** en producción con `crear-admin`.
6. **Ver y aprobar la tipografía y el monograma giratorio** ya terminados.
7. **Aplicar los pendientes del informe de seguridad** (S6 y S7 de [05](2026-10-17_05_seguridad.md)) y la checklist de producción de ese informe, cuando se elija hosting.
8. **Decidir el aviso de privacidad y el plazo de retención de datos** (ver [informe 05](2026-10-17_05_seguridad.md#legal-ley-25326)).
9. **Fotos de trabajos reales** en `frontend/public/fotos/`, y cargarlas en `frontend/src/data/galeria.ts`. Hoy la galería dice "Fotos reales muy pronto".
10. **Decidir si se commitea el trabajo pendiente.** Hoy hay un commit del dueño y el resto está sin commitear. No se hace nada sin pedido.
