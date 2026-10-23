import type { SqlClient } from '../../db/postgres.js';
import { type Row, bool, int, intOrNull, isoTimestamp, str, strOrNull } from '../../db/rows.js';
import {
  type CambiosServicio,
  DestacadoInactivoError,
  type NuevoServicio,
  OrdenInvalidoError,
  type Servicio,
  ServicioExisteError,
  type ServicioRepository,
  type TerminoGlosario,
} from '../../domain/servicios.js';

/** jsonb llega ya parseado (node-postgres y PGlite). Se verifica igual: si la base y el código se desalinean, falla claro. */
function textos(row: Row, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    throw new TypeError(`La columna "${key}" debería ser una lista de textos`);
  }
  return value;
}

function glosario(row: Row, key: string): TerminoGlosario[] {
  const value = row[key];
  if (!Array.isArray(value)) {
    throw new TypeError(`La columna "${key}" debería ser una lista`);
  }
  return value.map((item: unknown) => {
    const { termino, significado } = (item ?? {}) as { termino?: unknown; significado?: unknown };
    if (typeof termino !== 'string' || typeof significado !== 'string') {
      throw new TypeError(`La columna "${key}" tiene un término mal formado`);
    }
    return { termino, significado };
  });
}

function toServicio(row: Row): Servicio {
  return {
    id: str(row, 'id'),
    nombre: str(row, 'nombre'),
    resumen: str(row, 'resumen'),
    descripcion: str(row, 'descripcion'),
    incluye: textos(row, 'incluye'),
    glosario: glosario(row, 'glosario'),
    duracion: strOrNull(row, 'duracion_estimada'),
    precioDesde: intOrNull(row, 'precio_desde'),
    destacado: bool(row, 'destacado'),
    activo: bool(row, 'activo'),
    orden: int(row, 'orden'),
    updatedAt: isoTimestamp(row, 'updated_at'),
  };
}

/** Las listas van como texto JSON con cast ::jsonb (un array de JS, el driver lo mandaría como array de Postgres). */
const jsonOrNull = (value: unknown): string | null => (value === undefined ? null : JSON.stringify(value));

/*
 * Las columnas que se devuelven se repiten literalmente en cada consulta (la regla de ESLint exige SQL literal,
 * sin interpolar).
 *
 * Escrituras: todas en una transacción que empieza con pg_advisory_xact_lock(7340002) (7340001 es el del trigger
 * "nunca sin superadmin"). Así dos cambios simultáneos del catálogo se hacen de a uno: marcar un destacado
 * desmarca al anterior sin chocar con el índice único servicios_un_destacado, y el reordenamiento ve el catálogo
 * completo (nadie crea un servicio en el medio). En READ COMMITTED, cada sentencia posterior al lock ya ve lo que
 * confirmó la transacción anterior.
 */

/**
 * Catálogo de servicios sobre Postgres (esquema mgdetailing). mgdetailing_app puede leerlo, insertar y actualizar
 * por columna (nunca el id ni created_at) y no puede borrar: un servicio se desactiva.
 */
export class PostgresServicioRepository implements ServicioRepository {
  constructor(private readonly sql: SqlClient) {}

  list(options: { soloActivos?: boolean } = {}): Promise<Servicio[]> {
    return listar(this.sql, options.soloActivos ?? false);
  }

