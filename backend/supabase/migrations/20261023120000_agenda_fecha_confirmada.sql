-- =====================================================================================================
-- Agenda de turnos: fecha y franja confirmadas (contrato: reportes/2026-10-22_08_agenda.md).
--
-- El taller suele confirmar un día distinto al que pidió el cliente. El pedido original (fecha_preferida, franja)
-- nunca se pisa: lo confirmado va en dos columnas nuevas, nullable. "Fecha de agenda" de un turno =
-- coalesce(fecha_confirmada, fecha_preferida); lo mismo para la franja.
--
--  - fecha_confirmada date null y franja_confirmada text null ('manana' | 'tarde'). Van juntas: las dos null
--    (se confirmó, o se confirmará, para lo que pidió el cliente) o las dos con valor (CHECK
--    bookings_confirmada_juntas). El rango permitido (hoy a hoy + 120 días, hora de La Rioja) depende de "hoy":
--    lo valida la API (un CHECK no puede depender de la fecha actual, y un turno viejo conserva la suya).
--  - Índice parcial para GET /api/admin/agenda: por fecha de agenda, franja de agenda y orden de llegada (seq),
--    solo los no cancelados (la agenda no los muestra). La consulta usa exactamente estas expresiones y el mismo
--    predicado (estado <> 'cancelado') para que el planner pueda usarlo.
--  - mgdetailing_app gana UPDATE de estas dos columnas (y nada más). La policy bookings_app_update ya existe.
--
-- Agregar columnas nullable sin default no reescribe la tabla (solo catálogo). Los CHECK validan las filas
-- existentes, que tienen las dos columnas en null: pasan sin costo. La tabla es chica: el índice se crea en la
-- misma transacción de la migración (sin CONCURRENTLY).
--
-- No se aplica a Supabase remoto sin pasar las pruebas.
-- =====================================================================================================

alter table mgdetailing.bookings
  add column fecha_confirmada  date,
  add column franja_confirmada text
                               constraint bookings_franja_confirmada_valida
                                 check (franja_confirmada in ('manana', 'tarde'));

alter table mgdetailing.bookings
  add constraint bookings_confirmada_juntas
    check ((fecha_confirmada is null) = (franja_confirmada is null));

comment on column mgdetailing.bookings.fecha_confirmada is
  'Fecha que confirmó el taller si es distinta de la pedida. Null = la pedida (fecha_preferida). Va con franja_confirmada.';
comment on column mgdetailing.bookings.franja_confirmada is
  'Franja confirmada (manana | tarde). Null = la pedida (franja). Va con fecha_confirmada.';

-- Agenda: WHERE estado <> 'cancelado' AND coalesce(fecha_confirmada, fecha_preferida) BETWEEN $1 AND $2
--         ORDER BY coalesce(fecha_confirmada, fecha_preferida), coalesce(franja_confirmada, franja), seq
-- 'manana' < 'tarde' en cualquier collation (texto ASCII en minúsculas): el orden del índice es el del contrato.
create index bookings_agenda_idx on mgdetailing.bookings (
  (coalesce(fecha_confirmada, fecha_preferida)),
  (coalesce(franja_confirmada, franja)),
  seq
) where estado <> 'cancelado';

-- Mismo modelo que rol_app_minimo_privilegio: GRANT por columna. Con esto el rol puede actualizar estado,
-- updated_at, fecha_confirmada y franja_confirmada; nunca los datos del cliente ni el pedido original.
grant update (fecha_confirmada, franja_confirmada) on mgdetailing.bookings to mgdetailing_app;
