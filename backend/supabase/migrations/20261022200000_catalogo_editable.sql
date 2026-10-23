-- =====================================================================================================
-- Catálogo de servicios editable desde el panel (contrato: reportes/2026-10-22_07_catalogo-editable.md).
--
-- Hasta ahora los textos de cada servicio vivían en frontend/src/data/servicios.ts y los ids válidos en
-- backend/src/domain/servicios.ts; mgdetailing.servicios solo aportaba la integridad (FK desde bookings). Desde
-- esta migración la tabla es LA fuente de verdad: el dueño edita textos, precios y duraciones, crea servicios,
-- los activa o desactiva y los ordena desde /admin. POST /api/bookings acepta solo servicios existentes y activos.
--
--  - Columnas nuevas: resumen, descripcion, incluye (jsonb, lista de textos), glosario (jsonb, lista de
--    { termino, significado }) y destacado. Los textos actuales del frontend se copian acá (backfill).
--  - precio_desde pasa de numeric(12,2) a integer: el contrato es un entero en ARS (0 a 99.999.999) y así el
--    driver lo devuelve como número (numeric llega como texto). Hoy todos los precios son null: no se pierde nada.
--  - A lo sumo un servicio destacado: índice único parcial (el backend desmarca al anterior en la misma
--    transacción; el índice lo garantiza también ante una edición manual). Y un inactivo no puede ser el
--    destacado (CHECK servicios_destacado_activo).
--  - Los CHECK replican los topes de zod (schemas/servicios.ts) como defensa en profundidad.
--  - mgdetailing_app gana INSERT y UPDATE por columna sobre servicios (nunca UPDATE de id ni created_at), con sus
--    policies. Sigue sin DELETE: un servicio no se borra, se desactiva (hay turnos que lo referencian).
--
-- No se aplica a Supabase remoto sin aprobación del dueño.
-- =====================================================================================================

