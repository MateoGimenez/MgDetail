-- =====================================================================================================
-- MgDetailing: esquema inicial en Postgres (Supabase).
--
-- Fuente de verdad del esquema Postgres. Nunca se edita una migración ya aplicada: los cambios van en una
-- migración nueva (formato de Supabase CLI: YYYYMMDDHHMMSS_descripcion.sql).
--
-- Seguridad:
--  - Todo vive en el esquema propio "mgdetailing", que NO está en los esquemas expuestos por la Data API de
--    Supabase (PostgREST / GraphQL solo publican public y graphql_public). La web nunca habla con Supabase:
--    el único cliente es el backend Express, que se conecta con el rol "postgres" por el pooler.
--  - Defensa en profundidad: RLS habilitado en todas las tablas SIN policies (anon/authenticated no ven nada
--    aunque alguien expusiera el esquema por error) y REVOKE explícito de todo privilegio a public, anon,
--    authenticated y service_role. El backend no usa ninguno de esos roles.
--  - El rol "postgres" es el dueño de las tablas (y tiene BYPASSRLS en Supabase), así que RLS no lo afecta.
--
-- Convención de nombres (ver glosario del README): tablas y columnas en snake_case. Las tablas técnicas van
-- en inglés como el código (bookings, admins, sessions); las columnas de negocio, en español como el
-- contrato de la API (nombre, telefono, franja, estado...). "servicios" va en español porque es el catálogo
-- del negocio y coincide con domain/servicios.ts y con el campo servicioId del contrato.
-- =====================================================================================================

create schema if not exists mgdetailing;
comment on schema mgdetailing is
  'MgDetailing (taller de detailing). Solo lo usa el backend Express; no se expone por la Data API.';

revoke all on schema mgdetailing from public;

-- -----------------------------------------------------------------------------------------------------
-- updated_at automático
-- El backend manda su propio updated_at (con su reloj, el mismo que usa en las respuestas). Si una
-- actualización NO lo cambia (por ejemplo, una edición manual desde el panel de Supabase), el trigger lo
-- pone en now(). Así el valor nunca queda viejo y los tests pueden fijar el reloj.
-- -----------------------------------------------------------------------------------------------------
create or replace function mgdetailing.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

comment on function mgdetailing.set_updated_at() is
  'Trigger BEFORE UPDATE: pone updated_at = now() si la actualización no lo cambió explícitamente.';

-- -----------------------------------------------------------------------------------------------------
-- servicios: catálogo del taller
-- Hoy el backend valida servicioId contra la lista fija de domain/servicios.ts; esta tabla existe para
-- la integridad (FK desde bookings) y para el próximo paso: precios y duraciones editables desde el panel.
-- Un servicio que se deja de ofrecer se desactiva (activo = false), no se borra: los turnos viejos lo
-- siguen referenciando.
-- -----------------------------------------------------------------------------------------------------
create table mgdetailing.servicios (
  id                text primary key
                    constraint servicios_id_slug
                      check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 64),
  nombre            text not null
                    constraint servicios_nombre_largo check (char_length(btrim(nombre)) between 1 and 80),
  duracion_estimada text
                    constraint servicios_duracion_largo check (char_length(duracion_estimada) <= 60),
  precio_desde      numeric(12, 2)
                    constraint servicios_precio_no_negativo check (precio_desde >= 0),
  activo            boolean not null default true,
  orden             smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table mgdetailing.servicios is 'Catálogo de servicios del taller. id = slug estable (servicioId del contrato).';
comment on column mgdetailing.servicios.duracion_estimada is 'Texto libre ("2 a 3 horas"). Null = sin confirmar.';
comment on column mgdetailing.servicios.precio_desde is 'Precio orientativo en ARS. Null = "Consultá".';
comment on column mgdetailing.servicios.activo is 'false = ya no se ofrece (no se borra: hay turnos que lo referencian).';
comment on column mgdetailing.servicios.orden is 'Orden de presentación (menor primero).';

create trigger servicios_set_updated_at
  before update on mgdetailing.servicios
  for each row execute function mgdetailing.set_updated_at();

