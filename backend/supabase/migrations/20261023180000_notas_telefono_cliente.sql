-- =====================================================================================================
-- Notas internas, búsqueda e historial del cliente (contrato: reportes/2026-10-23_10_notas-busqueda-historial.md).
--
--  - notas_internas text null: lo que el taller anota de un turno y el cliente nunca ve. Hasta 1000 caracteres
--    (CHECK); la API además normaliza vacío/solo espacios a null y rechaza caracteres de control.
--  - telefono_whatsapp text null: el teléfono normalizado (domain/telefono.ts, libphonenumber) que identifica al
--    cliente. Lo llena el backend al crear el turno; los turnos que ya existen se completan con
--    `npm run normalizar-telefonos` (la regla vive en JavaScript, no en SQL). Null = no se pudo interpretar.
--    CHECK de formato: solo dígitos, 8 a 15 (E.164 sin "+").
--  - Índice parcial (telefono_whatsapp, seq) sin los null: lo usan el conteo de turnosDelCliente (igualdad) y el
--    historial (?cliente=, ordenado por seq). Una igualdad implica "is not null", así que el planner puede usarlo.
--  - mgdetailing.texto_busqueda(text): minúsculas y sin acentos, para la búsqueda con LIKE. Sin extensiones
--    (unaccent no viene en PGlite y no hace falta para una tabla chica): translate() de las vocales acentuadas más
--    comunes (y Ñ -> ñ, porque lower() con collation C no pasa a minúsculas lo que no es ASCII). La ñ se conserva.
--    La búsqueda es secuencial sobre una tabla chica: no se indexa (no hace falta pg_trgm).
--  - mgdetailing_app gana UPDATE de estas dos columnas y EXECUTE de la función (las default privileges del esquema
--    revocan EXECUTE a public). El INSERT ya lo tiene a nivel tabla; la policy bookings_app_update ya existe.
--
-- Columnas nullable sin default: no se reescribe la tabla. Los CHECK pasan sin costo sobre filas en null. La tabla
-- es chica: el índice se crea en la misma transacción (sin CONCURRENTLY).
--
-- No se aplica a Supabase remoto sin pasar las pruebas.
-- =====================================================================================================

alter table mgdetailing.bookings
  add column notas_internas    text
                               constraint bookings_notas_internas_largo
                                 check (char_length(notas_internas) <= 1000),
  add column telefono_whatsapp text
                               constraint bookings_telefono_whatsapp_formato
                                 check (telefono_whatsapp ~ '^[0-9]{8,15}$');

comment on column mgdetailing.bookings.notas_internas is
  'Nota interna del taller (hasta 1000 caracteres). Nunca sale por la API pública ni en los avisos. Null = sin nota.';
comment on column mgdetailing.bookings.telefono_whatsapp is
  'Teléfono normalizado (solo dígitos, internacional, sin +) que identifica al cliente. Null = no interpretable o sin normalizar.';

-- turnosDelCliente: count(*) WHERE telefono_whatsapp = $1. Historial: WHERE telefono_whatsapp = $1 ORDER BY seq DESC.
create index bookings_telefono_whatsapp_idx on mgdetailing.bookings (telefono_whatsapp, seq)
  where telefono_whatsapp is not null;

-- Normalización para la búsqueda: se aplica igual a la columna y al texto buscado (una sola regla, en SQL).
create function mgdetailing.texto_busqueda(texto text)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.lower(pg_catalog.translate(
    texto,
    'ÁÀÂÄÃáàâäãÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÇçÑ',
    'aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuuccñ'
  ));
$$;

comment on function mgdetailing.texto_busqueda(text) is
  'Minúsculas y sin acentos (vocales y ç; Ñ -> ñ) para la búsqueda del panel con LIKE. Sin extensiones.';

revoke all on function mgdetailing.texto_busqueda(text) from public, anon, authenticated, service_role;
grant execute on function mgdetailing.texto_busqueda(text) to mgdetailing_app;

-- Mismo modelo que rol_app_minimo_privilegio: GRANT por columna. Los datos del cliente siguen sin poder editarse.
grant update (notas_internas, telefono_whatsapp) on mgdetailing.bookings to mgdetailing_app;
