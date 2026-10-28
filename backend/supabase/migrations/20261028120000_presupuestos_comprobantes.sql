-- =====================================================================================================
-- Presupuestos y comprobantes de pago
-- (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md, migración M3).
--
--  - mgdetailing.presupuestos: lo que el taller le cotiza a un cliente. `numero` es una identidad (P-0007): nunca se
--    reutiliza, ni siquiera al borrar un presupuesto. `items` es un jsonb de 1 a 30 ítems { descripcion,
--    cantidad, precioUnitario } validado por una función IMMUTABLE (mismo recurso que el catálogo). `total` lo
--    calcula el backend (suma de round(cantidad x precio) menos el descuento, nunca negativo) y la base solo
--    verifica su rango. `turno_id` y `creado_por` ON DELETE SET NULL.
--  - mgdetailing.comprobantes: el comprobante de pago interno (R-0001) de un turno completado. Es una FOTO del
--    momento: copia nombre, servicio, vehículo y monto, para que no cambie si después se edita el turno. Un turno
--    tiene a lo sumo uno (`booking_id` único) y `booking_id` es ON DELETE RESTRICT: no se borra un turno con
--    comprobante emitido. La app no tiene UPDATE ni DELETE sobre comprobantes.
--  Ninguno es una factura.
--
-- Seguridad, mismo modelo que las migraciones anteriores: RLS habilitado, sin policies ni privilegios para anon,
-- authenticated ni service_role; GRANT mínimo a mgdetailing_app con su policy USING/WITH CHECK (true):
--   presupuestos: SELECT, INSERT, DELETE y UPDATE de las columnas editables (nunca id ni numero).
--   comprobantes: SELECT e INSERT.
-- Los CHECK son la segunda línea de defensa (la API valida con zod). Tablas nuevas: no se reescribe nada. No se
-- aplica a Supabase remoto sin pasar las pruebas.
-- =====================================================================================================