-- -----------------------------------------------------------------------------------------------------
-- bookings: solicitudes de turno
-- seq: clave primaria interna (bigint identity: inserciones ordenadas, índice compacto) y orden estable
--      "más nuevos primero" aunque dos turnos tengan el mismo created_at.
-- id:  UUID aleatorio, lo único que sale por la API (un id secuencial revelaría cuántos turnos hay,
--      porque el POST público lo devuelve).
-- Los valores cerrados (vehiculo_tipo, franja, estado) son text + CHECK y no enums: mismo comportamiento
-- que el esquema SQLite, se leen como string sin conversiones, y agregar o quitar un valor es un
-- ALTER de la constraint (quitar un valor de un enum de Postgres obliga a recrear el tipo).
-- Los largos replican los topes de zod (schemas/bookings.ts) como defensa en profundidad.
-- -----------------------------------------------------------------------------------------------------
create table mgdetailing.bookings (
  seq             bigint generated always as identity primary key,
  id              uuid not null default gen_random_uuid() constraint bookings_id_key unique,
  nombre          text not null
                  constraint bookings_nombre_largo check (char_length(btrim(nombre)) between 1 and 80),
  telefono        text not null
                  constraint bookings_telefono_largo check (char_length(telefono) between 8 and 20),
  email           text
                  constraint bookings_email_largo check (char_length(email) between 3 and 120),
  vehiculo_tipo   text not null
                  constraint bookings_vehiculo_tipo_valido check (vehiculo_tipo in ('auto', 'camioneta', 'moto')),
  vehiculo_modelo text
                  constraint bookings_vehiculo_modelo_largo check (char_length(vehiculo_modelo) <= 80),
  servicio_id     text not null
                  constraint bookings_servicio_id_fkey references mgdetailing.servicios (id)
                    on update restrict on delete restrict,
  fecha_preferida date not null,
  franja          text not null
                  constraint bookings_franja_valida check (franja in ('manana', 'tarde')),
  comentario      text
                  constraint bookings_comentario_largo check (char_length(comentario) <= 500),
  estado          text not null default 'pendiente'
                  constraint bookings_estado_valido
                    check (estado in ('pendiente', 'confirmado', 'completado', 'cancelado')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table mgdetailing.bookings is 'Solicitudes de turno de la landing. Datos personales: no exponer.';
comment on column mgdetailing.bookings.seq is 'Orden interno (más nuevos primero). Nunca sale por la API.';
comment on column mgdetailing.bookings.id is 'UUID aleatorio: el id público del turno.';
comment on column mgdetailing.bookings.telefono is 'Tal como lo escribió el cliente. telefonoWhatsapp se calcula al leer.';

-- Listado del panel: "WHERE estado = $1 ORDER BY seq DESC LIMIT/OFFSET" y "COUNT(*) WHERE estado = $1".
-- El listado sin filtro usa el índice de la clave primaria (seq) recorrido al revés.
create index bookings_estado_seq_idx on mgdetailing.bookings (estado, seq desc);
-- Índice de la FK: lo usa Postgres al verificar el ON DELETE/UPDATE RESTRICT sobre servicios.
create index bookings_servicio_id_idx on mgdetailing.bookings (servicio_id);

create trigger bookings_set_updated_at
  before update on mgdetailing.bookings
  for each row execute function mgdetailing.set_updated_at();

-- -----------------------------------------------------------------------------------------------------
-- admins: dueños del panel (un puñado de filas: integer alcanza y se mapea directo a number en JS)
-- El email se guarda en minúsculas (CHECK) y es único sin distinguir mayúsculas (índice único sobre
-- lower(email), que es también el que usa la búsqueda por email).
-- -----------------------------------------------------------------------------------------------------
create table mgdetailing.admins (
  id            integer generated always as identity primary key,
  email         text not null
                constraint admins_email_minusculas check (email = lower(email) and char_length(email) between 3 and 254),
  password_hash text not null
                constraint admins_password_hash_largo check (char_length(password_hash) between 20 and 512),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table mgdetailing.admins is 'Administradores del panel. password_hash: scrypt en formato PHC.';

create unique index admins_email_lower_key on mgdetailing.admins (lower(email));

create trigger admins_set_updated_at
  before update on mgdetailing.admins
  for each row execute function mgdetailing.set_updated_at();

-- -----------------------------------------------------------------------------------------------------
-- sessions: allowlist de sesiones del panel
-- El JWT es la credencial; sin fila vigente acá, el token no sirve (logout real, cambio de contraseña
-- cierra todo). Las vencidas se borran al iniciar sesión (SessionRepository.purgeExpired): con un solo
-- dueño no hace falta pg_cron.
-- -----------------------------------------------------------------------------------------------------
create table mgdetailing.sessions (
  id         uuid primary key,
  admin_id   integer not null
             constraint sessions_admin_id_fkey references mgdetailing.admins (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table mgdetailing.sessions is 'Sesiones vigentes del panel (id = jti del JWT).';

create index sessions_admin_id_idx on mgdetailing.sessions (admin_id);
create index sessions_expires_at_idx on mgdetailing.sessions (expires_at);

-- -----------------------------------------------------------------------------------------------------
-- RLS + privilegios
-- -----------------------------------------------------------------------------------------------------
alter table mgdetailing.servicios enable row level security;
alter table mgdetailing.bookings  enable row level security;
alter table mgdetailing.admins    enable row level security;
alter table mgdetailing.sessions  enable row level security;
-- Sin policies a propósito: nadie que no sea el dueño de las tablas (postgres) puede leer ni escribir filas.

revoke all on all tables    in schema mgdetailing from public, anon, authenticated, service_role;
revoke all on all sequences in schema mgdetailing from public, anon, authenticated, service_role;
revoke all on all functions in schema mgdetailing from public, anon, authenticated, service_role;
revoke all on schema mgdetailing from anon, authenticated, service_role;

-- Lo que se cree más adelante en este esquema (por el rol que corre las migraciones) tampoco hereda
-- privilegios para esos roles.
alter default privileges in schema mgdetailing revoke all on tables    from public, anon, authenticated, service_role;
alter default privileges in schema mgdetailing revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema mgdetailing revoke all on functions from public, anon, authenticated, service_role;
