# Reportes de MgDetailing

**Documentación final (2026-10-19):** la versión completa y actualizada del proyecto, para leer de corrido, está en [documentacion/MgDetailing-Documentacion-2026-10-19-final.pdf](documentacion/MgDetailing-Documentacion-2026-10-19-final.pdf) (y la misma en Word: [.docx](documentacion/MgDetailing-Documentacion-2026-10-19-final.docx)). Manda sobre los informes de abajo, que son de 2026-10-17 (fecha de corte del estado descripto) y describen el sistema anterior (SQLite y login propio) en varios puntos.

Índice de los informes del proyecto.

| Archivo | Fecha | Qué contiene |
|---|---|---|
| [2026-10-17_01_informe-general.md](2026-10-17_01_informe-general.md) | 2026-10-17 | Resumen ejecutivo, qué se construyó, equipo de agentes y modelos, línea de tiempo, estado actual y próximos pasos. |
| [2026-10-17_02_frontend.md](2026-10-17_02_frontend.md) | 2026-10-17 | Diseño, secciones de la landing, panel, rendimiento, accesibilidad, SEO, archivos de marca y capturas. Incluye el estado de la tipografía y del monograma giratorio. |
| [2026-10-17_03_backend.md](2026-10-17_03_backend.md) | 2026-10-17 | Endpoints de la API, datos que se guardan, seguridad incorporada, opciones para los avisos de turnos, operación y límites conocidos. |
| [2026-10-17_04_revision-calidad.md](2026-10-17_04_revision-calidad.md) | 2026-10-17 | Checkpoints 0, 1 y 2 de la revisión de calidad y escalabilidad, y estado final. |
| [2026-10-17_05_seguridad.md](2026-10-17_05_seguridad.md) | 2026-10-17 | Informe de seguridad: qué se probó, hallazgos (todos de riesgo bajo o medio, ninguno crítico ni alto), correcciones aplicadas, riesgos que quedan por la operación y pasos para producción. Incluye la propuesta legal sobre datos personales. |
| [2026-10-17_06_pendientes-del-dueno.md](2026-10-17_06_pendientes-del-dueno.md) | 2026-10-17 | Checklist de lo que tiene que hacer o decidir el dueño, con el archivo exacto y un ejemplo de cada dato. |

## Carpeta `capturas/`

Capturas de pantalla de la landing (escritorio y celular, primer pantallazo y página completa), el panel, la comparación de tipografías y el monograma girado. Regeneradas el 2026-10-17 con la tipografía y el monograma nuevos; `panel-admin.png` es del 2026-10-16 (con datos de prueba).

| Archivo | Muestra |
|---|---|
| `capturas/inicio-escritorio.png` | Landing en escritorio, primera pantalla |
| `capturas/inicio-celular.png` | Landing en celular, primera pantalla |
| `capturas/pagina-completa-escritorio.png` | Landing completa en escritorio |
| `capturas/pagina-completa-celular.png` | Landing completa en celular |
| `capturas/panel-admin.png` | Panel de solicitudes (con datos de prueba, no son clientes reales) |

Más capturas (tipografías, estados del panel, versiones finales) están en `frontend/.capturas/`. Esa carpeta está ignorada por git: existe solo en esta máquina.

## Carpeta `documentacion/`

Documentación completa del proyecto para el dueño, en Word y PDF (mismo contenido, estado al 2026-10-19). Incluye capturas nuevas del panel con roles (`frontend/.capturas/`, con datos simulados).
