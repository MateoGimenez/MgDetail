-- =====================================================================================================
-- Duración estimada por tipo de vehículo.
--
-- duracion_estimada sigue siendo la duración de AUTO (no cambia su significado). Se suman duracion_estimada_camioneta
-- y duracion_estimada_moto: texto libre ("2 a 3 horas") con el mismo CHECK que la de auto (no vacío, hasta 60
-- caracteres) cuando no es null. A diferencia de los precios, null NO es "Consultá": significa "usa la de auto".
--
-- Estrictamente aditiva y compatible hacia atrás (el sistema ya está en producción):
--  - Columnas nullable, sin default y con CHECK: Postgres no reescribe la tabla ni toca las filas existentes.
--  - No se modifica ninguna columna, constraint, policy ni GRANT existente: solo se amplían los GRANT por
--    columna de mgdetailing_app (INSERT y UPDATE) con las dos columnas nuevas, igual que precio_desde_camioneta.
--  - El backend viejo sigue andando con las columnas nuevas (no las conoce y quedan en null).
--
-- No se aplica a Supabase remoto sin aprobación del dueño.
-- =====================================================================================================

alter table mgdetailing.servicios
  add column duracion_estimada_camioneta text
    constraint servicios_duracion_camioneta_valida
      check (char_length(btrim(duracion_estimada_camioneta)) between 1 and 60),
  add column duracion_estimada_moto text
    constraint servicios_duracion_moto_valida
      check (char_length(btrim(duracion_estimada_moto)) between 1 and 60);

comment on column mgdetailing.servicios.duracion_estimada is
  'Duración estimada para AUTO, texto libre (ej. "2 a 3 horas"). Null = sin confirmar.';
comment on column mgdetailing.servicios.duracion_estimada_camioneta is
  'Duración estimada para CAMIONETA, texto libre (1 a 60 caracteres). Null = usa la de auto.';
comment on column mgdetailing.servicios.duracion_estimada_moto is
  'Duración estimada para MOTO, texto libre (1 a 60 caracteres). Null = usa la de auto.';

-- Privilegios: mismo modelo que duracion_estimada (GRANT por columna; las policies servicios_app_insert y
-- servicios_app_update ya cubren toda la fila). SELECT de la tabla ya lo tenía el rol.
grant insert (duracion_estimada_camioneta, duracion_estimada_moto) on mgdetailing.servicios to mgdetailing_app;
grant update (duracion_estimada_camioneta, duracion_estimada_moto) on mgdetailing.servicios to mgdetailing_app;
