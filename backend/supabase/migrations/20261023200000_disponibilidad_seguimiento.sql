-- =====================================================================================================
-- Disponibilidad real, seguimiento del turno y recordatorios
-- (contrato: reportes/2026-10-23_11_disponibilidad-seguimiento-recordatorios.md).
--
--  - mgdetailing.horario_semanal: la regla de siempre, una fila por día de la semana. Convención de `dia`: la de
--    Postgres (extract(dow)) y JavaScript (Date.getUTCDay()): 0 = domingo, 1 = lunes ... 6 = sábado. `abierto` y
--    cuántos turnos entran a la mañana y a la tarde (0 a 20; un cupo en 0 cierra esa franja). Valor inicial: lunes a
--    sábado abierto con 2 por franja; domingo cerrado (con los cupos en 2, para que al abrirlo ya tenga un valor).
--  - mgdetailing.dias_especiales: la excepción, gana sobre el horario semanal. Una fecha puntual cerrada (feriado,
--    vacaciones) o abierta con sus propios cupos (un domingo o un feriado que el dueño decide trabajar). Los cupos son
--    obligatorios si está abierta y null si está cerrada (CHECK dias_especiales_cupos). Motivo opcional, hasta 80.
--    Sembrada con los feriados INAMOVIBLES de lo que queda de 2026 y de 2027, más el 20/11/2026 trasladado al lunes
--    23/11 (a confirmar). Los trasladables y los puentes los decide el gobierno cada año: los revisa el dueño.
--    Todos los motivos sembrados empiezan con "Feriado: " (así el panel puede marcarlos como precargados).
--  - bookings.recordatorio_enviado_at timestamptz null: cuándo se mandó el recordatorio del día anterior. Null = no se
--    mandó (o se reprogramó después: el backend limpia la marca al cambiar la fecha o la franja de agenda).
--
-- Los turnos que ocupan cupo (no cancelados, por fecha y franja de agenda) se cuentan con el índice parcial
-- bookings_agenda_idx (migración agenda_fecha_confirmada), que tiene las mismas expresiones y el mismo predicado.
-- Los recordatorios (estado = 'confirmado' y fecha de agenda = mañana) también lo pueden usar: no hace falta otro.
--
-- Seguridad, mismo modelo que rol_app_minimo_privilegio: RLS habilitado, sin policies ni privilegios para anon,
-- authenticated ni service_role; GRANT mínimo a mgdetailing_app con su policy USING/WITH CHECK (true):
--   horario_semanal: SELECT y UPDATE solo de abierto, cupo_manana y cupo_tarde (las 7 filas son fijas: sin INSERT
--                    ni DELETE; updated_at lo pone el trigger).
--   dias_especiales: SELECT, INSERT, UPDATE (abierto, cupos, motivo) y DELETE.
--   bookings:        UPDATE de recordatorio_enviado_at.
-- El alta pública se serializa por fecha con pg_advisory_xact_lock(7340003, <días desde 2000-01-01>) (funciones de
-- pg_catalog: no necesitan GRANT). 7340001 y 7340002 ya los usan el trigger de superadmin y el catálogo.
--
-- La columna nueva de bookings es nullable sin default: no reescribe la tabla. Las tablas nuevas son chicas.
--
-- No se aplica a Supabase remoto sin pasar las pruebas.
-- =====================================================================================================

-- -----------------------------------------------------------------------------------------------------
-- horario_semanal
-- -----------------------------------------------------------------------------------------------------
create table mgdetailing.horario_semanal (
  dia          smallint    primary key
                           constraint horario_semanal_dia_valido check (dia between 0 and 6),
  abierto      boolean     not null,
  cupo_manana  smallint    not null
                           constraint horario_semanal_cupo_manana_valido check (cupo_manana between 0 and 20),
  cupo_tarde   smallint    not null
                           constraint horario_semanal_cupo_tarde_valido check (cupo_tarde between 0 and 20),
  updated_at   timestamptz not null default now()
);

comment on table mgdetailing.horario_semanal is
  'Horario semanal del taller: si se atiende cada día y cuántos turnos entran por franja. dia: 0 = domingo ... 6 = sábado.';

create trigger horario_semanal_set_updated_at
  before update on mgdetailing.horario_semanal
  for each row execute function mgdetailing.set_updated_at();

insert into mgdetailing.horario_semanal (dia, abierto, cupo_manana, cupo_tarde) values
  (0, false, 2, 2), -- domingo: cerrado
  (1, true,  2, 2),
  (2, true,  2, 2),
  (3, true,  2, 2),
  (4, true,  2, 2),
  (5, true,  2, 2),
  (6, true,  2, 2); -- sábado

