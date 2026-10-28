import type { SqlClient } from '../../db/postgres.js';
import { type Row, int, intOrNull, isoTimestamp, oneOf, oneOfOrNull, str, strOrNull } from '../../db/rows.js';
import {
  type ActualizacionTurno,
  type Booking,
  type BookingRepository,
  type CandidatoRecordatorio,
  type Estado,
  type ListBookingsOptions,
  type NewBooking,
  type Reprogramacion,
  type SeguimientoTurno,
  ESTADOS,
  FRANJAS,
  MIN_DIGITOS_BUSQUEDA,
  type Trabajador,
  TurnoCerradoError,
  VEHICULO_TIPOS,
} from '../../domain/booking.js';
import { TurnoConComprobanteError } from '../../domain/comprobantes.js';
import { verificarLugar } from '../../domain/disponibilidad.js';
import { telefonoWhatsapp } from '../../domain/telefono.js';
import { cuposEntre } from './disponibilidad.js';
import { isUuid } from './uuid.js';

/** Quién hizo el trabajo: el nombre de la persona o, si no tiene, su email (calculado en la consulta). */
function toTrabajador(row: Row): Trabajador | null {
  const id = strOrNull(row, 'trabajador_id');
  return id === null ? null : { id, nombre: str(row, 'trabajador_nombre') };
}

function toBooking(row: Row): Booking {
  const telefono = str(row, 'telefono');
  return {
    id: str(row, 'id'),
    nombre: str(row, 'nombre'),
    telefono,
    // La columna se llena al crear el turno. Un turno viejo que todavía no pasó por `npm run normalizar-telefonos`
    // la tiene en null: se calcula al leer, como antes, para que no cambie de comportamiento.
    telefonoWhatsapp: strOrNull(row, 'telefono_whatsapp') ?? telefonoWhatsapp(telefono),
    email: strOrNull(row, 'email'),
    vehiculoTipo: oneOf(VEHICULO_TIPOS, row, 'vehiculo_tipo'),
    vehiculoModelo: strOrNull(row, 'vehiculo_modelo'),
    servicioId: str(row, 'servicio_id'),
    fechaPreferida: str(row, 'fecha_preferida'),
    franja: oneOf(FRANJAS, row, 'franja'),
    fechaConfirmada: strOrNull(row, 'fecha_confirmada'),
    franjaConfirmada: oneOfOrNull(FRANJAS, row, 'franja_confirmada'),
    comentario: strOrNull(row, 'comentario'),
    estado: oneOf(ESTADOS, row, 'estado'),
    notasInternas: strOrNull(row, 'notas_internas'),
    turnosDelCliente: intOrNull(row, 'turnos_del_cliente'),
    monto: intOrNull(row, 'monto'),
    trabajador: toTrabajador(row),
    createdAt: isoTimestamp(row, 'created_at'),
    updatedAt: isoTimestamp(row, 'updated_at'),
  };
}

/** Escapa los comodines de LIKE (`\`, `%`, `_`) para que se busquen como texto (las consultas usan ESCAPE '\'). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Los parámetros de búsqueda ($3: patrón de texto, $4: patrón de dígitos) que comparten listado y conteo. */
function patronesBusqueda(q: string | undefined): { texto: string | null; digitos: string | null } {
  if (q === undefined) return { texto: null, digitos: null };
  const digits = q.replace(/\D/g, '');
  return {
    texto: `%${escapeLike(q)}%`,
    digitos: digits.length >= MIN_DIGITOS_BUSQUEDA ? `%${digits}%` : null,
  };
}

/*
 * Las columnas que se devuelven se repiten literalmente en cada consulta (la regla de ESLint exige SQL literal,
 * sin interpolar). Las fechas (date) salen como texto YYYY-MM-DD (to_char) para no depender de cómo cada driver
 * convierte el tipo date; id, como texto.
 *
 * turnos_del_cliente: una subconsulta correlacionada por fila (count sobre el índice parcial
 * bookings_telefono_whatsapp_idx), dentro de la misma consulta: sin N+1. En un INSERT ... RETURNING la subconsulta
 * no ve la fila que se está insertando (misma instantánea del comando): por eso ahí se suma 1.
 */