  async findById(id: string): Promise<Servicio | undefined> {
    const { rows } = await this.sql.query(
      `SELECT id, nombre, resumen, descripcion, incluye, glosario, duracion_estimada, precio_desde, destacado, activo,
              orden, updated_at
       FROM mgdetailing.servicios
       WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    return row ? toServicio(row) : undefined;
  }

  create(nuevo: NuevoServicio, now: Date): Promise<Servicio> {
    // La ruta ya lo rechaza (schemas/servicios.ts); acá por si el repositorio se usa desde otro lado.
    if (nuevo.destacado && !nuevo.activo) return Promise.reject(new DestacadoInactivoError());
    const timestamp = now.toISOString();
    return this.sql.transaction(async (sql) => {
      await sql.query('SELECT pg_catalog.pg_advisory_xact_lock(7340002)');
      if (nuevo.destacado) {
        await sql.query(
          'UPDATE mgdetailing.servicios SET destacado = false, updated_at = $1::timestamptz WHERE destacado',
          [timestamp],
        );
      }
      // Al final del orden. ON CONFLICT DO NOTHING: un id repetido no aborta con error, devuelve 0 filas.
      const { rows } = await sql.query(
        `INSERT INTO mgdetailing.servicios (
           id, nombre, resumen, descripcion, incluye, glosario, duracion_estimada, precio_desde, destacado, activo,
           orden, updated_at
         )
         SELECT $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::integer, $9::boolean, $10::boolean,
                coalesce(max(orden), 0) + 10, $11::timestamptz
         FROM mgdetailing.servicios
         ON CONFLICT (id) DO NOTHING
         RETURNING id, nombre, resumen, descripcion, incluye, glosario, duracion_estimada, precio_desde, destacado,
                   activo, orden, updated_at`,
        [
          nuevo.id,
          nuevo.nombre,
          nuevo.resumen,
          nuevo.descripcion,
          JSON.stringify(nuevo.incluye),
          JSON.stringify(nuevo.glosario),
          nuevo.duracion,
          nuevo.precioDesde,
          nuevo.destacado,
          nuevo.activo,
          timestamp,
        ],
      );
      const row = rows[0];
      // Lanzar dentro de la transacción la revierte (también el "desmarcar al anterior").
      if (!row) throw new ServicioExisteError(nuevo.id);
      return toServicio(row);
    });
  }

  update(id: string, cambios: CambiosServicio, now: Date): Promise<Servicio | undefined> {
    const timestamp = now.toISOString();
    return this.sql.transaction(async (sql) => {
      await sql.query('SELECT pg_catalog.pg_advisory_xact_lock(7340002)');
      const existe = await sql.query('SELECT activo FROM mgdetailing.servicios WHERE id = $1', [id]);
      const actual = existe.rows[0];
      if (!actual) return undefined;

      // No se puede destacar un inactivo: ni uno que ya lo está ni uno que se desactiva en el mismo cambio. (Se
      // valida antes de desmarcar al anterior: el error no deja el catálogo sin destacado.)
      const quedaActivo = cambios.activo ?? bool(actual, 'activo');
      if (cambios.destacado === true && !quedaActivo) throw new DestacadoInactivoError();

      if (cambios.destacado === true) {
        await sql.query(
          `UPDATE mgdetailing.servicios SET destacado = false, updated_at = $2::timestamptz
           WHERE destacado AND id <> $1`,
          [id, timestamp],
        );
      }
      // coalesce para los campos que no admiten null; duracion y precioDesde sí (null = "sin confirmar" /
      // "Consultá"): ahí un flag distingue "no viene" de "viene null". Desactivar (activo = false) también
      // desmarca el destacado: un servicio que no se ve en la web no puede ser el destacado.
      const { rows } = await sql.query(
        `UPDATE mgdetailing.servicios
         SET nombre = coalesce($2::text, nombre),
             resumen = coalesce($3::text, resumen),
             descripcion = coalesce($4::text, descripcion),
             incluye = coalesce($5::jsonb, incluye),
             glosario = coalesce($6::jsonb, glosario),
             duracion_estimada = CASE WHEN $7::boolean THEN $8::text ELSE duracion_estimada END,
             precio_desde = CASE WHEN $9::boolean THEN $10::integer ELSE precio_desde END,
             destacado = CASE WHEN $12::boolean IS FALSE THEN false ELSE coalesce($11::boolean, destacado) END,
             activo = coalesce($12::boolean, activo),
             updated_at = $13::timestamptz
         WHERE id = $1
         RETURNING id, nombre, resumen, descripcion, incluye, glosario, duracion_estimada, precio_desde, destacado,
                   activo, orden, updated_at`,
        [
          id,
          cambios.nombre ?? null,
          cambios.resumen ?? null,
          cambios.descripcion ?? null,
          jsonOrNull(cambios.incluye),
          jsonOrNull(cambios.glosario),
          cambios.duracion !== undefined,
          cambios.duracion ?? null,
          cambios.precioDesde !== undefined,
          cambios.precioDesde ?? null,
          cambios.destacado ?? null,
          cambios.activo ?? null,
          timestamp,
        ],
      );
      const row = rows[0];
      return row ? toServicio(row) : undefined;
    });
  }

  reorder(ids: readonly string[], now: Date): Promise<Servicio[]> {
    return this.sql.transaction(async (sql) => {
      await sql.query('SELECT pg_catalog.pg_advisory_xact_lock(7340002)');
      const { rows } = await sql.query('SELECT id FROM mgdetailing.servicios');
      const actuales = new Set(rows.map((row) => str(row, 'id')));
      const pedidos = new Set(ids);
      if (pedidos.size !== ids.length || pedidos.size !== actuales.size || ids.some((id) => !actuales.has(id))) {
        throw new OrdenInvalidoError();
      }
      // orden = posición (desde 1) × 10. Solo se tocan (y cambian de updated_at) las filas que se movieron.
      await sql.query(
        `UPDATE mgdetailing.servicios AS s
         SET orden = n.pos * 10, updated_at = $2::timestamptz
         FROM unnest($1::text[]) WITH ORDINALITY AS n(id, pos)
         WHERE s.id = n.id AND s.orden IS DISTINCT FROM n.pos * 10`,
        [ids, now.toISOString()],
      );
      return listar(sql, false);
    });
  }
}

/**
 * Por `orden` y después por `id` (estable aunque dos tengan el mismo orden; COLLATE "C" para que el desempate no
 * dependa de la configuración regional de la base). Recibe el cliente: sirve dentro de una transacción.
 */
async function listar(sql: SqlClient, soloActivos: boolean): Promise<Servicio[]> {
  const { rows } = soloActivos
    ? await sql.query(
        `SELECT id, nombre, resumen, descripcion, incluye, glosario, duracion_estimada, precio_desde, destacado, activo,
                orden, updated_at
         FROM mgdetailing.servicios
         WHERE activo
         ORDER BY orden, id COLLATE "C"`,
      )
    : await sql.query(
        `SELECT id, nombre, resumen, descripcion, incluye, glosario, duracion_estimada, precio_desde, destacado, activo,
                orden, updated_at
         FROM mgdetailing.servicios
         ORDER BY orden, id COLLATE "C"`,
      );
  return rows.map(toServicio);
}
