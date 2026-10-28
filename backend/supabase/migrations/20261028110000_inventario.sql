-- =====================================================================================================
-- Inventario: insumos y movimientos de stock
-- (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md, migración M2).
--
--  - mgdetailing.insumos: lo que el taller usa (ceras, shampoo, paños...). `stock` y `stock_minimo` son decimales
--    (numeric(12,2): 4,5 litros), `costo_unitario` son pesos enteros (null = sin costo cargado). El CHECK
--    `stock >= 0` es la red de seguridad: el backend ya bloquea cada insumo (pg_advisory_xact_lock) y descuenta con
--    un UPDATE condicional, pero si algo fallara, la base nunca deja el stock en negativo. Nombre único entre los
--    insumos activos, sin distinguir mayúsculas (índice único parcial). No se borran insumos: se desactivan.
--  - mgdetailing.movimientos_stock: el historial. `cantidad` lleva signo (compra +, uso -, ajuste +/-) y el CHECK
--    lo obliga. Los movimientos no se editan ni se borran (la app no tiene UPDATE ni DELETE). Una compra con costo
--    deja su gasto (`gasto_id` -> gastos, único: un gasto no puede ser de dos movimientos). `turno_id` y `perfil_id`
--    ON DELETE SET NULL: si el turno o la persona se borran, el historial queda. `insumo_id` ON DELETE RESTRICT.
--
-- Seguridad, mismo modelo que las migraciones anteriores: RLS habilitado, sin policies ni privilegios para anon,
-- authenticated ni service_role; GRANT mínimo a mgdetailing_app con su policy USING/WITH CHECK (true):
--   insumos:           SELECT, INSERT y UPDATE de las columnas editables (sin DELETE).
--   movimientos_stock: SELECT e INSERT (sin UPDATE ni DELETE).
-- Los CHECK de rango y de largo son la segunda línea de defensa (la API valida con zod). updated_at lo mantiene el
-- trigger set_updated_at existente. Tablas nuevas: no se reescribe nada. No se aplica a Supabase remoto sin pasar
-- las pruebas.
-- =====================================================================================================

