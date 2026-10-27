import type { SqlClient } from '../../db/postgres.js';
import { int, str, strOrNull } from '../../db/rows.js';
import type {
  ConteoPeriodo,
  EstadisticasRepository,
  FilaDiaSemana,
  FilaServicio,
  FilaTrabajador,
  Granularidad,
  MisTrabajos,
  PuntoSerie,
  Rango,
  RangoNombrado,
  Totales,
} from '../../domain/estadisticas.js';

/** Nombre de quien hizo un trabajo cuando no hay persona (nunca se asignó o se borró su usuario). */
export const SIN_ASIGNAR = 'Sin asignar';

/*
 * Estadísticas sobre Postgres. Todo se agrega en la base (GROUP BY / FILTER): no se traen las filas de los turnos.
 * "Fecha de agenda" = coalesce(fecha_confirmada, fecha_preferida), la misma expresión de los índices
 * bookings_agenda_idx y bookings_fecha_agenda_estado_idx (migraciones agenda_fecha_confirmada y
 * estadisticas_cobro_trabajador); es una columna `date`, sin zona horaria: el "día" lo decide el calendario del taller,
 * no el reloj del servidor. Las sumas de monto se castean a float8 (node-postgres devuelve bigint como texto); un
 * entero de hasta 366 turnos de 99.999.999 cabe sobrado en los 53 bits de un double.
 *
 * Las consultas de "mis trabajos" (mis*) no leen la columna monto.
 */
export class PostgresEstadisticasRepository implements EstadisticasRepository {
  constructor(private readonly sql: SqlClient) {}

  async totales(rangos: readonly RangoNombrado[]): Promise<Record<string, Totales>> {
    // Una sola consulta para todos los rangos: unnest de tres arreglos en paralelo y LEFT JOIN, así un rango sin
    // turnos igual devuelve su fila con ceros.
    const { rows } = await this.sql.query(
      `SELECT r.clave, count(b.id)::int AS completados, coalesce(sum(b.monto), 0)::float8 AS ingresos
       FROM unnest($1::text[], $2::date[], $3::date[]) AS r(clave, desde, hasta)
       LEFT JOIN mgdetailing.bookings b
         ON b.estado = 'completado'
        AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN r.desde AND r.hasta
       GROUP BY r.clave`,
      [rangos.map((r) => r.clave), rangos.map((r) => r.desde), rangos.map((r) => r.hasta)],
    );
    const resultado: Record<string, Totales> = {};
    for (const row of rows) {
      resultado[str(row, 'clave')] = { completados: int(row, 'completados'), ingresos: int(row, 'ingresos') };
    }
    return resultado;
  }

  async conteo({ desde, hasta }: Rango): Promise<ConteoPeriodo> {
    const { rows } = await this.sql.query(
      `SELECT count(*)::int AS turnos,
              (count(*) FILTER (WHERE b.estado = 'pendiente'))::int AS pendientes,
              (count(*) FILTER (WHERE b.estado = 'confirmado'))::int AS confirmados,
              (count(*) FILTER (WHERE b.estado = 'completado'))::int AS completados,
              (count(*) FILTER (WHERE b.estado = 'cancelado'))::int AS cancelados,
              coalesce(sum(b.monto) FILTER (WHERE b.estado = 'completado'), 0)::float8 AS ingresos,
              (count(b.monto) FILTER (WHERE b.estado = 'completado'))::int AS completados_con_monto
       FROM mgdetailing.bookings b
       WHERE coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN $1::date AND $2::date`,
      [desde, hasta],
    );
    const row = rows[0];
    if (!row) throw new Error('El conteo del período no devolvió fila');
    return {
      turnos: int(row, 'turnos'),
      pendientes: int(row, 'pendientes'),
      confirmados: int(row, 'confirmados'),
      completados: int(row, 'completados'),
      cancelados: int(row, 'cancelados'),
      ingresos: int(row, 'ingresos'),
      completadosConMonto: int(row, 'completados_con_monto'),
    };
  }

  async serie({ desde, hasta }: Rango, granularidad: Granularidad): Promise<PuntoSerie[]> {
    const { rows } =
      granularidad === 'dia'
        ? await this.sql.query(
            `SELECT to_char(coalesce(b.fecha_confirmada, b.fecha_preferida), 'YYYY-MM-DD') AS clave,
                    count(*)::int AS completados, coalesce(sum(b.monto), 0)::float8 AS ingresos
             FROM mgdetailing.bookings b
             WHERE b.estado = 'completado'
               AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN $1::date AND $2::date
             GROUP BY 1 ORDER BY 1`,
            [desde, hasta],
          )
        : await this.sql.query(
            `SELECT to_char(coalesce(b.fecha_confirmada, b.fecha_preferida), 'YYYY-MM') AS clave,
                    count(*)::int AS completados, coalesce(sum(b.monto), 0)::float8 AS ingresos
             FROM mgdetailing.bookings b
             WHERE b.estado = 'completado'
               AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN $1::date AND $2::date
             GROUP BY 1 ORDER BY 1`,
            [desde, hasta],
          );
    return rows.map((row) => ({
      clave: str(row, 'clave'),
      completados: int(row, 'completados'),
      ingresos: int(row, 'ingresos'),
    }));
  }

