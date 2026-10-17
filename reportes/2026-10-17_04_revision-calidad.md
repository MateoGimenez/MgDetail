# Revisión de calidad y escalabilidad

Un revisor independiente (Sonnet, solo lectura: no modifica código) revisó el proyecto en tres checkpoints. Este informe resume lo que se pidió, lo que se aceptó y el estado final.

**Fuente:** el resumen del orquestador. **El informe original del revisor no está en el repositorio**, y tampoco la lista de lo que se descartó y por qué. Esas partes no las puedo reconstruir: si el revisor las dejó en algún archivo, hay que sumarlas acá.

Lo que sí pude verificar en el código está marcado con **(verificado)**.

## Checkpoint 0: escalabilidad del backend y contrato

| Cambio | Detalle | Verificación |
|---|---|---|
| Repositorios async detrás de interfaces | El código de turnos habla con interfaces en `backend/src/domain/`. La implementación SQLite está en `backend/src/repositories/`. Para pasar a PostgreSQL alcanza con reemplazar esa carpeta | (verificado) interfaces y repositorios existen |
| Teléfono normalizado para WhatsApp | Campo `telefonoWhatsapp` calculado al leer, con libphonenumber-js. Nunca rechaza un turno: si no se interpreta, queda `null` | (verificado) `backend/src/domain/telefono.ts` y el contrato en el README |
| Servicio de turnos | Lógica de alta en `backend/src/services/bookings.ts` | (verificado) |
| `crear-admin` | Funciona en producción (sin devDependencies) | No lo corrí. Hay 15 tests de `crear-admin` en `backend/test/` |
| Compresión y CSP | Estáticos comprimidos, CSP recortada a lo que el frontend usa | (verificado) `backend/src/middleware/frontend.ts` y `security.ts` |
| `FRONTEND_ORIGIN` como lista | Varios orígenes separados por coma | (verificado) `backend/src/config.ts` |
| README con contrato | Contrato de la API en `backend/README.md` | (verificado) |
| Frontend: contrato único y `request<T>()` | Todo el acceso a la red está en `frontend/src/api/` | (verificado) ningún `fetch(` fuera de esa carpeta |
| Fechas en hora de La Rioja | Cálculo de "hoy" y de los 60 días en `America/Argentina/La_Rioja` | (verificado) mencionado en el contrato; tests en `frontend/src/turno.test.ts` |
| Accesibilidad del formulario | Etiquetas, errores, `aria-describedby` | Ver [informe 02](2026-10-17_02_frontend.md#accesibilidad) |

**Decisiones del orquestador en este checkpoint:** se mantienen los CHECK de la base de datos (verificado en la migración v1). El despliegue es de un proceso con `SERVE_FRONTEND=true` detrás de HTTPS.

## Checkpoint 1: tests del backend

- Los tests bajaron de 475 a unos 198, porque muchos probaban librerías externas y no el código propio. Se eliminaron.
- Hubo limpiezas de código y una caché de 7 días para `/fotos`. **(verificado)** la caché está en `backend/src/middleware/frontend.ts`.
- Después se agregaron tests de notificaciones. El estado actual es **212 pasan y 1 se saltea en Windows** (un test de permisos POSIX), en 14 archivos (ver [informe 03](2026-10-17_03_backend.md#tests)). Cifra del orquestador; no la volví a correr.

## Checkpoint 2: frontend

| Cambio | Verificación |
|---|---|
| Frontend en verde (tipos, lint y build) | No lo corrí. El resumen lo da por cumplido |
| Validación con `zod/mini` en vez de zod completo: JS inicial de unos 108 KB gzip | (verificado) `zod/mini` se usa en `frontend/src/api/client.ts` y `contract.ts`. JS medido: 106,6 KB gzip |
| Componentes por debajo de unos 300 líneas | (verificado) el más largo tiene 297 líneas (`Reserva.tsx`) |
| Botón de la cabecera corregido | (verificado) el código dice "Reservá tu turno". Las capturas de `reportes/capturas/` ya lo muestran |
| CSP solo en el backend | (verificado) la política está en `backend/src/middleware/security.ts` |
| Duraciones de servicios marcadas `COMPLETAR` | (verificado) `frontend/src/data/servicios.ts` |
| README del frontend y tests de fechas | (verificado) `frontend/README.md` y `frontend/src/turno.test.ts` |

**Punto de atención:** las descripciones, lo que incluye cada servicio y las duraciones son una propuesta del orquestador. El dueño no las confirmó. Están marcadas `COMPLETAR` hasta que lo haga.

## Prueba de punta a punta

Según el resumen, se hizo a través de un proxy, con 10 de 10 pruebas OK:

- Reserva válida: `201`. Reserva inválida: `400` con mensajes en español.
- Panel sin sesión: `401`. Login. Listado con `telefonoWhatsapp` `5493804123456` para el teléfono "0380 15-4123456".
- Confirmar, borrar (`204`), y pedido con `Origin` ajeno (`403`).
- Logout, y sesión revocada (`401`).

**No la volví a correr.** Es el resultado del orquestador.

## Estado final

| Punto | Estado |
|---|---|
| Checkpoint 0 | Cerrado |
| Checkpoint 1 | Cerrado. Conteo de tests por revisar |
| Checkpoint 2 | Cerrado |
| Prueba de punta a punta | 10/10 según el orquestador |
| Pendientes de producto | Datos del taller, servicios confirmados, precios, fotos (ver [informe 06](2026-10-17_06_pendientes-del-dueno.md)) |
| Seguridad | Terminada. Ver [informe 05](2026-10-17_05_seguridad.md) |

## Lo que no se pudo verificar

- Lo que el revisor descartó y el motivo. No está en el repo.
- El resultado de los tests y del build en esta pasada.
- La cifra de tests de esta pasada. Las fuentes dan 198 (checkpoint 1), 212 + 1 saltado (estado final, según el orquestador) y un conteo simple de 173 que resultó ser un error del conteo.
