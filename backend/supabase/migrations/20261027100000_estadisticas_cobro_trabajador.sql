-- =====================================================================================================
-- Estadísticas del taller, cobro por trabajo y permisos por rol
-- (contrato: reportes/2026-10-26_15_estadisticas-y-permisos.md).
--
--  - bookings.monto integer null: cuánto se cobró por el trabajo, en pesos enteros (0 a 99.999.999, el mismo tope
--    que el precio "desde" del catálogo). Null = no se cargó.
--  - bookings.trabajador_id uuid null -> perfiles(id) ON DELETE SET NULL: quién hizo el trabajo. Si la persona se
--    borra (se borra su usuario de Auth, y el perfil en cascada), el turno queda "sin asignar" y no se pierde.
--  - CHECK bookings_cobro_solo_completado: monto y trabajador_id solo pueden tener valor si el turno está
--    completado. El backend los limpia al sacar un turno de "completado"; el CHECK es la red de seguridad.
--  - Los turnos que ya estaban completados quedan con monto y trabajador en null ("sin cobro cargado").
--
-- updated_at es el "actualizado el" que ve el cliente en la página de seguimiento. Cargar o corregir el cobro no es
-- un cambio del turno para el cliente: el trigger de updated_at (que ya se salteaba cuando cambia
-- recordatorio_enviado_at) tampoco corre cuando la sentencia cambia monto o trabajador_id. Cambiar el estado sigue
-- actualizándolo: el backend manda su propio updated_at en esas escrituras, y una edición manual que cambie solo
-- otras columnas (por ejemplo, el estado, desde el panel de Supabase) sigue pasando por el trigger como siempre.
-- Borrar a la persona (ON DELETE SET NULL) cambia trabajador_id: tampoco mueve updated_at.
--
-- Índices:
--  - bookings_trabajador_id_idx (parcial): lo usan el ON DELETE SET NULL y "los trabajos de esta persona".
--  - bookings_fecha_agenda_estado_idx: las estadísticas agrupan por fecha de agenda y estado, contando TAMBIÉN los
--    cancelados (la tasa de cancelación), que bookings_agenda_idx deja afuera (es parcial: estado <> 'cancelado').
--
-- Seguridad, mismo modelo que rol_app_minimo_privilegio: GRANT UPDATE por columna a mgdetailing_app. La policy de
-- UPDATE de bookings ya existe. Las columnas nuevas son nullable y sin default: no reescriben la tabla.
--
-- Además se actualizan los textos de mgdetailing.roles.descripcion para que digan lo mismo que la matriz de
-- permisos (domain/permisos.ts, CAPACIDADES).
--
-- No se aplica a Supabase remoto sin pasar las pruebas.
-- =====================================================================================================

alter table mgdetailing.bookings
  add column monto integer
    constraint bookings_monto_rango check (monto between 0 and 99999999),
  add column trabajador_id uuid
    constraint bookings_trabajador_id_fkey references mgdetailing.perfiles (id) on update restrict on delete set null;

alter table mgdetailing.bookings
  add constraint bookings_cobro_solo_completado
    check (estado = 'completado' or (monto is null and trabajador_id is null));

comment on column mgdetailing.bookings.monto is
  'Pesos cobrados por el trabajo (0 a 99.999.999). Solo en turnos completados; null = sin cobro cargado. Nunca se muestra al empleado.';
comment on column mgdetailing.bookings.trabajador_id is
  'Quién hizo el trabajo (perfiles.id). Solo en turnos completados; null = sin asignar (o la persona se borró).';

create index bookings_trabajador_id_idx on mgdetailing.bookings (trabajador_id) where trabajador_id is not null;

-- Estadísticas: WHERE coalesce(fecha_confirmada, fecha_preferida) BETWEEN $1 AND $2 [AND estado = ...]
create index bookings_fecha_agenda_estado_idx on mgdetailing.bookings (
  (coalesce(fecha_confirmada, fecha_preferida)),
  estado
);

-- El trigger de updated_at no corre si la sentencia cambia recordatorio_enviado_at, monto o trabajador_id.
drop trigger bookings_set_updated_at on mgdetailing.bookings;
create trigger bookings_set_updated_at
  before update on mgdetailing.bookings
  for each row
  when (
    old.recordatorio_enviado_at is not distinct from new.recordatorio_enviado_at
    and old.monto is not distinct from new.monto
    and old.trabajador_id is not distinct from new.trabajador_id
  )
  execute function mgdetailing.set_updated_at();

grant update (monto, trabajador_id) on mgdetailing.bookings to mgdetailing_app;

-- -----------------------------------------------------------------------------------------------------
-- Descripciones de los roles (coherentes con la matriz de permisos)
-- -----------------------------------------------------------------------------------------------------
update mgdetailing.roles set descripcion =
  'Puede todo lo del administrador y, además, gestionar usuarios: alta, baja, rol y acceso al panel.'
  where id = 'superadmin';

update mgdetailing.roles set descripcion =
  'Gestiona turnos (estado, fecha, borrar), carga y corrige el cobro de cada trabajo, edita catálogo y disponibilidad y ve las estadísticas con importes. No gestiona usuarios.'
  where id = 'admin';

update mgdetailing.roles set descripcion =
  'Ve turnos y agenda, escribe notas y marca turnos como completados (queda como quien lo hizo, sin cargar el monto). Ve sus propios trabajos, sin importes. No borra, cancela, confirma ni reprograma.'
  where id = 'empleado';
