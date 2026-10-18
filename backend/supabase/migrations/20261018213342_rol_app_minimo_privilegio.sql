-- =====================================================================================================
-- Rol dedicado del backend: mgdetailing_app (mínimo privilegio).
--
-- Hasta ahora el backend se conectaba como "postgres": dueño de las tablas, con BYPASSRLS, CREATEROLE y DDL
-- sobre todo el proyecto (auth, storage, public...). Un bug o una inyección SQL tendría la base entera.
-- Este rol puede SOLO lo que el backend hace:
--   servicios: SELECT (verificación del catálogo al arrancar)
--   bookings:  SELECT, INSERT, UPDATE (solo estado y updated_at), DELETE
--   admins:    SELECT, INSERT, UPDATE (solo password_hash y updated_at)  (script crear-admin)
--   sessions:  SELECT, INSERT, DELETE
-- Sin DDL, sin TRUNCATE, sin BYPASSRLS, sin acceso a otros esquemas de la app.
--
-- Modelo RLS: las tablas ya tenían RLS sin policies (nadie salvo el dueño "postgres" ve filas). Se agrega una
-- policy por tabla y operación SOLO para mgdetailing_app con USING/WITH CHECK (true): el backend es un único
-- cliente de confianza que ve todas las filas (no hay multiusuario que separar en la base); la autorización por
-- usuario la hace la API (sesión del panel). anon/authenticated siguen sin privilegios ni policies: para ellos
-- no cambia nada. Las policies son la "llave" que, junto con los GRANT, delimita qué puede hacer el rol.
--
-- El rol se crea NOLOGIN y SIN contraseña (no se versiona ningún secreto). Para habilitarlo, el dueño corre
-- `npm run clave-db` en backend/ (genera la contraseña y un ALTER ROLE ... LOGIN PASSWORD con el hash SCRAM, para
-- que la contraseña no quede en los logs de DDL de Supabase) y se conecta por el Session pooler con el usuario
-- mgdetailing_app.<project-ref>. Ver backend/README.md, "Conectar Supabase".
-- =====================================================================================================

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'mgdetailing_app') then
    create role mgdetailing_app nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end;
$$;

comment on role mgdetailing_app is
  'Backend Express de MgDetailing: DML mínimo sobre el esquema mgdetailing. Sin DDL ni BYPASSRLS.';

-- Topes por sesión: una consulta trabada o una transacción abierta no retienen conexiones del pooler.
alter role mgdetailing_app set statement_timeout = '10s';
alter role mgdetailing_app set idle_in_transaction_session_timeout = '30s';
alter role mgdetailing_app set lock_timeout = '5s';

grant usage on schema mgdetailing to mgdetailing_app;

grant select on mgdetailing.servicios to mgdetailing_app;
grant select, insert, delete on mgdetailing.bookings to mgdetailing_app;
grant update (estado, updated_at) on mgdetailing.bookings to mgdetailing_app;
grant select, insert on mgdetailing.admins to mgdetailing_app;
grant update (password_hash, updated_at) on mgdetailing.admins to mgdetailing_app;
grant select, insert, delete on mgdetailing.sessions to mgdetailing_app;

create policy servicios_app_select on mgdetailing.servicios
  for select to mgdetailing_app using (true);

create policy bookings_app_select on mgdetailing.bookings
  for select to mgdetailing_app using (true);
create policy bookings_app_insert on mgdetailing.bookings
  for insert to mgdetailing_app with check (true);
create policy bookings_app_update on mgdetailing.bookings
  for update to mgdetailing_app using (true) with check (true);
create policy bookings_app_delete on mgdetailing.bookings
  for delete to mgdetailing_app using (true);

create policy admins_app_select on mgdetailing.admins
  for select to mgdetailing_app using (true);
create policy admins_app_insert on mgdetailing.admins
  for insert to mgdetailing_app with check (true);
create policy admins_app_update on mgdetailing.admins
  for update to mgdetailing_app using (true) with check (true);

create policy sessions_app_select on mgdetailing.sessions
  for select to mgdetailing_app using (true);
create policy sessions_app_insert on mgdetailing.sessions
  for insert to mgdetailing_app with check (true);
create policy sessions_app_delete on mgdetailing.sessions
  for delete to mgdetailing_app using (true);
