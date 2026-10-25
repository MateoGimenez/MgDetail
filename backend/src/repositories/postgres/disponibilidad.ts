import type { SqlClient } from '../../db/postgres.js';
import { type Row, bool, int, intOrNull, oneOf, str, strOrNull } from '../../db/rows.js';
import { FRANJAS } from '../../domain/booking.js';
import {
  type CupoDia,
  type DiaEspecial,
  type DisponibilidadRepository,
  type HorarioDia,
  type NuevoDiaEspecial,
  type Ocupacion,
  calcularCupos,
} from '../../domain/disponibilidad.js';

function toHorario(row: Row): HorarioDia {
  return {
    dia: int(row, 'dia'),
    abierto: bool(row, 'abierto'),
    cupoManana: int(row, 'cupo_manana'),
    cupoTarde: int(row, 'cupo_tarde'),
  };
}

function toDiaEspecial(row: Row): DiaEspecial {
  return {
    fecha: str(row, 'fecha'),
    abierto: bool(row, 'abierto'),
    cupoManana: intOrNull(row, 'cupo_manana'),
    cupoTarde: intOrNull(row, 'cupo_tarde'),
    motivo: strOrNull(row, 'motivo'),
  };
}

/*
 * Las fechas (date) salen como texto YYYY-MM-DD (to_char) y los smallint como int (::int), para no depender de
 * cómo cada driver convierte los tipos. Las funciones reciben el cliente: sirven dentro de una transacción (el alta
 * pública calcula los cupos del día con la fecha ya bloqueada; ver repositories/postgres/bookings.ts).
 */

/** Lunes a domingo: (dia + 6) % 7 pone el lunes (1) primero y el domingo (0) último. */
async function horario(sql: SqlClient): Promise<HorarioDia[]> {
  const { rows } = await sql.query(
    `SELECT dia::int AS dia, abierto, cupo_manana::int AS cupo_manana, cupo_tarde::int AS cupo_tarde
     FROM mgdetailing.horario_semanal
     ORDER BY (dia + 6) % 7`,
  );
  return rows.map(toHorario);
}

async function especialesEntre(sql: SqlClient, desde: string, hasta: string | null): Promise<DiaEspecial[]> {
  const { rows } = await sql.query(
    `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, abierto, cupo_manana::int AS cupo_manana,
            cupo_tarde::int AS cupo_tarde, motivo
     FROM mgdetailing.dias_especiales
     WHERE fecha >= $1::date AND ($2::date IS NULL OR fecha <= $2::date)
     ORDER BY fecha`,
    [desde, hasta],
  );
  return rows.map(toDiaEspecial);
}

/**
 * Turnos que ocupan cupo: los no cancelados, por fecha y franja de agenda. Mismas expresiones y mismo predicado
 * que el índice parcial bookings_agenda_idx.
 */
async function ocupaciones(sql: SqlClient, desde: string, hasta: string): Promise<Ocupacion[]> {
  const { rows } = await sql.query(
    `SELECT to_char(coalesce(b.fecha_confirmada, b.fecha_preferida), 'YYYY-MM-DD') AS fecha,
            coalesce(b.franja_confirmada, b.franja) AS franja,
            count(*)::int AS ocupados
     FROM mgdetailing.bookings b
     WHERE b.estado <> 'cancelado'
       AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN $1::date AND $2::date
     GROUP BY 1, 2`,
    [desde, hasta],
  );
  return rows.map((row) => ({
    fecha: str(row, 'fecha'),
    franja: oneOf(FRANJAS, row, 'franja'),
    ocupados: int(row, 'ocupados'),
  }));
}

/** Cupos y ocupación de cada día de [desde, hasta]. Recibe el cliente: sirve dentro de una transacción. */
export async function cuposEntre(sql: SqlClient, desde: string, hasta: string): Promise<CupoDia[]> {
  // En serie: dentro de una transacción las consultas van por la misma conexión.
  const semana = await horario(sql);
  const especiales = await especialesEntre(sql, desde, hasta);
  const ocupados = await ocupaciones(sql, desde, hasta);
  return calcularCupos(desde, hasta, semana, especiales, ocupados);
}

/**
 * Disponibilidad sobre Postgres. mgdetailing_app puede leer las dos tablas, actualizar abierto y los cupos del
 * horario semanal (las 7 filas son fijas) y crear, reemplazar y borrar días especiales.
 */
export class PostgresDisponibilidadRepository implements DisponibilidadRepository {
  constructor(private readonly sql: SqlClient) {}

  horarioSemanal(): Promise<HorarioDia[]> {
    return horario(this.sql);
  }

  reemplazarHorario(dias: readonly HorarioDia[]): Promise<HorarioDia[]> {
    return this.sql.transaction(async (sql) => {
      // Una sola sentencia para las 7 filas: unnest de tres arreglos paralelos.
      await sql.query(
        `UPDATE mgdetailing.horario_semanal AS h
         SET abierto = n.abierto, cupo_manana = n.cupo_manana, cupo_tarde = n.cupo_tarde
         FROM unnest($1::smallint[], $2::boolean[], $3::smallint[], $4::smallint[])
              AS n(dia, abierto, cupo_manana, cupo_tarde)
         WHERE h.dia = n.dia`,
        [
          dias.map((d) => d.dia),
          dias.map((d) => d.abierto),
          dias.map((d) => d.cupoManana),
          dias.map((d) => d.cupoTarde),
        ],
      );
      return horario(sql);
    });
  }

  diasEspeciales(desde: string): Promise<DiaEspecial[]> {
    return especialesEntre(this.sql, desde, null);
  }

  async guardarDiaEspecial(dia: NuevoDiaEspecial): Promise<DiaEspecial> {
    const cupoManana = dia.abierto ? dia.cupoManana : null;
    const cupoTarde = dia.abierto ? dia.cupoTarde : null;
    const { rows } = await this.sql.query(
      `INSERT INTO mgdetailing.dias_especiales AS d (fecha, abierto, cupo_manana, cupo_tarde, motivo)
       VALUES ($1::date, $2::boolean, $3::smallint, $4::smallint, $5::text)
       ON CONFLICT (fecha) DO UPDATE
         SET abierto = excluded.abierto, cupo_manana = excluded.cupo_manana, cupo_tarde = excluded.cupo_tarde,
             motivo = excluded.motivo
       RETURNING to_char(d.fecha, 'YYYY-MM-DD') AS fecha, d.abierto, d.cupo_manana::int AS cupo_manana,
                 d.cupo_tarde::int AS cupo_tarde, d.motivo`,
      [dia.fecha, dia.abierto, cupoManana, cupoTarde, dia.motivo],
    );
    const row = rows[0];
    if (!row) throw new Error('El INSERT del día especial no devolvió la fila');
    return toDiaEspecial(row);
  }

  async borrarDiaEspecial(fecha: string): Promise<boolean> {
    const { rowCount } = await this.sql.query('DELETE FROM mgdetailing.dias_especiales WHERE fecha = $1::date', [fecha]);
    return rowCount > 0;
  }

  cupos(desde: string, hasta: string): Promise<CupoDia[]> {
    return cuposEntre(this.sql, desde, hasta);
  }
}
