---
version: 1
slug: "src-admin-adminapp-tsx"
primary_target: "src/admin/AdminApp.tsx"
related_targets: []
---

# Panel (/admin)

Mode: Operate. Usuario: el dueño del taller, entre trabajos, muchas veces en el celular y con luz de taller o de día; por eso el área de trabajo es clara (gris imprimación y blanco) bajo un riel grafito de marca. Tarea: revisar solicitudes de turno nuevas y resolverlas (confirmar, completar, cancelar, eliminar, escribir por WhatsApp). Estados: pendiente, confirmado, completado, cancelado; vacío; cargando; error de red; sesión vencida (401 → login). Código primero (Operate).

Estructura: cola de triage (seed de superficie d0066…, índices repartidos 4, 5, 2; lidera 4). Las pendientes encabezan por defecto, con transiciones de estado como botones grandes de una sola acción (Confirmar, Marcar completado, Cancelar) y el selector de estado completo como respaldo; filtros por estado como pestañas con el total de pendientes siempre visible; lista paginada, más nuevas primero; tarjetas en móvil, filas anchas en desktop. Alternativas repartidas y no construidas: agenda por fecha (5), maestro-detalle (2).

El mundo aporta solo tipo (Archivo; Bodoni solo en la marca), paleta (riel grafito, rojo para la acción principal y la selección), densidad cómoda y una firma: el filete rojo con voluta marca la pestaña activa y el sello de estado de cada solicitud.
Disciplina tomada (pase de embarque): lo que cambió queda marcado hasta que se ve; las solicitudes nuevas desde la última visita llevan "Nueva".