/** INSERT de un turno nuevo ("pendiente"). Recibe el cliente: sirve dentro de la transacción del alta pública. */
async function insertBooking(sql: SqlClient, input: NewBooking, now: Date): Promise<Booking> {
  const timestamp = now.toISOString();
  const { rows } = await sql.query(
    `INSERT INTO mgdetailing.bookings AS b (
       nombre, telefono, telefono_whatsapp, email, vehiculo_tipo, vehiculo_modelo,
       servicio_id, fecha_preferida, franja, comentario, estado, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, 'pendiente', $11::timestamptz, $11::timestamptz)
     RETURNING id::text AS id, nombre, telefono, telefono_whatsapp, email, vehiculo_tipo, vehiculo_modelo, servicio_id,
               to_char(fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, franja,
               to_char(fecha_confirmada, 'YYYY-MM-DD') AS fecha_confirmada, franja_confirmada,
               comentario, estado, notas_internas, monto, created_at, updated_at,
               NULL::text AS trabajador_id, NULL::text AS trabajador_nombre,
               CASE WHEN b.telefono_whatsapp IS NULL THEN NULL
                    ELSE (SELECT count(*)::int FROM mgdetailing.bookings c
                          WHERE c.telefono_whatsapp = b.telefono_whatsapp) + 1
               END AS turnos_del_cliente`,
    [
      input.nombre,
      input.telefono,
      telefonoWhatsapp(input.telefono),
      input.email,
      input.vehiculoTipo,
      input.vehiculoModelo,
      input.servicioId,
      input.fechaPreferida,
      input.franja,
      input.comentario,
      timestamp,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error('INSERT de turno no devolvió la fila creada');
  }
  return toBooking(row);
}

/**
 * Turnos sobre Postgres (esquema mgdetailing). El orden "más nuevos primero" es por `seq` (identity), estable
 * aunque dos turnos tengan el mismo created_at; en la agenda, `seq` es el orden de llegada.
 */
export class PostgresBookingRepository implements BookingRepository {
  constructor(private readonly sql: SqlClient) {}

  create(input: NewBooking, now: Date): Promise<Booking> {
    return insertBooking(this.sql, input, now);
  }

  reservar(input: NewBooking, now: Date): Promise<Booking> {
    return this.sql.transaction(async (sql) => {
      // Bloqueo por fecha hasta el COMMIT: dos altas del mismo día se hacen de a una, y la segunda ya ve el turno de
      // la primera al contar los ocupados (READ COMMITTED: cada sentencia ve lo confirmado antes de empezar).
      // Clave de dos enteros: 7340003 (alta pública) y los días desde 2000-01-01.
      await sql.query("SELECT pg_catalog.pg_advisory_xact_lock(7340003, $1::date - DATE '2000-01-01')", [
        input.fechaPreferida,
      ]);
      const [cupo] = await cuposEntre(sql, input.fechaPreferida, input.fechaPreferida);
      if (cupo === undefined) throw new Error('No se pudieron calcular los cupos del día');
      verificarLugar(cupo, input.franja); // lanzar acá revierte la transacción: no se guarda nada
      return insertBooking(sql, input, now);
    });
  }

  async seguimiento(id: string): Promise<SeguimientoTurno | undefined> {
    if (!isUuid(id)) return undefined;
    // SOLO los campos públicos: nada de datos del cliente ni notas.
    const { rows } = await this.sql.query(
      `SELECT b.id::text AS id, s.nombre AS servicio_nombre,
              to_char(coalesce(b.fecha_confirmada, b.fecha_preferida), 'YYYY-MM-DD') AS fecha,
              coalesce(b.franja_confirmada, b.franja) AS franja, b.estado, b.updated_at
       FROM mgdetailing.bookings b
       JOIN mgdetailing.servicios s ON s.id = b.servicio_id
       WHERE b.id = $1::uuid`,
      [id],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: str(row, 'id'),
      servicioNombre: str(row, 'servicio_nombre'),
      fecha: str(row, 'fecha'),
      franja: oneOf(FRANJAS, row, 'franja'),
      estado: oneOf(ESTADOS, row, 'estado'),
      actualizadoEl: isoTimestamp(row, 'updated_at'),
    };
  }

  async recordatoriosPendientes(fecha: string): Promise<CandidatoRecordatorio[]> {
    // `estado <> 'cancelado'` es redundante a propósito: es el predicado del índice parcial bookings_agenda_idx.
    const { rows } = await this.sql.query(
      `SELECT b.id::text AS id, b.email, b.telefono_whatsapp, s.nombre AS servicio_nombre,
              to_char(coalesce(b.fecha_confirmada, b.fecha_preferida), 'YYYY-MM-DD') AS fecha,
              coalesce(b.franja_confirmada, b.franja) AS franja
       FROM mgdetailing.bookings b
       JOIN mgdetailing.servicios s ON s.id = b.servicio_id
       WHERE b.estado = 'confirmado'
         AND b.estado <> 'cancelado'
         AND b.recordatorio_enviado_at IS NULL
         AND coalesce(b.fecha_confirmada, b.fecha_preferida) = $1::date
       ORDER BY b.seq`,
      [fecha],
    );
    return rows.map((row) => ({
      id: str(row, 'id'),
      email: strOrNull(row, 'email'),
      telefonoWhatsapp: strOrNull(row, 'telefono_whatsapp'),
      servicioNombre: str(row, 'servicio_nombre'),
      fecha: str(row, 'fecha'),
      franja: oneOf(FRANJAS, row, 'franja'),
    }));
  }

  async marcarRecordatorio(id: string, fecha: string, now: Date): Promise<boolean> {
    if (!isUuid(id)) return false;
    // Las condiciones van en el mismo UPDATE: si en el medio se canceló o se reprogramó, no se marca.
    // updated_at queda igual a propósito: no es un cambio del turno (el trigger de updated_at no corre cuando cambia
    // recordatorio_enviado_at; migración disponibilidad_seguimiento).
    const { rowCount } = await this.sql.query(
      `UPDATE mgdetailing.bookings AS b
       SET recordatorio_enviado_at = $3::timestamptz
       WHERE b.id = $1::uuid
         AND b.estado = 'confirmado'
         AND b.recordatorio_enviado_at IS NULL
         AND coalesce(b.fecha_confirmada, b.fecha_preferida) = $2::date`,
      [id, fecha, now.toISOString()],
    );
    return rowCount > 0;
  }

  async list({ estado, q, cliente, limit, offset }: ListBookingsOptions): Promise<{ bookings: Booking[]; total: number }> {
    // Un solo par de consultas para todas las combinaciones: cada filtro ausente es un parámetro null (la tabla es
    // chica y node-postgres manda consultas sin nombre, así que el planner ve los null y los descarta).
    // Texto: mgdetailing.texto_busqueda (minúsculas y sin acentos) de los dos lados del LIKE; los comodines vienen
    // escapados (escapeLike) y el ESCAPE es explícito. Dígitos: contra los dígitos del teléfono escrito y contra el
    // normalizado. Todo va como parámetro.
    const { texto, digitos } = patronesBusqueda(q);
    const params = [estado ?? null, cliente ?? null, texto, digitos];
    const [page, count] = await Promise.all([
      this.sql.query(
        `SELECT b.id::text AS id, b.nombre, b.telefono, b.telefono_whatsapp, b.email, b.vehiculo_tipo, b.vehiculo_modelo, b.servicio_id,
                to_char(b.fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, b.franja,
                to_char(b.fecha_confirmada, 'YYYY-MM-DD') AS fecha_confirmada, b.franja_confirmada,
                b.comentario, b.estado, b.notas_internas, b.monto, b.created_at, b.updated_at,
                t.id::text AS trabajador_id, coalesce(nullif(btrim(t.nombre), ''), t.email, 'Sin nombre') AS trabajador_nombre,
                CASE WHEN b.telefono_whatsapp IS NULL THEN NULL
                     ELSE (SELECT count(*)::int FROM mgdetailing.bookings c WHERE c.telefono_whatsapp = b.telefono_whatsapp)
                END AS turnos_del_cliente
         FROM mgdetailing.bookings b
         LEFT JOIN mgdetailing.perfiles t ON t.id = b.trabajador_id
         WHERE ($1::text IS NULL OR b.estado = $1::text)
           AND ($2::text IS NULL OR b.telefono_whatsapp = $2::text)
           AND ($3::text IS NULL
                OR mgdetailing.texto_busqueda(b.nombre) LIKE mgdetailing.texto_busqueda($3::text) ESCAPE '\\'
                OR mgdetailing.texto_busqueda(b.email) LIKE mgdetailing.texto_busqueda($3::text) ESCAPE '\\'
                OR mgdetailing.texto_busqueda(b.vehiculo_modelo) LIKE mgdetailing.texto_busqueda($3::text) ESCAPE '\\'
                OR ($4::text IS NOT NULL
                    AND (regexp_replace(b.telefono, '[^0-9]', '', 'g') LIKE $4::text
                         OR b.telefono_whatsapp LIKE $4::text)))
         ORDER BY b.seq DESC
         LIMIT $5 OFFSET $6`,
        [...params, limit, offset],
      ),
      this.sql.query(
        `SELECT count(*)::int AS total
         FROM mgdetailing.bookings b
         WHERE ($1::text IS NULL OR b.estado = $1::text)
           AND ($2::text IS NULL OR b.telefono_whatsapp = $2::text)
           AND ($3::text IS NULL
                OR mgdetailing.texto_busqueda(b.nombre) LIKE mgdetailing.texto_busqueda($3::text) ESCAPE '\\'
                OR mgdetailing.texto_busqueda(b.email) LIKE mgdetailing.texto_busqueda($3::text) ESCAPE '\\'
                OR mgdetailing.texto_busqueda(b.vehiculo_modelo) LIKE mgdetailing.texto_busqueda($3::text) ESCAPE '\\'
                OR ($4::text IS NOT NULL
                    AND (regexp_replace(b.telefono, '[^0-9]', '', 'g') LIKE $4::text
                         OR b.telefono_whatsapp LIKE $4::text)))`,
        params,
      ),
    ]);
    const totalRow = count.rows[0];
    return { bookings: page.rows.map(toBooking), total: totalRow ? int(totalRow, 'total') : 0 };
  }

  async find(id: string): Promise<Booking | undefined> {
    if (!isUuid(id)) return undefined;
    const { rows } = await this.sql.query(
      `SELECT b.id::text AS id, b.nombre, b.telefono, b.telefono_whatsapp, b.email, b.vehiculo_tipo, b.vehiculo_modelo, b.servicio_id,
              to_char(b.fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, b.franja,
              to_char(b.fecha_confirmada, 'YYYY-MM-DD') AS fecha_confirmada, b.franja_confirmada,
              b.comentario, b.estado, b.notas_internas, b.monto, b.created_at, b.updated_at,
              t.id::text AS trabajador_id, coalesce(nullif(btrim(t.nombre), ''), t.email, 'Sin nombre') AS trabajador_nombre,
              CASE WHEN b.telefono_whatsapp IS NULL THEN NULL
                   ELSE (SELECT count(*)::int FROM mgdetailing.bookings c WHERE c.telefono_whatsapp = b.telefono_whatsapp)
              END AS turnos_del_cliente
       FROM mgdetailing.bookings b
       LEFT JOIN mgdetailing.perfiles t ON t.id = b.trabajador_id
       WHERE b.id = $1::uuid`,
      [id],
    );
    const row = rows[0];
    return row ? toBooking(row) : undefined;
  }

  async actualizar(
    id: string,
    { estado, notasInternas, monto, trabajadorId }: ActualizacionTurno,
    now: Date,
  ): Promise<Booking | undefined> {
    // Un id que no es UUID no puede existir (y Postgres rechazaría el cast): igual que "no existe".
    if (!isUuid(id)) return undefined;
    // coalesce($1, estado): sin estado nuevo, queda el que tenía. La nota: $2 dice si se toca (null es un valor
    // válido: borrarla). Sin condición de estado: la nota se puede cambiar aunque el turno esté cerrado.
    // Cobro ($6 y $8 dicen si se toca; $7 y $9 son los valores): si el estado final no es "completado" quedan en
    // null (CHECK bookings_cobro_solo_completado). updated_at solo se mueve si cambia el estado o la nota: cargar o
    // corregir el cobro no es un cambio para el cliente (y el trigger tampoco corre; migración estadisticas_cobro).
    // Va en un WITH para traer el nombre del trabajador en la misma consulta (UPDATE ... RETURNING no hace JOIN).
    const { rows } = await this.sql.query(
      `WITH b AS (
         UPDATE mgdetailing.bookings AS u
         SET estado = coalesce($1::text, u.estado),
             notas_internas = CASE WHEN $2::boolean THEN $3::text ELSE u.notas_internas END,
             monto = CASE WHEN coalesce($1::text, u.estado) <> 'completado' THEN NULL
                          WHEN $6::boolean THEN $7::integer ELSE u.monto END,
             trabajador_id = CASE WHEN coalesce($1::text, u.estado) <> 'completado' THEN NULL
                                  WHEN $8::boolean THEN $9::uuid ELSE u.trabajador_id END,
             updated_at = CASE WHEN ($1::text IS NOT NULL AND $1::text IS DISTINCT FROM u.estado) OR $2::boolean
                               THEN $4::timestamptz ELSE u.updated_at END
         WHERE u.id = $5::uuid
         RETURNING u.*
       )
       SELECT b.id::text AS id, b.nombre, b.telefono, b.telefono_whatsapp, b.email, b.vehiculo_tipo, b.vehiculo_modelo, b.servicio_id,
              to_char(b.fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, b.franja,
              to_char(b.fecha_confirmada, 'YYYY-MM-DD') AS fecha_confirmada, b.franja_confirmada,
              b.comentario, b.estado, b.notas_internas, b.monto, b.created_at, b.updated_at,
              t.id::text AS trabajador_id, coalesce(nullif(btrim(t.nombre), ''), t.email, 'Sin nombre') AS trabajador_nombre,
              CASE WHEN b.telefono_whatsapp IS NULL THEN NULL
                   ELSE (SELECT count(*)::int FROM mgdetailing.bookings c WHERE c.telefono_whatsapp = b.telefono_whatsapp)
              END AS turnos_del_cliente
       FROM b
       LEFT JOIN mgdetailing.perfiles t ON t.id = b.trabajador_id`,
      [
        estado ?? null,
        notasInternas !== undefined,
        notasInternas ?? null,
        now.toISOString(),
        id,
        monto !== undefined,
        monto ?? null,
        trabajadorId !== undefined,
        trabajadorId ?? null,
      ],
    );
    const row = rows[0];
    return row ? toBooking(row) : undefined;
  }

  updateEstado(id: string, estado: Estado, now: Date): Promise<Booking | undefined> {
    return this.actualizar(id, { estado }, now);
  }

  async reprogramar(id: string, { confirmada, estado, notasInternas }: Reprogramacion, now: Date): Promise<Booking | undefined> {
    if (!isUuid(id)) return undefined;
    // La condición "no cerrado" va en el mismo UPDATE: si otro pedido lo cancela o completa en el medio, no se
    // reprograma igual. coalesce($3, estado): sin estado nuevo, queda el que tenía. La nota, como en actualizar().
    const { rows } = await this.sql.query(
      `WITH b AS (
       UPDATE mgdetailing.bookings AS b
       SET fecha_confirmada = $1::date, franja_confirmada = $2::text,
           -- Si cambia la fecha o la franja de agenda, el recordatorio ya enviado no sirve: se limpia la marca.
           -- (En el SET, b.* son los valores de ANTES del UPDATE.)
           recordatorio_enviado_at = CASE
             WHEN coalesce($1::date, b.fecha_preferida) IS DISTINCT FROM coalesce(b.fecha_confirmada, b.fecha_preferida)
               OR coalesce($2::text, b.franja) IS DISTINCT FROM coalesce(b.franja_confirmada, b.franja)
             THEN NULL ELSE b.recordatorio_enviado_at END,
           estado = coalesce($3::text, b.estado),
           notas_internas = CASE WHEN $4::boolean THEN $5::text ELSE b.notas_internas END,
           updated_at = $6::timestamptz
       WHERE b.id = $7::uuid AND b.estado NOT IN ('cancelado', 'completado')
       RETURNING b.*
       )
       SELECT b.id::text AS id, b.nombre, b.telefono, b.telefono_whatsapp, b.email, b.vehiculo_tipo, b.vehiculo_modelo, b.servicio_id,
              to_char(b.fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, b.franja,
              to_char(b.fecha_confirmada, 'YYYY-MM-DD') AS fecha_confirmada, b.franja_confirmada,
              b.comentario, b.estado, b.notas_internas, b.monto, b.created_at, b.updated_at,
              t.id::text AS trabajador_id, coalesce(nullif(btrim(t.nombre), ''), t.email, 'Sin nombre') AS trabajador_nombre,
              CASE WHEN b.telefono_whatsapp IS NULL THEN NULL
                   ELSE (SELECT count(*)::int FROM mgdetailing.bookings c WHERE c.telefono_whatsapp = b.telefono_whatsapp)
              END AS turnos_del_cliente
       FROM b
       LEFT JOIN mgdetailing.perfiles t ON t.id = b.trabajador_id`,
      [
        confirmada?.fecha ?? null,
        confirmada?.franja ?? null,
        estado ?? null,
        notasInternas !== undefined,
        notasInternas ?? null,
        now.toISOString(),
        id,
      ],
    );
    const row = rows[0];
    if (row) return toBooking(row);

    // No se actualizó: o no existe, o está cerrado.
    const actual = await this.sql.query('SELECT estado FROM mgdetailing.bookings WHERE id = $1::uuid', [id]);
    const existente = actual.rows[0];
    if (!existente) return undefined;
    throw new TurnoCerradoError(oneOf(ESTADOS, existente, 'estado'));
  }

  async agenda(desde: string, hasta: string): Promise<Booking[]> {
    // Mismas expresiones y mismo predicado que el índice parcial bookings_agenda_idx (migración
    // agenda_fecha_confirmada). 'manana' < 'tarde' como texto: mañana antes que tarde.
    const { rows } = await this.sql.query(
      `SELECT b.id::text AS id, b.nombre, b.telefono, b.telefono_whatsapp, b.email, b.vehiculo_tipo, b.vehiculo_modelo, b.servicio_id,
              to_char(b.fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, b.franja,
              to_char(b.fecha_confirmada, 'YYYY-MM-DD') AS fecha_confirmada, b.franja_confirmada,
              b.comentario, b.estado, b.notas_internas, b.monto, b.created_at, b.updated_at,
              t.id::text AS trabajador_id, coalesce(nullif(btrim(t.nombre), ''), t.email, 'Sin nombre') AS trabajador_nombre,
              CASE WHEN b.telefono_whatsapp IS NULL THEN NULL
                   ELSE (SELECT count(*)::int FROM mgdetailing.bookings c WHERE c.telefono_whatsapp = b.telefono_whatsapp)
              END AS turnos_del_cliente
       FROM mgdetailing.bookings b
       LEFT JOIN mgdetailing.perfiles t ON t.id = b.trabajador_id
       WHERE b.estado <> 'cancelado'
         AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN $1::date AND $2::date
       ORDER BY coalesce(b.fecha_confirmada, b.fecha_preferida), coalesce(b.franja_confirmada, b.franja), b.seq`,
      [desde, hasta],
    );
    return rows.map(toBooking);
  }

  async delete(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    // Un turno con comprobante emitido no se borra (la FK es ON DELETE RESTRICT): se avisa con un error de negocio.
    const emitido = await this.sql.query('SELECT 1 AS ok FROM mgdetailing.comprobantes WHERE booking_id = $1::uuid', [id]);
    if (emitido.rows.length > 0) throw new TurnoConComprobanteError();
    const { rowCount } = await this.sql.query('DELETE FROM mgdetailing.bookings WHERE id = $1::uuid', [id]);
    return rowCount > 0;
  }
}
