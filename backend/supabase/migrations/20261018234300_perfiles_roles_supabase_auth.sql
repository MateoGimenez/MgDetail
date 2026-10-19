-- =====================================================================================================
-- Usuarios del panel con Supabase Auth: roles y perfiles.
--
-- El login propio (admins + scrypt + sessions + JWT propio) se reemplaza por Supabase Auth. El backend hace de
-- BFF: llama a /auth/v1/token, verifica el access token contra el JWKS del proyecto y en CADA request carga el
-- perfil (rol y activo) desde esta tabla. Así desactivar a alguien o cambiarle el rol tiene efecto inmediato.
--
--  - mgdetailing.roles:    catálogo fijo (superadmin, admin, empleado). mgdetailing_app solo lo lee.
--  - mgdetailing.perfiles: uno por usuario de auth.users (FK con ON DELETE CASCADE). Lo crea un trigger sobre
--    auth.users: los usuarios NUEVOS nacen como empleado y INACTIVOS (nadie entra hasta que un superadmin lo
--    active; defensa en profundidad si quedara abierto el registro público). email es una copia para listar:
--    mgdetailing_app no puede leer auth.users.
--  - mgdetailing_private: esquema NO expuesto por la Data API para las funciones SECURITY DEFINER (el trigger de
--    auth.users y la verificación de sesión contra auth.sessions). Sin USAGE para anon/authenticated/service_role.
--  - Nunca queda el sistema sin un superadmin activo: lo garantiza un trigger con un advisory lock (dos
--    transacciones que degradan a los dos últimos superadmins a la vez no pueden pasar las dos).
-- =====================================================================================================

-- -----------------------------------------------------------------------------------------------------
-- Esquema privado para funciones privilegiadas
-- -----------------------------------------------------------------------------------------------------
create schema if not exists mgdetailing_private;
comment on schema mgdetailing_private is
  'MgDetailing: funciones SECURITY DEFINER (trigger de auth.users, verificación de sesión). No se expone por la Data API.';

revoke all on schema mgdetailing_private from public, anon, authenticated, service_role;
alter default privileges in schema mgdetailing_private revoke all on functions from public, anon, authenticated, service_role;
alter default privileges in schema mgdetailing_private revoke all on tables    from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------------------------------
-- roles
-- -----------------------------------------------------------------------------------------------------
create table mgdetailing.roles (
  id          text primary key
              constraint roles_id_slug check (id ~ '^[a-z]+(_[a-z]+)*$' and char_length(id) <= 32),
  nombre      text not null
              constraint roles_nombre_largo check (char_length(btrim(nombre)) between 1 and 40),
  descripcion text not null
              constraint roles_descripcion_largo check (char_length(descripcion) <= 300),
  created_at  timestamptz not null default now()
);

comment on table mgdetailing.roles is 'Roles del panel. Los permisos de cada rol los aplica el backend (domain/permisos.ts).';

insert into mgdetailing.roles (id, nombre, descripcion)
values
  ('superadmin', 'Superadministrador',
   'Todo lo del administrador, más gestionar usuarios desde el panel (listar, cambiar rol, activar o desactivar).'),
  ('admin', 'Administrador',
   'Ver turnos, cambiar cualquier estado (confirmar, cancelar, completar) y borrar turnos.'),
  ('empleado', 'Empleado',
   'Ver turnos y marcarlos como completados. No borra, no cancela, no confirma.')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------------------------------
