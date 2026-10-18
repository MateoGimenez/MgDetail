-- =====================================================================================================
-- Endurecimiento de public.rls_auto_enable() (función de Supabase que ya venía en el proyecto).
--
-- Es la función del event trigger "ensure_rls" (habilita RLS solo en tablas nuevas de public). Es SECURITY
-- DEFINER y, por los privilegios por defecto de public, anon/authenticated tenían EXECUTE: el linter de
-- Supabase lo marca (0028/0029). Una función de event trigger no se puede invocar por RPC, pero igual se
-- revoca: nadie necesita ejecutarla a mano y el event trigger sigue funcionando (Postgres no verifica EXECUTE
-- al disparar triggers). Va condicionado porque fuera de Supabase (tests con PGlite) la función no existe.
-- =====================================================================================================

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
  end if;
end;
$$;
