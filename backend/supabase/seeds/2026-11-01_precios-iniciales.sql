-- =====================================================================================================
-- Precios iniciales por tipo de vehículo (contrato: reportes/2026-11-01_19_precios-por-vehiculo.md, parte 2).
--
-- NO es una migración (por eso no está en supabase/migrations/: los tests aplican todas las migraciones y suponen
-- precios en null). Se corre a mano UNA vez, en el SQL Editor de Supabase, DESPUÉS de aplicar las migraciones
-- 20261101100000_precios_por_vehiculo y 20261101110000_servicios_por_vehiculo.
--
-- Idempotente: se puede correr de nuevo y deja lo mismo. Actualiza solo por id y solo estos dos servicios; el resto
-- (encerado, pulido, restauración de ópticas y cualquier otro) no se toca: el dueño los ajusta desde el panel.
-- Si el dueño ya cambió estos precios desde el panel, volver a correr este archivo los pisa.
--
--   servicio         auto     camioneta   moto
--   lavado-basico    20.000   30.000      10.000
--   lavado-premium   40.000   50.000      15.000
-- =====================================================================================================

update mgdetailing.servicios as s
set precio_desde           = p.auto,
    precio_desde_camioneta = p.camioneta,
    precio_desde_moto      = p.moto
from (values
  ('lavado-basico',  20000, 30000, 10000),
  ('lavado-premium', 40000, 50000, 15000)
) as p(id, auto, camioneta, moto)
where s.id = p.id
  and (s.precio_desde, s.precio_desde_camioneta, s.precio_desde_moto)
      is distinct from (p.auto, p.camioneta, p.moto);