  async porServicio({ desde, hasta }: Rango): Promise<FilaServicio[]> {
    // Todos los servicios con LEFT JOIN: uno activo sin pedidos sale con ceros; uno desactivado solo si tuvo pedidos.
    const { rows } = await this.sql.query(
      `SELECT s.id AS servicio_id, s.nombre,
              (count(b.id) FILTER (WHERE b.estado <> 'cancelado'))::int AS pedidos,
              (count(b.id) FILTER (WHERE b.estado = 'completado'))::int AS completados,
              coalesce(sum(b.monto) FILTER (WHERE b.estado = 'completado'), 0)::float8 AS ingresos
       FROM mgdetailing.servicios s
       LEFT JOIN mgdetailing.bookings b
         ON b.servicio_id = s.id
        AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN $1::date AND $2::date
       GROUP BY s.id, s.nombre, s.activo, s.orden
       HAVING s.activo OR count(b.id) FILTER (WHERE b.estado <> 'cancelado') > 0
       ORDER BY pedidos DESC, completados DESC, s.orden, s.id`,
      [desde, hasta],
    );
    return rows.map((row) => ({
      servicioId: str(row, 'servicio_id'),
      nombre: str(row, 'nombre'),
      pedidos: int(row, 'pedidos'),
      completados: int(row, 'completados'),
      ingresos: int(row, 'ingresos'),
    }));
  }

  async porTrabajador({ desde, hasta }: Rango): Promise<FilaTrabajador[]> {
    // LEFT JOIN a perfiles: sin trabajador (o con la persona ya borrada: ON DELETE SET NULL) => "Sin asignar".
    const { rows } = await this.sql.query(
      `SELECT t.id::text AS id,
              CASE WHEN t.id IS NULL THEN $3::text
                   ELSE coalesce(nullif(btrim(t.nombre), ''), t.email, 'Sin nombre') END AS nombre,
              count(*)::int AS completados, coalesce(sum(b.monto), 0)::float8 AS ingresos
       FROM mgdetailing.bookings b
       LEFT JOIN mgdetailing.perfiles t ON t.id = b.trabajador_id
       WHERE b.estado = 'completado'
         AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN $1::date AND $2::date
       GROUP BY t.id, t.nombre, t.email
       ORDER BY completados DESC, (t.id IS NULL), nombre, t.id`,
      [desde, hasta, SIN_ASIGNAR],
    );
    return rows.map((row) => ({
      id: strOrNull(row, 'id'),
      nombre: str(row, 'nombre'),
      completados: int(row, 'completados'),
      ingresos: int(row, 'ingresos'),
    }));
  }

  async porDiaSemana({ desde, hasta }: Rango): Promise<FilaDiaSemana[]> {
    // extract(dow) de una columna date: 0 = domingo ... 6 = sábado, sin zona horaria de por medio.
    const { rows } = await this.sql.query(
      `SELECT extract(dow FROM coalesce(b.fecha_confirmada, b.fecha_preferida))::int AS dia,
              (count(*) FILTER (WHERE coalesce(b.franja_confirmada, b.franja) = 'manana'))::int AS manana,
              (count(*) FILTER (WHERE coalesce(b.franja_confirmada, b.franja) = 'tarde'))::int AS tarde
       FROM mgdetailing.bookings b
       WHERE b.estado <> 'cancelado'
         AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN $1::date AND $2::date
       GROUP BY 1 ORDER BY 1`,
      [desde, hasta],
    );
    return rows.map((row) => ({ dia: int(row, 'dia'), manana: int(row, 'manana'), tarde: int(row, 'tarde') }));
  }

  async misServicios(perfilId: string, { desde, hasta }: Rango): Promise<MisTrabajos['porServicio']> {
    const { rows } = await this.sql.query(
      `SELECT s.id AS servicio_id, s.nombre, count(*)::int AS completados
       FROM mgdetailing.bookings b
       JOIN mgdetailing.servicios s ON s.id = b.servicio_id
       WHERE b.estado = 'completado' AND b.trabajador_id = $3::uuid
         AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN $1::date AND $2::date
       GROUP BY s.id, s.nombre
       ORDER BY completados DESC, s.nombre, s.id`,
      [desde, hasta, perfilId],
    );
    return rows.map((row) => ({
      servicioId: str(row, 'servicio_id'),
      nombre: str(row, 'nombre'),
      completados: int(row, 'completados'),
    }));
  }

  async misSerie(perfilId: string, { desde, hasta }: Rango, granularidad: Granularidad): Promise<MisTrabajos['serie']> {
    const { rows } =
      granularidad === 'dia'
        ? await this.sql.query(
            `SELECT to_char(coalesce(b.fecha_confirmada, b.fecha_preferida), 'YYYY-MM-DD') AS clave, count(*)::int AS completados
             FROM mgdetailing.bookings b
             WHERE b.estado = 'completado' AND b.trabajador_id = $3::uuid
               AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN $1::date AND $2::date
             GROUP BY 1 ORDER BY 1`,
            [desde, hasta, perfilId],
          )
        : await this.sql.query(
            `SELECT to_char(coalesce(b.fecha_confirmada, b.fecha_preferida), 'YYYY-MM') AS clave, count(*)::int AS completados
             FROM mgdetailing.bookings b
             WHERE b.estado = 'completado' AND b.trabajador_id = $3::uuid
               AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN $1::date AND $2::date
             GROUP BY 1 ORDER BY 1`,
            [desde, hasta, perfilId],
          );
    return rows.map((row) => ({ clave: str(row, 'clave'), completados: int(row, 'completados') }));
  }
}
