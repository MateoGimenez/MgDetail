-- =====================================================================================================
-- El trigger "nunca sin superadmin activo" pasa a SECURITY DEFINER (en mgdetailing_private).
--
-- Problema: mgdetailing.impedir_sin_superadmin() era SECURITY INVOKER. Cuando Supabase Auth borra un usuario
-- (API admin o Authentication > Users > Delete), el perfil se borra en cascada y el trigger AFTER DELETE corre con
-- el rol de Auth (supabase_auth_admin), que no tiene USAGE sobre mgdetailing: el borrado de CUALQUIER superadmin
-- activo fallaba con "permission denied for schema mgdetailing" (SQLSTATE 42501), aunque quedaran otros.
--
-- Arreglo: la misma lógica, SECURITY DEFINER (corre como su dueño, postgres) con search_path vacío, en el esquema
-- NO expuesto mgdetailing_private y sin EXECUTE para nadie (un trigger no necesita EXECUTE para dispararse).
-- Solo lee perfiles y toma un advisory lock: no devuelve datos ni recibe argumentos del llamador.
-- =====================================================================================================

create function mgdetailing_private.impedir_sin_superadmin()
returns trigger
language plpgsql
security definer
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

comment on function mgdetailing_private.impedir_sin_superadmin() is
  'Trigger AFTER UPDATE / DELETE de perfiles: rechaza (SQLSTATE MG001) dejar el sistema sin superadmin activo. '
  'SECURITY DEFINER: también corre cuando el borrado viene de Supabase Auth (supabase_auth_admin).';

revoke all on function mgdetailing_private.impedir_sin_superadmin() from public, anon, authenticated, service_role;

drop trigger perfiles_al_menos_un_superadmin on mgdetailing.perfiles;
create trigger perfiles_al_menos_un_superadmin
  after update of rol_id, activo on mgdetailing.perfiles
  for each row
  when (old.rol_id = 'superadmin' and old.activo and not (new.rol_id = 'superadmin' and new.activo))
  execute function mgdetailing_private.impedir_sin_superadmin();

drop trigger perfiles_al_menos_un_superadmin_al_borrar on mgdetailing.perfiles;
create trigger perfiles_al_menos_un_superadmin_al_borrar
  after delete on mgdetailing.perfiles
  for each row
  when (old.rol_id = 'superadmin' and old.activo)
  execute function mgdetailing_private.impedir_sin_superadmin();

drop function mgdetailing.impedir_sin_superadmin();