-- -----------------------------------------------------------------------------------------------------
-- Validación de las listas jsonb
-- Un CHECK no admite subconsultas: la validación de cada ítem va en funciones IMMUTABLE. CASE (y no AND) para
-- que jsonb_array_elements nunca reciba algo que no sea un array. SECURITY INVOKER y search_path vacío. Como los
-- CHECK se evalúan con los permisos de quien escribe, mgdetailing_app necesita EXECUTE.
-- -----------------------------------------------------------------------------------------------------
create function mgdetailing.servicio_incluye_valido(valor jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when pg_catalog.jsonb_typeof(valor) is distinct from 'array' then false
    when pg_catalog.jsonb_array_length(valor) > 15 then false
    else not exists (
      select 1
      from pg_catalog.jsonb_array_elements(valor) as e(item)
      where case
        when pg_catalog.jsonb_typeof(e.item) <> 'string' then true
        else pg_catalog.char_length(pg_catalog.btrim(e.item #>> '{}')) not between 1 and 120
      end
    )
  end
$$;

comment on function mgdetailing.servicio_incluye_valido(jsonb) is
  'CHECK de servicios.incluye: array de 0 a 15 textos, cada uno de 1 a 120 caracteres.';

create function mgdetailing.servicio_glosario_valido(valor jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when pg_catalog.jsonb_typeof(valor) is distinct from 'array' then false
    when pg_catalog.jsonb_array_length(valor) > 10 then false
    else not exists (
      select 1
      from pg_catalog.jsonb_array_elements(valor) as e(item)
      where case
        when pg_catalog.jsonb_typeof(e.item) <> 'object' then true
        -- Exactamente las claves termino y significado (nada más).
        when (select pg_catalog.array_agg(o.k order by o.k) from pg_catalog.jsonb_object_keys(e.item) as o(k))
             is distinct from array['significado', 'termino'] then true
        when pg_catalog.jsonb_typeof(e.item -> 'termino') <> 'string'
          or pg_catalog.jsonb_typeof(e.item -> 'significado') <> 'string' then true
        else pg_catalog.char_length(pg_catalog.btrim(e.item ->> 'termino')) not between 1 and 60
          or pg_catalog.char_length(pg_catalog.btrim(e.item ->> 'significado')) not between 1 and 300
      end
    )
  end
$$;

comment on function mgdetailing.servicio_glosario_valido(jsonb) is
  'CHECK de servicios.glosario: array de 0 a 10 { termino (1 a 60), significado (1 a 300) }.';

revoke all on function mgdetailing.servicio_incluye_valido(jsonb)  from public, anon, authenticated, service_role;
revoke all on function mgdetailing.servicio_glosario_valido(jsonb) from public, anon, authenticated, service_role;
grant execute on function mgdetailing.servicio_incluye_valido(jsonb)  to mgdetailing_app;
grant execute on function mgdetailing.servicio_glosario_valido(jsonb) to mgdetailing_app;

-- -----------------------------------------------------------------------------------------------------
-- Columnas nuevas y topes
-- resumen y descripcion nacen nullable para poder copiar los textos; más abajo pasan a NOT NULL.
-- -----------------------------------------------------------------------------------------------------
alter table mgdetailing.servicios
  add column resumen     text
                         constraint servicios_resumen_largo check (char_length(btrim(resumen)) between 1 and 200),
  add column descripcion text
                         constraint servicios_descripcion_largo check (char_length(btrim(descripcion)) between 1 and 1500),
  add column incluye     jsonb not null default '[]'::jsonb
                         constraint servicios_incluye_valido check (mgdetailing.servicio_incluye_valido(incluye)),
  add column glosario    jsonb not null default '[]'::jsonb
                         constraint servicios_glosario_valido check (mgdetailing.servicio_glosario_valido(glosario)),
  add column destacado   boolean not null default false;

alter table mgdetailing.servicios
  alter column precio_desde type integer using precio_desde::integer;

alter table mgdetailing.servicios
  add constraint servicios_precio_tope check (precio_desde <= 99999999),
  -- "" no es una duración: el backend lo guarda como null (sin confirmar).
  add constraint servicios_duracion_no_vacia check (char_length(btrim(duracion_estimada)) >= 1);

comment on table mgdetailing.servicios is
  'Catálogo de servicios del taller (fuente de verdad, editable desde el panel). id = slug estable e inmutable.';
comment on column mgdetailing.servicios.resumen is 'Una línea para la tarjeta del servicio en la landing.';
comment on column mgdetailing.servicios.descripcion is 'Descripción completa (puede tener saltos de línea).';
comment on column mgdetailing.servicios.incluye is 'jsonb: array de textos (0 a 15) con lo que incluye el servicio.';
comment on column mgdetailing.servicios.glosario is
  'jsonb: array de { termino, significado } (0 a 10) con las palabras técnicas explicadas.';
comment on column mgdetailing.servicios.destacado is
  'true = se resalta en la landing. A lo sumo uno (índice servicios_un_destacado).';
comment on column mgdetailing.servicios.precio_desde is 'Precio orientativo en ARS, entero (0 a 99.999.999). Null = "Consultá".';

-- -----------------------------------------------------------------------------------------------------
-- Backfill: los textos actuales de frontend/src/data/servicios.ts (propuesta inicial, todavía sin confirmar por
-- el dueño). Solo si la fila todavía no tiene resumen: no pisa nada que ya se haya cargado.
-- -----------------------------------------------------------------------------------------------------
update mgdetailing.servicios
set resumen     = 'El lavado bien hecho: por fuera a mano, y por dentro aspirado y vidrios.',
    descripcion = 'Lavamos la carrocería a mano, con prelavado de espuma y el método de dos baldes, para sacar la tierra sin rayar la pintura. Es el lavado de mantenimiento: ideal para tener tu vehículo limpio entre tratamientos más profundos.',
    incluye     = '["Prelavado con espuma","Lavado exterior a mano con método de dos baldes","Llantas y neumáticos","Secado con microfibra","Aspirado del interior","Vidrios por dentro y por fuera"]'::jsonb,
    glosario    = '[{"termino":"Prelavado con espuma","significado":"una espuma que ablanda la tierra para que salga sin frotar de más."},{"termino":"Método de dos baldes","significado":"un balde con shampoo y otro con agua limpia para enjuagar el guante, así la tierra no vuelve a la pintura y no la raya."}]'::jsonb,
    destacado   = false
where id = 'lavado-basico' and resumen is null;

update mgdetailing.servicios
set resumen     = 'Todo el básico, más una limpieza a fondo del interior y una capa de protección para la pintura.',
    descripcion = 'Es el lavado completo. Además del exterior a mano, limpiamos en profundidad tapizados, alfombras y plásticos, descontaminamos las llantas y dejamos una protección rápida sobre la pintura. Para cuando tu vehículo necesita una puesta a punto de verdad.',
    incluye     = '["Todo lo del Lavado Básico","Limpieza profunda de tapizados y alfombras","Limpieza y acondicionado de plásticos","Descontaminación de llantas","Protección rápida de pintura (sellador o cera en spray)"]'::jsonb,
    glosario    = '[{"termino":"Acondicionado de plásticos","significado":"un producto que limpia y nutre los plásticos para que no se resequen ni se pongan blanquecinos."},{"termino":"Descontaminación de llantas","significado":"sacar el polvo de freno que queda pegado y que con agua y shampoo no sale."},{"termino":"Sellador o cera en spray","significado":"una capa fina que da brillo y ayuda a que el agua y la tierra no se peguen tanto."}]'::jsonb,
    destacado   = true
where id = 'lavado-premium' and resumen is null;

update mgdetailing.servicios
set resumen     = 'Corrección de pintura: saca rayas finas, marcas de lavado y opacidad para devolverle el brillo.',
    descripcion = 'Primero lavamos y descontaminamos la pintura con clay bar. Después la pulimos en una o dos etapas, según cómo esté. Te decimos la verdad antes de empezar: las rayas profundas, las que llegan a la base de la pintura, no se van con un pulido.',
    incluye     = '["Descontaminación de la pintura con clay bar","Corrección de pintura en 1 o 2 etapas","Eliminación de swirls y rayas finas","Recuperación del brillo y la profundidad del color"]'::jsonb,
    glosario    = '[{"termino":"Corrección de pintura","significado":"pulir la capa de barniz para emparejarla y sacar los defectos finos de la superficie."},{"termino":"Swirls","significado":"las marcas circulares finitas que se ven con el sol; casi siempre las deja un lavado mal hecho."},{"termino":"Clay bar","significado":"una arcilla especial que saca la suciedad pegada que el lavado no saca."},{"termino":"Etapas","significado":"cada pasada con un pulimento distinto: la primera corrige y la segunda afina el brillo."}]'::jsonb,
    destacado   = false
where id = 'pulido' and resumen is null;

update mgdetailing.servicios
set resumen     = 'Brillo profundo y una capa que protege la pintura del sol y del agua.',
    descripcion = 'Lavamos y descontaminamos la pintura, y después aplicamos la cera. Deja un brillo profundo, hace que el agua resbale en gotas y suma protección contra el sol. Cuánto dura depende del uso, de si el vehículo duerme bajo techo y del clima.',
    incluye     = '["Lavado previo","Descontaminación de la pintura","Aplicación de cera","Brillo profundo y repelencia al agua","Protección UV"]'::jsonb,
    glosario    = '[{"termino":"Descontaminación","significado":"sacar la suciedad pegada (tierra, resina, polvo de freno) que el lavado común no saca."},{"termino":"Repelencia al agua","significado":"el agua forma gotitas y resbala, en lugar de quedarse pegada a la pintura."},{"termino":"Protección UV","significado":"una barrera contra los rayos del sol, que con el tiempo opacan y decoloran la pintura."}]'::jsonb,
    destacado   = false
where id = 'encerado' and resumen is null;

update mgdetailing.servicios
set resumen     = 'Faros opacos o amarillentos, otra vez claros: se ven mejor y ves mejor de noche.',
    descripcion = 'Lijamos al agua la capa dañada, pulimos hasta recuperar la transparencia y terminamos con un sellado UV para que el sol no las vuelva a castigar tan rápido. Mejora la estética y, sobre todo, la visibilidad cuando manejás de noche.',
    incluye     = '["Lijado al agua","Pulido de las ópticas","Sellado UV"]'::jsonb,
    glosario    = '[{"termino":"Lijado al agua","significado":"un lijado suave, con agua, que saca la capa amarillenta sin dañar el faro."},{"termino":"Sellado UV","significado":"una capa transparente que protege el faro del sol para que tarde más en volver a ponerse amarillo."}]'::jsonb,
    destacado   = false
where id = 'restauracion-opticas' and resumen is null;

-- Un servicio que se hubiera agregado a mano (no está en el frontend): textos mínimos para poder pasar a NOT NULL.
-- Se completan después desde el panel.
update mgdetailing.servicios set resumen = nombre where resumen is null;
update mgdetailing.servicios set descripcion = nombre where descripcion is null;

alter table mgdetailing.servicios
  alter column resumen set not null,
  alter column descripcion set not null;

-- Un servicio inactivo no puede ser el destacado (el backend lo desmarca al desactivarlo y rechaza destacar un
-- inactivo; el CHECK lo garantiza también ante una edición manual). Si el backfill destacó uno que ya estaba
-- inactivo, se desmarca antes de agregar la constraint.
update mgdetailing.servicios set destacado = false where destacado and not activo;

alter table mgdetailing.servicios
  add constraint servicios_destacado_activo check (activo or not destacado);

-- A lo sumo un destacado. Parcial: solo indexa la fila con destacado = true.
create unique index servicios_un_destacado on mgdetailing.servicios (destacado) where destacado;

-- Sin índice sobre (orden, id): el catálogo tiene un puñado de filas y un seq scan + sort es lo más barato.

-- -----------------------------------------------------------------------------------------------------
-- Privilegios de mgdetailing_app (mismo modelo que rol_app_minimo_privilegio: GRANT por columna + policy
-- USING/WITH CHECK (true) solo para este rol; la autorización por usuario la hace la API con domain/permisos.ts).
--   INSERT: todas las columnas salvo created_at (default now()). id sí: es el slug que elige el dueño al crearlo.
--   UPDATE: los campos editables, orden y updated_at. Nunca id (inmutable; además la FK de bookings es RESTRICT)
--           ni created_at.
-- SELECT ya lo tenía (lo usan el WHERE, el RETURNING y el SELECT ... FOR UPDATE).
-- Las escrituras del catálogo se serializan con pg_advisory_xact_lock (funciones de pg_catalog: no necesitan GRANT).
-- -----------------------------------------------------------------------------------------------------
grant insert (id, nombre, resumen, descripcion, incluye, glosario, duracion_estimada, precio_desde, destacado, activo,
              orden, updated_at)
  on mgdetailing.servicios to mgdetailing_app;
grant update (nombre, resumen, descripcion, incluye, glosario, duracion_estimada, precio_desde, destacado, activo,
              orden, updated_at)
  on mgdetailing.servicios to mgdetailing_app;

create policy servicios_app_insert on mgdetailing.servicios
  for insert to mgdetailing_app with check (true);
create policy servicios_app_update on mgdetailing.servicios
  for update to mgdetailing_app using (true) with check (true);
