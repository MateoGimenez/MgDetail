-- =====================================================================================================
-- Servicios por tipo de vehículo (contrato: reportes/2026-11-01_19_precios-por-vehiculo.md, parte 2).
--
-- Cada servicio se ofrece para un conjunto de vehículos: la landing muestra solo los del tipo elegido y
-- POST /api/bookings rechaza un servicio que no se ofrece para ese vehículo. Se aplica DESPUÉS de
-- 20261101100000_precios_por_vehiculo.
--
-- Estrictamente aditiva y compatible hacia atrás (el sistema ya está en producción):
--  - Columna nueva `vehiculos text[] not null default array['auto','camioneta','moto']`: los servicios que ya
--    existen quedan en los tres (nada desaparece de la web) y un INSERT del backend viejo, que no la conoce,
--    también queda en los tres. En Postgres 11+ agregar una columna con default constante no reescribe la tabla.
--  - CHECK: de 1 a 3 elementos, sin repetidos, todos de {auto, camioneta, moto}.
--  - No se modifica ninguna columna, constraint ni policy existente: solo se amplían los GRANT por columna de
--    mgdetailing_app (INSERT y UPDATE), igual que con los precios. No toca datos: los precios iniciales van en
--    backend/supabase/seeds/, fuera de las migraciones.
--
-- No se aplica a Supabase remoto sin aprobación del dueño.
-- =====================================================================================================

-- Un CHECK no admite subconsultas: el "sin repetidos" va en una función IMMUTABLE (SECURITY INVOKER y search_path
-- vacío, como las del catálogo). mgdetailing_app necesita EXECUTE porque el CHECK corre con sus permisos.
create function mgdetailing.servicio_vehiculos_valido(valor text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select valor is not null
    and pg_catalog.cardinality(valor) between 1 and 3
    and valor <@ array['auto', 'camioneta', 'moto']::text[]
    and (select pg_catalog.count(distinct v) from pg_catalog.unnest(valor) as u(v)) = pg_catalog.cardinality(valor)
$$;

comment on function mgdetailing.servicio_vehiculos_valido(text[]) is
  'CHECK de servicios.vehiculos: de 1 a 3 tipos, sin repetidos, todos de auto, camioneta o moto.';

revoke all on function mgdetailing.servicio_vehiculos_valido(text[]) from public, anon, authenticated, service_role;
grant execute on function mgdetailing.servicio_vehiculos_valido(text[]) to mgdetailing_app;

alter table mgdetailing.servicios
  add column vehiculos text[] not null default array['auto', 'camioneta', 'moto']
    constraint servicios_vehiculos_valido check (mgdetailing.servicio_vehiculos_valido(vehiculos));

comment on column mgdetailing.servicios.vehiculos is
  'Tipos de vehículo para los que se ofrece el servicio (auto, camioneta, moto): de 1 a 3, sin repetidos.';

grant insert (vehiculos) on mgdetailing.servicios to mgdetailing_app;
grant update (vehiculos) on mgdetailing.servicios to mgdetailing_app;
