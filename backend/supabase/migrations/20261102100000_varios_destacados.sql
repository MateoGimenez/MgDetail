-- =====================================================================================================
-- Varios servicios destacados a la vez.
--
-- Hasta ahora el índice único parcial servicios_un_destacado (migración 20261022200000_catalogo_editable)
-- permitía a lo sumo un servicio destacado y el backend desmarcaba al anterior. Desde esta migración se pueden
-- destacar varios: el índice se elimina y destacar uno no toca a los demás.
--
-- Se mantiene el CHECK servicios_destacado_activo: un servicio inactivo no puede ser destacado.
--
-- Compatible hacia atrás (el sistema ya está en producción):
--  - Solo se elimina un índice (no cambia ninguna fila, columna, policy ni GRANT).
--  - El backend viejo sigue andando: sigue desmarcando al anterior antes de destacar, así que nunca choca.
--
-- No se aplica a Supabase remoto sin aprobación del dueño.
-- =====================================================================================================

drop index if exists mgdetailing.servicios_un_destacado;

comment on column mgdetailing.servicios.destacado is
  'true = se resalta en la landing. Puede haber varios a la vez; un servicio inactivo no puede ser destacado (CHECK servicios_destacado_activo).';
