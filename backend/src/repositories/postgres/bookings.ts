import type { SqlClient } from '../../db/postgres.js';
import { type Row, int, isoTimestamp, oneOf, str, strOrNull } from '../../db/rows.js';
import {
  type Booking,
  type BookingRepository,
  type Estado,
  type ListBookingsOptions,
  type NewBooking,
  ESTADOS,
  FRANJAS,
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
    // Se calcula al leer (no es una columna): si mejora la regla, se aplica también a los turnos ya guardados.
    telefonoWhatsapp: telefonoWhatsapp(telefono),
    email: strOrNull(row, 'email'),
    vehiculoTipo: oneOf(VEHICULO_TIPOS, row, 'vehiculo_tipo'),
    vehiculoModelo: strOrNull(row, 'vehiculo_modelo'),
    servicioId: str(row, 'servicio_id'),
    fechaPreferida: str(row, 'fecha_preferida'),
    franja: oneOf(FRANJAS, row, 'franja'),
    comentario: strOrNull(row, 'comentario'),
    estado: oneOf(ESTADOS, row, 'estado'),
    createdAt: isoTimestamp(row, 'created_at'),
    updatedAt: isoTimestamp(row, 'updated_at'),
  };
}

/*
 * Las columnas que se devuelven se repiten literalmente en cada consulta (la regla de ESLint exige SQL literal,
 * sin interpolar). fecha_preferida sale como texto YYYY-MM-DD (to_char) para no depender de cómo cada driver
 * convierte el tipo date; id, como texto.
 */

/**
 * Turnos sobre Postgres (esquema mgdetailing). Mismo comportamiento que SqliteBookingRepository: el orden
 * "más nuevos primero" es por `seq` (identity), estable aunque dos turnos tengan el mismo created_at.
 */
export class PostgresBookingRepository implements BookingRepository {
  constructor(private readonly sql: SqlClient) {}

  async create(input: NewBooking, now: Date): Promise<Booking> {
    const timestamp = now.toISOString();
    const { rows } = await this.sql.query(
      `INSERT INTO mgdetailing.bookings (
         nombre, telefono, email, vehiculo_tipo, vehiculo_modelo,
         servicio_id, fecha_preferida, franja, comentario, estado, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, 'pendiente', $10::timestamptz, $10::timestamptz)
       RETURNING id::text AS id, nombre, telefono, email, vehiculo_tipo, vehiculo_modelo, servicio_id,
                 to_char(fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, franja, comentario, estado,
                 created_at, updated_at`,
      [
        input.nombre,
        input.telefono,
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

  async list({ estado, limit, offset }: ListBookingsOptions): Promise<{ bookings: Booking[]; total: number }> {
    const [page, count] =
      estado === undefined
        ? await Promise.all([
            this.sql.query(
              `SELECT id::text AS id, nombre, telefono, email, vehiculo_tipo, vehiculo_modelo, servicio_id,
                      to_char(fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, franja, comentario, estado,
                      created_at, updated_at
               FROM mgdetailing.bookings
               ORDER BY seq DESC
               LIMIT $1 OFFSET $2`,
              [limit, offset],
            ),
            this.sql.query('SELECT count(*)::int AS total FROM mgdetailing.bookings'),
          ])
        : await Promise.all([
            this.sql.query(
              `SELECT id::text AS id, nombre, telefono, email, vehiculo_tipo, vehiculo_modelo, servicio_id,
                      to_char(fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, franja, comentario, estado,
                      created_at, updated_at
               FROM mgdetailing.bookings
               WHERE estado = $1
               ORDER BY seq DESC
               LIMIT $2 OFFSET $3`,
              [estado, limit, offset],
            ),
            this.sql.query('SELECT count(*)::int AS total FROM mgdetailing.bookings WHERE estado = $1', [estado]),
          ]);
    const totalRow = count.rows[0];
    return { bookings: page.rows.map(toBooking), total: totalRow ? int(totalRow, 'total') : 0 };
  }

  async updateEstado(id: string, estado: Estado, now: Date): Promise<Booking | undefined> {
    // Un id que no es UUID no puede existir (y Postgres rechazaría el cast): igual que "no existe".
    if (!isUuid(id)) return undefined;
    const { rows } = await this.sql.query(
      `UPDATE mgdetailing.bookings
       SET estado = $1, updated_at = $2::timestamptz
       WHERE id = $3::uuid
       RETURNING id::text AS id, nombre, telefono, email, vehiculo_tipo, vehiculo_modelo, servicio_id,
                 to_char(fecha_preferida, 'YYYY-MM-DD') AS fecha_preferida, franja, comentario, estado,
                 created_at, updated_at`,
      [estado, now.toISOString(), id],
    );
    const row = rows[0];
    return row ? toBooking(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const { rowCount } = await this.sql.query('DELETE FROM mgdetailing.bookings WHERE id = $1::uuid', [id]);
    return rowCount > 0;
  }
}