-- perfiles
-- -----------------------------------------------------------------------------------------------------
create table mgdetailing.perfiles (
  id         uuid primary key
             constraint perfiles_id_fkey references auth.users (id) on delete cascade,
  email      text
             constraint perfiles_email_minusculas check (email = lower(email) and char_length(email) between 3 and 254),
  nombre     text
             constraint perfiles_nombre_largo check (char_length(btrim(nombre)) between 1 and 80),
  rol_id     text not null default 'empleado'
             constraint perfiles_rol_id_fkey references mgdetailing.roles (id) on update restrict on delete restrict,
  activo     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table mgdetailing.perfiles is
  'Un perfil por usuario de Supabase Auth: rol y si puede entrar al panel. Lo crea el trigger de auth.users.';
comment on column mgdetailing.perfiles.email is 'Copia de auth.users.email (en minúsculas) para listar; la mantiene el trigger.';
comment on column mgdetailing.perfiles.activo is 'false = no puede entrar al panel. Los usuarios nuevos nacen inactivos.';

-- Índice de la FK a roles (y de los "¿queda algún superadmin?" del trigger de abajo).
create index perfiles_rol_id_idx on mgdetailing.perfiles (rol_id);

create trigger perfiles_set_updated_at
  before update on mgdetailing.perfiles
  for each row execute function mgdetailing.set_updated_at();

-- -----------------------------------------------------------------------------------------------------
-- Nunca sin superadmin activo
-- Se dispara solo cuando una fila DEJA de ser superadmin activo. El advisory lock serializa esas transacciones:
-- la segunda espera a que la primera confirme y, como en READ COMMITTED cada sentencia de plpgsql toma una
-- foto nueva, ve el cambio de la otra y falla. SECURITY INVOKER: corre con los permisos de quien actualiza.
-- -----------------------------------------------------------------------------------------------------
create function mgdetailing.impedir_sin_superadmin()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(7340001);
  if not exists (
    select 1 from mgdetailing.perfiles where rol_id = 'superadmin' and activo
  ) then
    raise exception using
      errcode = 'MG001',
      message = 'No se puede dejar el sistema sin ningún superadmin activo.';
  end if;
  return null;
end;
$$;

comment on function mgdetailing.impedir_sin_superadmin() is
  'Trigger AFTER UPDATE / DELETE de perfiles: rechaza (SQLSTATE MG001) dejar el sistema sin superadmin activo.';

create trigger perfiles_al_menos_un_superadmin
  after update of rol_id, activo on mgdetailing.perfiles
  for each row
  when (old.rol_id = 'superadmin' and old.activo and not (new.rol_id = 'superadmin' and new.activo))
  execute function mgdetailing.impedir_sin_superadmin();

-- También al BORRAR: borrar en Supabase (Authentication > Users > Delete) al último superadmin activo borra su
-- perfil en cascada y dejaría el panel sin nadie que gestione usuarios. El borrado del usuario de Auth falla con
-- este error: primero hay que dar el rol de superadmin a otro usuario activo.
create trigger perfiles_al_menos_un_superadmin_al_borrar
  after delete on mgdetailing.perfiles
  for each row
  when (old.rol_id = 'superadmin' and old.activo)
  execute function mgdetailing.impedir_sin_superadmin();

-- -----------------------------------------------------------------------------------------------------
-- Trigger sobre auth.users: crea o actualiza el perfil
-- Patrón recomendado por Supabase: función SECURITY DEFINER (el rol de Auth, supabase_auth_admin, no tiene
-- permisos fuera del esquema auth) con search_path vacío, en un esquema NO expuesto. Solo copia el email:
-- no lee raw_user_meta_data (lo edita el propio usuario) y NUNCA toca rol ni activo de un perfil existente.
-- -----------------------------------------------------------------------------------------------------
create function mgdetailing_private.sincronizar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into mgdetailing.perfiles (id, email)
    values (new.id, lower(new.email))
    on conflict (id) do update set email = excluded.email;
  elsif new.email is distinct from old.email then
    update mgdetailing.perfiles set email = lower(new.email) where id = new.id;
  end if;
  return null;
end;
$$;

comment on function mgdetailing_private.sincronizar_perfil() is
  'Trigger AFTER INSERT / UPDATE OF email de auth.users: crea el perfil (empleado, inactivo) o copia el email nuevo.';

revoke all on function mgdetailing_private.sincronizar_perfil() from public, anon, authenticated, service_role;

drop trigger if exists mgdetailing_sincronizar_perfil on auth.users;
create trigger mgdetailing_sincronizar_perfil
  after insert or update of email on auth.users
  for each row execute function mgdetailing_private.sincronizar_perfil();

-- Usuarios que ya existieran antes de esta migración: perfil inactivo (hay que activarlos a mano).
insert into mgdetailing.perfiles (id, email)
select u.id, lower(u.email) from auth.users as u
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------------------------------
-- Verificación de sesión contra auth.sessions
-- El access token de Supabase vale hasta su exp aunque el usuario cierre sesión. Esta función le permite al
-- backend comprobar en cada request que la sesión (claim session_id) siga existiendo: logout, "cerrar todas
-- las sesiones" o borrar el usuario desde el panel de Supabase cortan el acceso en el request siguiente.
-- SECURITY DEFINER porque mgdetailing_app no tiene (ni debe tener) acceso al esquema auth; devuelve solo un
-- booleano. No usa auth.uid(): la llama el backend con su propio rol, no un usuario por la Data API.
-- p_max_age_seconds: tope ABSOLUTO de la sesión desde el login (auth.sessions.created_at). En el plan Free de
-- Supabase el refresh token no vence y la sesión se renovaría para siempre; el backend corta a las N horas del
-- login (SESSION_MAX_AGE en el código) y obliga a ingresar de nuevo.
-- -----------------------------------------------------------------------------------------------------
create function mgdetailing_private.sesion_vigente(p_session_id uuid, p_user_id uuid, p_max_age_seconds integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions as s
    where s.id = p_session_id
      and s.user_id = p_user_id
      and (s.not_after is null or s.not_after > now())
      and p_max_age_seconds > 0
      and s.created_at > now() - make_interval(secs => p_max_age_seconds)
  );
$$;

comment on function mgdetailing_private.sesion_vigente(uuid, uuid, integer) is
  'true si la sesión de Supabase Auth (session_id del JWT) sigue vigente para ese usuario y no superó el tope '
  'absoluto desde el login. Solo para mgdetailing_app.';

revoke all on function mgdetailing_private.sesion_vigente(uuid, uuid, integer) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------------------------------
-- RLS + privilegios (mismo modelo que las otras tablas: policies solo para mgdetailing_app)
-- -----------------------------------------------------------------------------------------------------
alter table mgdetailing.roles    enable row level security;
alter table mgdetailing.perfiles enable row level security;

revoke all on mgdetailing.roles, mgdetailing.perfiles from public, anon, authenticated, service_role;
revoke all on function mgdetailing.impedir_sin_superadmin() from public, anon, authenticated, service_role;

grant select on mgdetailing.roles to mgdetailing_app;
grant select on mgdetailing.perfiles to mgdetailing_app;
-- Sin INSERT ni DELETE: los perfiles los crea el trigger y se borran en cascada con el usuario de Auth.
grant update (rol_id, activo, nombre, updated_at) on mgdetailing.perfiles to mgdetailing_app;

grant usage on schema mgdetailing_private to mgdetailing_app;
grant execute on function mgdetailing_private.sesion_vigente(uuid, uuid, integer) to mgdetailing_app;

create policy roles_app_select on mgdetailing.roles
  for select to mgdetailing_app using (true);

create policy perfiles_app_select on mgdetailing.perfiles
  for select to mgdetailing_app using (true);
create policy perfiles_app_update on mgdetailing.perfiles
  for update to mgdetailing_app using (true) with check (true);
