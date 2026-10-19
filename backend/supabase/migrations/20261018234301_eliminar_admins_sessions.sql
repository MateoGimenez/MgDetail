-- =====================================================================================================
-- Elimina el login propio: tablas admins (email + hash scrypt) y sessions (allowlist de JWT propios).
--
-- El panel ahora usa Supabase Auth (migración perfiles_roles_supabase_auth): las credenciales viven en
-- auth.users y las sesiones en auth.sessions. Al momento de aplicar, las dos tablas estaban vacías.
-- DROP TABLE se lleva también sus índices, triggers (admins_set_updated_at), policies (admins_app_*,
-- sessions_app_*) y los GRANT a mgdetailing_app. La FK sessions -> admins obliga a borrar sessions primero.
-- =====================================================================================================

drop table if exists mgdetailing.sessions;
drop table if exists mgdetailing.admins;