-- -----------------------------------------------------------------------------------------------------
-- dias_especiales
-- -----------------------------------------------------------------------------------------------------
create table mgdetailing.dias_especiales (
  fecha        date        primary key,
  abierto      boolean     not null,
  cupo_manana  smallint
               constraint dias_especiales_cupo_manana_valido check (cupo_manana between 0 and 20),
  cupo_tarde   smallint
               constraint dias_especiales_cupo_tarde_valido check (cupo_tarde between 0 and 20),
  motivo       text
               constraint dias_especiales_motivo_largo check (char_length(motivo) between 1 and 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Abierto: los dos cupos con valor. Cerrado: los dos en null.
  constraint dias_especiales_cupos check (
    (abierto and cupo_manana is not null and cupo_tarde is not null)
    or (not abierto and cupo_manana is null and cupo_tarde is null)
  )
);

comment on table mgdetailing.dias_especiales is
  'Días puntuales que pisan al horario semanal: cerrados (feriados, vacaciones) o abiertos con sus propios cupos.';

create trigger dias_especiales_set_updated_at
  before update on mgdetailing.dias_especiales
  for each row execute function mgdetailing.set_updated_at();

-- Feriados inamovibles (y el 20/11/2026 trasladado al 23/11), como días cerrados. El dueño abre los que quiera trabajar.
insert into mgdetailing.dias_especiales (fecha, abierto, motivo) values
  ('2026-11-23', false, 'Feriado: Día de la Soberanía Nacional (trasladable, a confirmar)'),
  ('2026-12-08', false, 'Feriado: Inmaculada Concepción de María'),
  ('2026-12-25', false, 'Feriado: Navidad'),
  ('2027-01-01', false, 'Feriado: Año Nuevo'),
  ('2027-02-08', false, 'Feriado: Carnaval'),
  ('2027-02-09', false, 'Feriado: Carnaval'),
  ('2027-03-24', false, 'Feriado: Día Nacional de la Memoria por la Verdad y la Justicia'),
  ('2027-03-26', false, 'Feriado: Viernes Santo'),
  ('2027-04-02', false, 'Feriado: Día del Veterano y de los Caídos en la Guerra de Malvinas'),
  ('2027-05-01', false, 'Feriado: Día del Trabajador'),
  ('2027-05-25', false, 'Feriado: Día de la Revolución de Mayo'),
  ('2027-06-20', false, 'Feriado: Paso a la Inmortalidad del General Manuel Belgrano'),
  ('2027-07-09', false, 'Feriado: Día de la Independencia'),
  ('2027-12-08', false, 'Feriado: Inmaculada Concepción de María'),
  ('2027-12-25', false, 'Feriado: Navidad');

-- -----------------------------------------------------------------------------------------------------
-- bookings: recordatorio del día anterior
-- -----------------------------------------------------------------------------------------------------
alter table mgdetailing.bookings add column recordatorio_enviado_at timestamptz;

comment on column mgdetailing.bookings.recordatorio_enviado_at is
  'Cuándo se mandó el recordatorio del día anterior. Null = no se mandó (o se reprogramó después).';

-- Marcar el recordatorio no es un cambio del turno: updated_at es el "actualizado el" que ve el cliente en la página
-- de seguimiento. El trigger de updated_at deja de correr cuando la sentencia cambia recordatorio_enviado_at (las
-- escrituras del backend que además cambian el turno, como reprogramar, mandan su propio updated_at).
drop trigger bookings_set_updated_at on mgdetailing.bookings;
create trigger bookings_set_updated_at
  before update on mgdetailing.bookings
  for each row
  when (old.recordatorio_enviado_at is not distinct from new.recordatorio_enviado_at)
  execute function mgdetailing.set_updated_at();

-- -----------------------------------------------------------------------------------------------------
-- Seguridad
-- -----------------------------------------------------------------------------------------------------
alter table mgdetailing.horario_semanal enable row level security;
alter table mgdetailing.dias_especiales enable row level security;

-- Las default privileges del esquema ya lo revocan; se repite explícito (defensa en profundidad).
revoke all on mgdetailing.horario_semanal from public, anon, authenticated, service_role;
revoke all on mgdetailing.dias_especiales from public, anon, authenticated, service_role;

grant select on mgdetailing.horario_semanal to mgdetailing_app;
grant update (abierto, cupo_manana, cupo_tarde) on mgdetailing.horario_semanal to mgdetailing_app;

grant select, delete on mgdetailing.dias_especiales to mgdetailing_app;
grant insert (fecha, abierto, cupo_manana, cupo_tarde, motivo) on mgdetailing.dias_especiales to mgdetailing_app;
grant update (abierto, cupo_manana, cupo_tarde, motivo) on mgdetailing.dias_especiales to mgdetailing_app;

grant update (recordatorio_enviado_at) on mgdetailing.bookings to mgdetailing_app;

create policy horario_semanal_app_select on mgdetailing.horario_semanal
  for select to mgdetailing_app using (true);
create policy horario_semanal_app_update on mgdetailing.horario_semanal
  for update to mgdetailing_app using (true) with check (true);

create policy dias_especiales_app_select on mgdetailing.dias_especiales
  for select to mgdetailing_app using (true);
create policy dias_especiales_app_insert on mgdetailing.dias_especiales
  for insert to mgdetailing_app with check (true);
create policy dias_especiales_app_update on mgdetailing.dias_especiales
  for update to mgdetailing_app using (true) with check (true);
create policy dias_especiales_app_delete on mgdetailing.dias_especiales
  for delete to mgdetailing_app using (true);
