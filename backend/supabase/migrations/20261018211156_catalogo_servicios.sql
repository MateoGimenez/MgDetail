-- =====================================================================================================
-- Catálogo inicial de servicios (datos de referencia: bookings.servicio_id tiene FK a esta tabla).
--
-- ids y nombres: los de backend/src/domain/servicios.ts (la validación del backend sigue usando esa lista).
-- duracion_estimada: la propuesta del frontend (frontend/src/data/servicios.ts), TODAVÍA SIN CONFIRMAR por
-- el dueño. precio_desde: null = "Consultá" (igual que hoy en la web).
--
-- Idempotente: si el servicio ya existe no se toca (el dueño puede haber editado precio o duración).
-- =====================================================================================================

insert into mgdetailing.servicios (id, nombre, duracion_estimada, precio_desde, activo, orden)
values
  ('lavado-basico',        'Lavado Básico',           '1 a 1,5 h',          null, true, 10),
  ('lavado-premium',       'Lavado Premium',          '3 a 4 h',            null, true, 20),
  ('pulido',               'Pulido',                  'Alrededor de 1 día', null, true, 30),
  ('encerado',             'Encerado',                '2 a 3 h',            null, true, 40),
  ('restauracion-opticas', 'Restauración de ópticas', '1,5 a 2 h',          null, true, 50)
on conflict (id) do nothing;
