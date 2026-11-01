-- =====================================================================================================
-- Precios por tipo de vehículo (contrato: reportes/2026-11-01_19_precios-por-vehiculo.md).
--
-- Hasta ahora cada servicio tenía un solo precio orientativo (precio_desde). Desde esta migración
-- precio_desde sigue siendo el precio de AUTO (no cambia su significado: cobro, presupuestos y SEO lo usan tal
-- cual) y se suman dos columnas: precio_desde_camioneta y precio_desde_moto. Las tres: entero en ARS de 0 a
-- 99.999.999 o null ("Consultá"; nunca se cae al precio de auto).
--
-- Estrictamente aditiva y compatible hacia atrás (el sistema ya está en producción):
--  - Columnas nullable, sin default y con CHECK: Postgres no reescribe la tabla ni toca las filas existentes.
--  - No se modifica ninguna columna, constraint, policy ni GRANT existente: solo se amplían los GRANT por
--    columna de mgdetailing_app (INSERT y UPDATE) con las dos columnas nuevas, igual que precio_desde.
--  - El backend viejo sigue andando con las columnas nuevas (no las conoce y quedan en null).
--
-- No se aplica a Supabase remoto sin aprobación del dueño.
-- =====================================================================================================

alter table mgdetailing.servicios
  add column precio_desde_camioneta integer
    constraint servicios_precio_camioneta_rango check (precio_desde_camioneta between 0 and 99999999),
  add column precio_desde_moto integer
    constraint servicios_precio_moto_rango check (precio_desde_moto between 0 and 99999999);

comment on column mgdetailing.servicios.precio_desde is
  'Precio orientativo en ARS para AUTO, entero (0 a 99.999.999). Null = "Consultá".';
comment on column mgdetailing.servicios.precio_desde_camioneta is
  'Precio orientativo en ARS para CAMIONETA, entero (0 a 99.999.999). Null = "Consultá".';
comment on column mgdetailing.servicios.precio_desde_moto is
  'Precio orientativo en ARS para MOTO, entero (0 a 99.999.999). Null = "Consultá".';

-- Privilegios: mismo modelo que precio_desde (GRANT por columna; las policies servicios_app_insert y
-- servicios_app_update ya cubren toda la fila). SELECT de la tabla ya lo tenía el rol.
grant insert (precio_desde_camioneta, precio_desde_moto) on mgdetailing.servicios to mgdetailing_app;
grant update (precio_desde_camioneta, precio_desde_moto) on mgdetailing.servicios to mgdetailing_app;
