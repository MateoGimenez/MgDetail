import type { SqlClient } from '../../db/postgres.js';
import { type Row, int, intOrNull, isoTimestamp, oneOf, oneOfOrNull, str, strOrNull } from '../../db/rows.js';
import {
  type ActualizacionTurno,
  type Booking,
  type BookingRepository,
  type Estado,
  type ListBookingsOptions,
  type NewBooking,
  type Reprogramacion,
  ESTADOS,
  FRANJAS,
  MIN_DIGITOS_BUSQUEDA,
  TurnoCerradoError,
  VEHICULO_TIPOS,
} from '../../domain/booking.js';
import { telefonoWhatsapp } from '../../domain/telefono.js';
import { isUuid } from './uuid.js';

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

/**
 * Turnos sobre Postgres (esquema mgdetailing). El orden "más nuevos primero" es por `seq` (identity), estable
 * aunque dos turnos tengan el mismo created_at; en la agenda, `seq` es el orden de llegada.
 */
export class PostgresBookingRepository implements BookingRepository {
  constructor(private readonly sql: SqlClient) {}

  async create(input: NewBooking, now: Date): Promise<Booking> {
    const timestamp = now.toISOString();
    const { rows } = await this.sql.query(
      `INSERT INTO mgdetailing.bookings AS b (
         nombre, telefono, telefono_whatsapp, email, vehiculo_tipo, vehiculo_modelo,
         servicio_id, fecha_preferida, franja, comentario, estado, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, 'pendiente', $11::timestamptz, $11::timestamptz)
       RETURNING id::text AS id, nombre, telefono, telefono_whatsapp, email, vehiculo_tipo, vehiculo_modelo, servicio_id,
                 to_char(fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, franja,
                 to_char(fecha_confirmada, 'YYYY-MM-DD') AS fecha_confirmada, franja_confirmada,
                 comentario, estado, notas_internas, created_at, updated_at,
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
        `SELECT id::text AS id, nombre, telefono, telefono_whatsapp, email, vehiculo_tipo, vehiculo_modelo, servicio_id,
                to_char(fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, franja,
                to_char(fecha_confirmada, 'YYYY-MM-DD') AS fecha_confirmada, franja_confirmada,
                comentario, estado, notas_internas, created_at, updated_at,
                CASE WHEN b.telefono_whatsapp IS NULL THEN NULL
                     ELSE (SELECT count(*)::int FROM mgdetailing.bookings c WHERE c.telefono_whatsapp = b.telefono_whatsapp)
                END AS turnos_del_cliente
         FROM mgdetailing.bookings b
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

  async actualizar(id: string, { estado, notasInternas }: ActualizacionTurno, now: Date): Promise<Booking | undefined> {
    // Un id que no es UUID no puede existir (y Postgres rechazaría el cast): igual que "no existe".
    if (!isUuid(id)) return undefined;
    // coalesce($1, estado): sin estado nuevo, queda el que tenía. La nota: $2 dice si se toca (null es un valor
    // válido: borrarla). Sin condición de estado: la nota se puede cambiar aunque el turno esté cerrado.
    const { rows } = await this.sql.query(
      `UPDATE mgdetailing.bookings AS b
       SET estado = coalesce($1::text, b.estado),
           notas_internas = CASE WHEN $2::boolean THEN $3::text ELSE b.notas_internas END,
           updated_at = $4::timestamptz
       WHERE b.id = $5::uuid
       RETURNING id::text AS id, nombre, telefono, telefono_whatsapp, email, vehiculo_tipo, vehiculo_modelo, servicio_id,
                 to_char(fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, franja,
                 to_char(fecha_confirmada, 'YYYY-MM-DD') AS fecha_confirmada, franja_confirmada,
                 comentario, estado, notas_internas, created_at, updated_at,
                 CASE WHEN b.telefono_whatsapp IS NULL THEN NULL
                      ELSE (SELECT count(*)::int FROM mgdetailing.bookings c WHERE c.telefono_whatsapp = b.telefono_whatsapp)
                 END AS turnos_del_cliente`,
      [estado ?? null, notasInternas !== undefined, notasInternas ?? null, now.toISOString(), id],
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
      `UPDATE mgdetailing.bookings AS b
       SET fecha_confirmada = $1::date, franja_confirmada = $2::text,
           estado = coalesce($3::text, b.estado),
           notas_internas = CASE WHEN $4::boolean THEN $5::text ELSE b.notas_internas END,
           updated_at = $6::timestamptz
       WHERE b.id = $7::uuid AND b.estado NOT IN ('cancelado', 'completado')
       RETURNING id::text AS id, nombre, telefono, telefono_whatsapp, email, vehiculo_tipo, vehiculo_modelo, servicio_id,
                 to_char(fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, franja,
                 to_char(fecha_confirmada, 'YYYY-MM-DD') AS fecha_confirmada, franja_confirmada,
                 comentario, estado, notas_internas, created_at, updated_at,
                 CASE WHEN b.telefono_whatsapp IS NULL THEN NULL
                      ELSE (SELECT count(*)::int FROM mgdetailing.bookings c WHERE c.telefono_whatsapp = b.telefono_whatsapp)
                 END AS turnos_del_cliente`,
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
      `SELECT id::text AS id, nombre, telefono, telefono_whatsapp, email, vehiculo_tipo, vehiculo_modelo, servicio_id,
              to_char(fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, franja,
              to_char(fecha_confirmada, 'YYYY-MM-DD') AS fecha_confirmada, franja_confirmada,
              comentario, estado, notas_internas, created_at, updated_at,
              CASE WHEN b.telefono_whatsapp IS NULL THEN NULL
                   ELSE (SELECT count(*)::int FROM mgdetailing.bookings c WHERE c.telefono_whatsapp = b.telefono_whatsapp)
              END AS turnos_del_cliente
       FROM mgdetailing.bookings b
       WHERE b.estado <> 'cancelado'
         AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN $1::date AND $2::date
       ORDER BY coalesce(b.fecha_confirmada, b.fecha_preferida), coalesce(b.franja_confirmada, b.franja), b.seq`,
      [desde, hasta],
    );
    return rows.map(toBooking);
  }

  async delete(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const { rowCount } = await this.sql.query('DELETE FROM mgdetailing.bookings WHERE id = $1::uuid', [id]);
    return rowCount > 0;
  }
}
