import type { SqlClient } from '../../db/postgres.js';
import { type Row, int, oneOf, str, strOrNull } from '../../db/rows.js';
import {
  type Comprobante,
  type ComprobanteRepository,
  type DatosComprobante,
  type EmisionComprobante,
  FORMAS_DE_PAGO,
  TurnoNoEncontradoError,
  TurnoSinCobroError,
  codigoDeComprobante,
  textoDeVehiculo,
} from '../../domain/comprobantes.js';
import { isUuid } from './uuid.js';

/** Clave 1 del advisory lock de la emisión de comprobantes (dos pedidos del mismo turno se ordenan). */
const LOCK_COMPROBANTES = 7340012;

function toComprobante(row: Row): Comprobante {
  const numero = int(row, 'numero');
  return {
    id: str(row, 'id'),
    numero,
    codigo: codigoDeComprobante(numero),
    fechaEmision: str(row, 'fecha_emision'),
    formaPago: oneOf(FORMAS_DE_PAGO, row, 'forma_pago'),
    monto: int(row, 'monto'),
    clienteNombre: str(row, 'cliente_nombre'),
    servicioNombre: str(row, 'servicio_nombre'),
    vehiculo: strOrNull(row, 'vehiculo'),
    notas: strOrNull(row, 'notas'),
  };
}

/** Recorta por caracteres (code points), como char_length de Postgres. */
function recortar(texto: string, max: number): string {
  return Array.from(texto).slice(0, max).join('');
}

async function deTurno(sql: SqlClient, bookingId: string): Promise<Comprobante | null> {
  const { rows } = await sql.query(
    `SELECT c.id::text AS id, c.numero, to_char(c.fecha_emision, 'YYYY-MM-DD') AS fecha_emision, c.forma_pago, c.monto,
            c.cliente_nombre, c.servicio_nombre, c.vehiculo, c.notas
     FROM mgdetailing.comprobantes c
     WHERE c.booking_id = $1::uuid`,
    [bookingId],
  );
  const row = rows[0];
  return row ? toComprobante(row) : null;
}

/** Comprobantes sobre Postgres: se emiten una sola vez por turno y no se modifican. */
export class PostgresComprobanteRepository implements ComprobanteRepository {
  constructor(private readonly sql: SqlClient) {}

  emitir(
    bookingId: string,
    datos: DatosComprobante,
    contexto: { perfilId: string; hoy: string },
  ): Promise<EmisionComprobante> {
    if (!isUuid(bookingId)) return Promise.reject(new TurnoNoEncontradoError());
    return this.sql.transaction(async (tx) => {
      await tx.query('SELECT pg_catalog.pg_advisory_xact_lock($1::int, pg_catalog.hashtext($2::text))', [
        LOCK_COMPROBANTES,
        bookingId,
      ]);
      const existente = await deTurno(tx, bookingId);
      if (existente) return { comprobante: existente, creado: false };

      const turno = await tx.query(
        `SELECT b.estado, b.monto, b.nombre, b.vehiculo_tipo, b.vehiculo_modelo, s.nombre AS servicio_nombre
         FROM mgdetailing.bookings b
         JOIN mgdetailing.servicios s ON s.id = b.servicio_id
         WHERE b.id = $1::uuid`,
        [bookingId],
      );
      const fila = turno.rows[0];
      if (!fila) throw new TurnoNoEncontradoError();
      const monto = fila.monto;
      if (str(fila, 'estado') !== 'completado' || typeof monto !== 'number') throw new TurnoSinCobroError();

      // La foto del momento: el nombre, el servicio, el vehículo y el monto se copian.
      await tx.query(
        `INSERT INTO mgdetailing.comprobantes
           (booking_id, fecha_emision, forma_pago, cliente_nombre, servicio_nombre, vehiculo, monto, notas, creado_por)
         VALUES ($1::uuid, $2::date, $3::text, $4::text, $5::text, $6::text, $7::int, $8::text, $9::uuid)`,
        [
          bookingId,
          contexto.hoy,
          datos.formaPago,
          recortar(str(fila, 'nombre'), 120),
          recortar(str(fila, 'servicio_nombre'), 120),
          recortar(textoDeVehiculo(strOrNull(fila, 'vehiculo_modelo'), str(fila, 'vehiculo_tipo')), 80) || null,
          monto,
          datos.notas,
          contexto.perfilId,
        ],
      );
      const comprobante = await deTurno(tx, bookingId);
      if (!comprobante) throw new Error('El comprobante no se encontró después de emitirlo');
      return { comprobante, creado: true };
    });
  }

  deTurno(bookingId: string): Promise<Comprobante | null> {
    if (!isUuid(bookingId)) return Promise.resolve(null);
    return deTurno(this.sql, bookingId);
  }

  async obtener(id: string): Promise<Comprobante | null> {
    if (!isUuid(id)) return null;
    const { rows } = await this.sql.query(
      `SELECT c.id::text AS id, c.numero, to_char(c.fecha_emision, 'YYYY-MM-DD') AS fecha_emision, c.forma_pago, c.monto,
              c.cliente_nombre, c.servicio_nombre, c.vehiculo, c.notas
       FROM mgdetailing.comprobantes c
       WHERE c.id = $1::uuid`,
      [id],
    );
    const row = rows[0];
    return row ? toComprobante(row) : null;
  }
}
