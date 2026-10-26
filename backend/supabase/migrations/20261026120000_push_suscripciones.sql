-- =====================================================================================================
-- Avisos push al celular cuando entra un turno nuevo
-- (contrato: reportes/2026-10-26_13_panel-pulido-y-app.md, bloque A).
--
--  - mgdetailing.push_suscripciones: un dispositivo (navegador) de una persona del panel que activó los avisos.
--    `endpoint`, `p256dh` y `auth` son los tres datos de PushSubscription.toJSON(): el endpoint es una URL del
--    servicio de push del navegador (FCM, Mozilla, Windows, Apple); p256dh y auth son las claves con las que se
--    cifra el aviso para ESE navegador. Son secretos de capacidad (quien los tiene puede mandarle avisos a ese
--    dispositivo): por eso la tabla no tiene ningún privilegio para anon, authenticated ni service_role.
--  - `perfil_id` -> perfiles(id) ON DELETE CASCADE: al borrar a la persona (o su usuario de Auth) se van sus
--    dispositivos. El envío además filtra por perfiles.activo: un usuario desactivado deja de recibir al instante.
--  - `endpoint` único: un mismo aparato no puede estar dos veces. Si otra persona inicia sesión en ese aparato y
--    activa los avisos, la API borra la fila vieja y crea la nueva (no se necesita UPDATE de perfil_id).
--  - CHECK de formato en la base como segunda línea de defensa (la API valida con zod): endpoint https de hasta 2048,
--    claves en base64url, agente de hasta 120.
--
-- Seguridad, mismo modelo que rol_app_minimo_privilegio: RLS habilitado, sin policies ni privilegios para anon,
-- authenticated ni service_role; GRANT mínimo a mgdetailing_app con su policy USING/WITH CHECK (true):
--   SELECT, INSERT (sin id ni created_at: los pone la base), DELETE y UPDATE solo de ultimo_aviso_at.
-- El alta serializa las altas de la misma persona con pg_advisory_xact_lock(7340004, hashtext(perfil_id)) (funciones
-- de pg_catalog: no necesitan GRANT), para que el tope de 10 dispositivos no se pase con dos altas simultáneas. 7340001, 7340002 y 7340003 ya los usan el trigger de superadmin, el catálogo y las altas por fecha.
--
-- Tabla nueva y vacía: no hay nada que reescribir. No se aplica a Supabase remoto sin pasar las pruebas.
-- =====================================================================================================

create table mgdetailing.push_suscripciones (
  id               uuid        primary key default gen_random_uuid(),
  perfil_id        uuid        not null references mgdetailing.perfiles (id) on delete cascade,
  endpoint         text        not null
                               constraint push_suscripciones_endpoint_largo check (char_length(endpoint) between 12 and 2048)
                               constraint push_suscripciones_endpoint_https check (endpoint ~ '^https://[^[:space:]]+$'),
  p256dh           text        not null
                               constraint push_suscripciones_p256dh_formato check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth             text        not null
                               constraint push_suscripciones_auth_formato check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  agente           text
                               constraint push_suscripciones_agente_largo check (char_length(agente) between 1 and 120),
  created_at       timestamptz not null default now(),
  ultimo_aviso_at  timestamptz,
  constraint push_suscripciones_endpoint_unico unique (endpoint)
);

comment on table mgdetailing.push_suscripciones is
  'Dispositivos de las personas del panel que activaron los avisos push de turnos nuevos. Secretos de capacidad: sin acceso para anon, authenticated ni service_role.';
comment on column mgdetailing.push_suscripciones.agente is
  'Navegador/dispositivo corto, solo para que la persona reconozca el aparato.';
comment on column mgdetailing.push_suscripciones.ultimo_aviso_at is
  'Cuándo se le entregó el último aviso. Null = ninguno todavía.';

-- La FK perfil_id (borrado en cascada y "los dispositivos de este usuario") y el tope de 10 por usuario.
create index push_suscripciones_perfil_idx on mgdetailing.push_suscripciones (perfil_id, created_at);

-- -----------------------------------------------------------------------------------------------------
-- Seguridad
-- -----------------------------------------------------------------------------------------------------
alter table mgdetailing.push_suscripciones enable row level security;

-- Las default privileges del esquema ya lo revocan; se repite explícito (defensa en profundidad).
revoke all on mgdetailing.push_suscripciones from public, anon, authenticated, service_role;

grant select, delete on mgdetailing.push_suscripciones to mgdetailing_app;
grant insert (perfil_id, endpoint, p256dh, auth, agente) on mgdetailing.push_suscripciones to mgdetailing_app;
grant update (ultimo_aviso_at) on mgdetailing.push_suscripciones to mgdetailing_app;

create policy push_suscripciones_app_select on mgdetailing.push_suscripciones
  for select to mgdetailing_app using (true);
create policy push_suscripciones_app_insert on mgdetailing.push_suscripciones
  for insert to mgdetailing_app with check (true);
create policy push_suscripciones_app_update on mgdetailing.push_suscripciones
  for update to mgdetailing_app using (true) with check (true);
create policy push_suscripciones_app_delete on mgdetailing.push_suscripciones
  for delete to mgdetailing_app using (true);
