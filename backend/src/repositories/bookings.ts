import { randomUUID } from 'node:crypto';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { type Row, int, oneOf, str, strOrNull } from '../db/rows.js';
import {
  type Booking,
  type BookingRepository,
  type Estado,
  type ListBookingsOptions,
  type NewBooking,
  ESTADOS,
  FRANJAS,
  VEHICULO_TIPOS,
} from '../domain/booking.js';
import { telefonoWhatsapp } from '../domain/telefono.js';

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
    // Texto libre a propósito: un turno viejo de un servicio que ya no está en el catálogo se sigue listando.
    servicioId: str(row, 'servicio_id'),
    fechaPreferida: str(row, 'fecha_preferida'),
    franja: oneOf(FRANJAS, row, 'franja'),
    comentario: strOrNull(row, 'comentario'),
    estado: oneOf(ESTADOS, row, 'estado'),
    createdAt: str(row, 'created_at'),
    updatedAt: str(row, 'updated_at'),
  };
}

/**
 * Turnos sobre SQLite. Todas las consultas son preparadas y parametrizadas.
 * node:sqlite es síncrono: los métodos son `async` solo para cumplir el puerto BookingRepository
 * (una implementación futura sobre otra base sí sería asíncrona de verdad). Un error síncrono dentro de un
 * método `async` se convierte en una promesa rechazada, que es lo que espera quien lo llama.
 */
export class SqliteBookingRepository implements BookingRepository {
  private readonly insertStmt: StatementSync;
  private readonly listAllStmt: StatementSync;
  private readonly listByEstadoStmt: StatementSync;
  private readonly countAllStmt: StatementSync;
  private readonly countByEstadoStmt: StatementSync;
  private readonly updateEstadoStmt: StatementSync;
  private readonly deleteStmt: StatementSync;

  constructor(db: DatabaseSync) {
    this.insertStmt = db.prepare(`
      INSERT INTO bookings (
        id, nombre, telefono, email, vehiculo_tipo, vehiculo_modelo,
        servicio_id, fecha_preferida, franja, comentario, estado, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)
      RETURNING *
    `);
    this.listAllStmt = db.prepare('SELECT * FROM bookings ORDER BY seq DESC LIMIT ? OFFSET ?');
    this.listByEstadoStmt = db.prepare(
      'SELECT * FROM bookings WHERE estado = ? ORDER BY seq DESC LIMIT ? OFFSET ?',
    );
    this.countAllStmt = db.prepare('SELECT COUNT(*) AS total FROM bookings');
    this.countByEstadoStmt = db.prepare('SELECT COUNT(*) AS total FROM bookings WHERE estado = ?');
    this.updateEstadoStmt = db.prepare('UPDATE bookings SET estado = ?, updated_at = ? WHERE id = ? RETURNING *');
    this.deleteStmt = db.prepare('DELETE FROM bookings WHERE id = ?');
  }

  async create(input: NewBooking, now: Date): Promise<Booking> {
    const timestamp = now.toISOString();
    const row = this.insertStmt.get(
      randomUUID(),
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
      timestamp,
    );
    if (!row) {
      throw new Error('INSERT de turno no devolvió la fila creada');
    }
    return toBooking(row);
  }

  async list({ estado, limit, offset }: ListBookingsOptions): Promise<{ bookings: Booking[]; total: number }> {
    const rows =
      estado === undefined
        ? this.listAllStmt.all(limit, offset)
        : this.listByEstadoStmt.all(estado, limit, offset);
    const totalRow = estado === undefined ? this.countAllStmt.get() : this.countByEstadoStmt.get(estado);
    return { bookings: rows.map(toBooking), total: totalRow ? int(totalRow, 'total') : 0 };
  }

  async updateEstado(id: string, estado: Estado, now: Date): Promise<Booking | undefined> {
    const row = this.updateEstadoStmt.get(estado, now.toISOString(), id);
    return row ? toBooking(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    return Number(this.deleteStmt.run(id).changes) > 0;
  }
}