-- -----------------------------------------------------------------------------------------------------
-- insumos
-- -----------------------------------------------------------------------------------------------------
create table mgdetailing.insumos (
  id             uuid          primary key default gen_random_uuid(),
  nombre         text          not null
                               constraint insumos_nombre_largo check (char_length(nombre) between 1 and 80 and btrim(nombre) <> ''),
  categoria      text
                               constraint insumos_categoria_largo check (char_length(categoria) between 1 and 40),
  unidad         text          not null
                               constraint insumos_unidad_valida check (unidad in ('unidad', 'litro', 'ml', 'kg', 'g', 'par', 'caja')),
  stock          numeric(12,2) not null default 0
                               constraint insumos_stock_rango check (stock >= 0 and stock <= 9999999.99),
  stock_minimo   numeric(12,2) not null default 0
                               constraint insumos_stock_minimo_rango check (stock_minimo >= 0 and stock_minimo <= 999999),
  costo_unitario integer
                               constraint insumos_costo_unitario_rango check (costo_unitario between 0 and 99999999),
  activo         boolean       not null default true,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

comment on table mgdetailing.insumos is
  'Insumos del taller con su stock. Nombre único entre los activos. No se borran: se desactivan.';
comment on column mgdetailing.insumos.costo_unitario is
  'Pesos enteros por unidad. Lo actualiza una compra con costo. Nunca se le muestra al empleado.';

-- Nombre único entre los activos, sin distinguir mayúsculas ni espacios de los extremos.
create unique index insumos_nombre_activo_uidx on mgdetailing.insumos (lower(btrim(nombre))) where activo;

create trigger insumos_set_updated_at
  before update on mgdetailing.insumos
  for each row execute function mgdetailing.set_updated_at();

-- -----------------------------------------------------------------------------------------------------
-- movimientos_stock
-- -----------------------------------------------------------------------------------------------------
create table mgdetailing.movimientos_stock (
  id          uuid          primary key default gen_random_uuid(),
  insumo_id   uuid          not null
                            constraint movimientos_stock_insumo_fkey references mgdetailing.insumos (id) on update restrict on delete restrict,
  tipo        text          not null
                            constraint movimientos_stock_tipo_valido check (tipo in ('compra', 'uso', 'ajuste')),
  cantidad    numeric(12,2) not null
                            constraint movimientos_stock_cantidad_rango check (cantidad between -9999999.99 and 9999999.99),
  costo_total integer
                            constraint movimientos_stock_costo_rango check (costo_total between 0 and 99999999),
  proveedor   text
                            constraint movimientos_stock_proveedor_largo check (char_length(proveedor) between 1 and 80),
  nota        text
                            constraint movimientos_stock_nota_largo check (char_length(nota) between 1 and 200),
  turno_id    uuid
                            constraint movimientos_stock_turno_fkey references mgdetailing.bookings (id) on update restrict on delete set null,
  gasto_id    uuid
                            constraint movimientos_stock_gasto_fkey references mgdetailing.gastos (id) on update restrict on delete set null
                            constraint movimientos_stock_gasto_unico unique,
  perfil_id   uuid
                            constraint movimientos_stock_perfil_fkey references mgdetailing.perfiles (id) on update restrict on delete set null,
  created_at  timestamptz   not null default now(),
  -- El signo de la cantidad va con el tipo: compra suma, uso resta, ajuste cambia (no puede ser 0).
  constraint movimientos_stock_signo check (
    (tipo = 'compra' and cantidad > 0) or (tipo = 'uso' and cantidad < 0) or (tipo = 'ajuste' and cantidad <> 0)),
  -- Solo una compra lleva costo, proveedor y gasto.
  constraint movimientos_stock_solo_compra_con_costo check (
    tipo = 'compra' or (costo_total is null and proveedor is null and gasto_id is null))
);

comment on table mgdetailing.movimientos_stock is
  'Historial del stock de cada insumo. cantidad con signo (compra +, uso -, ajuste +/-). Inmutable para la app.';

-- Historial de un insumo, más nuevos primero (GET /api/admin/insumos/:id/movimientos).
create index movimientos_stock_insumo_idx on mgdetailing.movimientos_stock (insumo_id, created_at desc, id);
-- Las FK con ON DELETE SET NULL (recorridas al borrar un turno o una persona).
create index movimientos_stock_turno_idx  on mgdetailing.movimientos_stock (turno_id)  where turno_id is not null;
create index movimientos_stock_perfil_idx on mgdetailing.movimientos_stock (perfil_id) where perfil_id is not null;

-- -----------------------------------------------------------------------------------------------------
-- Seguridad
-- -----------------------------------------------------------------------------------------------------
alter table mgdetailing.insumos           enable row level security;
alter table mgdetailing.movimientos_stock enable row level security;

revoke all on mgdetailing.insumos           from public, anon, authenticated, service_role;
revoke all on mgdetailing.movimientos_stock from public, anon, authenticated, service_role;

grant select on mgdetailing.insumos to mgdetailing_app;
grant insert (nombre, categoria, unidad, stock, stock_minimo, costo_unitario, activo) on mgdetailing.insumos to mgdetailing_app;
grant update (nombre, categoria, unidad, stock, stock_minimo, costo_unitario, activo, updated_at) on mgdetailing.insumos to mgdetailing_app;

grant select on mgdetailing.movimientos_stock to mgdetailing_app;
grant insert (insumo_id, tipo, cantidad, costo_total, proveedor, nota, turno_id, gasto_id, perfil_id)
  on mgdetailing.movimientos_stock to mgdetailing_app;

create policy insumos_app_select on mgdetailing.insumos
  for select to mgdetailing_app using (true);
create policy insumos_app_insert on mgdetailing.insumos
  for insert to mgdetailing_app with check (true);
create policy insumos_app_update on mgdetailing.insumos
  for update to mgdetailing_app using (true) with check (true);

create policy movimientos_stock_app_select on mgdetailing.movimientos_stock
  for select to mgdetailing_app using (true);
create policy movimientos_stock_app_insert on mgdetailing.movimientos_stock
  for insert to mgdetailing_app with check (true);