-- -----------------------------------------------------------------------------------------------------
-- Validación del jsonb de ítems
-- Un CHECK no admite subconsultas: va en una función IMMUTABLE. CASE (y no AND) para que cada cast solo se evalúe
-- sobre el tipo que corresponde. SECURITY INVOKER y search_path vacío. mgdetailing_app necesita EXECUTE.
-- -----------------------------------------------------------------------------------------------------
create function mgdetailing.presupuesto_items_validos(valor jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when pg_catalog.jsonb_typeof(valor) is distinct from 'array' then false
    when pg_catalog.jsonb_array_length(valor) not between 1 and 30 then false
    else not exists (
      select 1
      from pg_catalog.jsonb_array_elements(valor) as e(item)
      where case
        when pg_catalog.jsonb_typeof(e.item) <> 'object' then true
        -- Exactamente las claves cantidad, descripcion y precioUnitario (nada más).
        when (select pg_catalog.array_agg(o.k order by o.k) from pg_catalog.jsonb_object_keys(e.item) as o(k))
             is distinct from array['cantidad', 'descripcion', 'precioUnitario'] then true
        when pg_catalog.jsonb_typeof(e.item -> 'descripcion') <> 'string'
          or pg_catalog.jsonb_typeof(e.item -> 'cantidad') <> 'number'
          or pg_catalog.jsonb_typeof(e.item -> 'precioUnitario') <> 'number' then true
        when pg_catalog.char_length(pg_catalog.btrim(e.item ->> 'descripcion')) not between 1 and 120 then true
        -- cantidad: mayor que 0, hasta 999 y con a lo sumo 2 decimales.
        when (e.item ->> 'cantidad')::numeric <= 0 or (e.item ->> 'cantidad')::numeric > 999 then true
        when (e.item ->> 'cantidad')::numeric <> pg_catalog.round((e.item ->> 'cantidad')::numeric, 2) then true
        -- precioUnitario: entero de 0 a 99.999.999.
        when (e.item ->> 'precioUnitario')::numeric not between 0 and 99999999 then true
        else (e.item ->> 'precioUnitario')::numeric <> pg_catalog.trunc((e.item ->> 'precioUnitario')::numeric)
      end
    )
  end
$$;

comment on function mgdetailing.presupuesto_items_validos(jsonb) is
  'CHECK de presupuestos.items: array de 1 a 30 { descripcion (1 a 120), cantidad (>0, <=999, 2 decimales), precioUnitario (entero 0 a 99.999.999) }.';

revoke all on function mgdetailing.presupuesto_items_validos(jsonb) from public, anon, authenticated, service_role;
grant execute on function mgdetailing.presupuesto_items_validos(jsonb) to mgdetailing_app;

-- -----------------------------------------------------------------------------------------------------
-- presupuestos
-- -----------------------------------------------------------------------------------------------------
create table mgdetailing.presupuestos (
  id               uuid        primary key default gen_random_uuid(),
  numero           integer     generated always as identity
                               constraint presupuestos_numero_unico unique,
  cliente_nombre   text        not null
                               constraint presupuestos_cliente_nombre_largo check (char_length(cliente_nombre) between 1 and 80 and btrim(cliente_nombre) <> ''),
  cliente_telefono text
                               constraint presupuestos_cliente_telefono_formato check (cliente_telefono ~ '^[0-9]{8,15}$'),
  vehiculo         text
                               constraint presupuestos_vehiculo_largo check (char_length(vehiculo) between 1 and 80),
  items            jsonb       not null
                               constraint presupuestos_items_validos check (mgdetailing.presupuesto_items_validos(items)),
  descuento        integer     not null default 0
                               constraint presupuestos_descuento_rango check (descuento between 0 and 999999999),
  total            integer     not null
                               constraint presupuestos_total_rango check (total between 0 and 999999999),
  validez_dias     smallint    not null default 7
                               constraint presupuestos_validez_rango check (validez_dias between 1 and 90),
  estado           text        not null default 'borrador'
                               constraint presupuestos_estado_valido check (estado in ('borrador', 'enviado', 'aceptado', 'rechazado')),
  notas            text
                               constraint presupuestos_notas_largo check (char_length(notas) between 1 and 500),
  turno_id         uuid
                               constraint presupuestos_turno_fkey references mgdetailing.bookings (id) on update restrict on delete set null,
  creado_por       uuid
                               constraint presupuestos_creado_por_fkey references mgdetailing.perfiles (id) on update restrict on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table mgdetailing.presupuestos is
  'Presupuestos para clientes (no son facturas). numero = identidad, no se reutiliza. total lo calcula el backend.';

create index presupuestos_estado_idx     on mgdetailing.presupuestos (estado);
create index presupuestos_turno_idx      on mgdetailing.presupuestos (turno_id)   where turno_id is not null;
create index presupuestos_creado_por_idx on mgdetailing.presupuestos (creado_por) where creado_por is not null;

create trigger presupuestos_set_updated_at
  before update on mgdetailing.presupuestos
  for each row execute function mgdetailing.set_updated_at();

-- -----------------------------------------------------------------------------------------------------
-- comprobantes
-- -----------------------------------------------------------------------------------------------------
create table mgdetailing.comprobantes (
  id              uuid        primary key default gen_random_uuid(),
  numero          integer     generated always as identity
                              constraint comprobantes_numero_unico unique,
  booking_id      uuid        not null
                              constraint comprobantes_booking_unico unique
                              constraint comprobantes_booking_fkey references mgdetailing.bookings (id) on update restrict on delete restrict,
  fecha_emision   date        not null,
  forma_pago      text        not null
                              constraint comprobantes_forma_pago_valida check (forma_pago in ('efectivo', 'transferencia', 'debito', 'credito', 'otro')),
  cliente_nombre  text        not null
                              constraint comprobantes_cliente_nombre_largo check (char_length(cliente_nombre) between 1 and 120),
  servicio_nombre text        not null
                              constraint comprobantes_servicio_nombre_largo check (char_length(servicio_nombre) between 1 and 120),
  vehiculo        text
                              constraint comprobantes_vehiculo_largo check (char_length(vehiculo) between 1 and 80),
  monto           integer     not null
                              constraint comprobantes_monto_rango check (monto between 0 and 99999999),
  notas           text
                              constraint comprobantes_notas_largo check (char_length(notas) between 1 and 200),
  creado_por      uuid
                              constraint comprobantes_creado_por_fkey references mgdetailing.perfiles (id) on update restrict on delete set null,
  created_at      timestamptz not null default now()
);

comment on table mgdetailing.comprobantes is
  'Comprobante de pago interno (no es una factura): foto del momento de un turno completado. Uno por turno.';

create index comprobantes_creado_por_idx on mgdetailing.comprobantes (creado_por) where creado_por is not null;

-- -----------------------------------------------------------------------------------------------------
-- Seguridad
-- -----------------------------------------------------------------------------------------------------
alter table mgdetailing.presupuestos enable row level security;
alter table mgdetailing.comprobantes enable row level security;

revoke all on mgdetailing.presupuestos from public, anon, authenticated, service_role;
revoke all on mgdetailing.comprobantes from public, anon, authenticated, service_role;

grant select, delete on mgdetailing.presupuestos to mgdetailing_app;
grant insert (cliente_nombre, cliente_telefono, vehiculo, items, descuento, total, validez_dias, estado, notas, turno_id, creado_por, created_at, updated_at)
  on mgdetailing.presupuestos to mgdetailing_app;
grant update (cliente_nombre, cliente_telefono, vehiculo, items, descuento, total, validez_dias, estado, notas, turno_id, updated_at)
  on mgdetailing.presupuestos to mgdetailing_app;

grant select on mgdetailing.comprobantes to mgdetailing_app;
grant insert (booking_id, fecha_emision, forma_pago, cliente_nombre, servicio_nombre, vehiculo, monto, notas, creado_por)
  on mgdetailing.comprobantes to mgdetailing_app;

create policy presupuestos_app_select on mgdetailing.presupuestos
  for select to mgdetailing_app using (true);
create policy presupuestos_app_insert on mgdetailing.presupuestos
  for insert to mgdetailing_app with check (true);
create policy presupuestos_app_update on mgdetailing.presupuestos
  for update to mgdetailing_app using (true) with check (true);
create policy presupuestos_app_delete on mgdetailing.presupuestos
  for delete to mgdetailing_app using (true);

create policy comprobantes_app_select on mgdetailing.comprobantes
  for select to mgdetailing_app using (true);
create policy comprobantes_app_insert on mgdetailing.comprobantes
  for insert to mgdetailing_app with check (true);
