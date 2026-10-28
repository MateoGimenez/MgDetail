import type { SqlClient } from '../../db/postgres.js';
import { type Row, int, isoTimestamp, oneOf, str, strOrNull } from '../../db/rows.js';
import {
  CATEGORIAS_GASTO,
  type CambiosGasto,
  type FiltroGastos,
  type Gasto,
  type GastoRepository,
  GastoDeInventarioError,
  type ListaGastos,
  type NuevoGasto,
  ORIGENES_GASTO,
} from '../../domain/gastos.js';
import { escapeLike } from './bookings.js';
import { isUuid } from './uuid.js';

function toGasto(row: Row): Gasto {
  const creadoPorId = strOrNull(row, 'creado_por');
  return {
    id: str(row, 'id'),
    fecha: str(row, 'fecha'),
    categoria: oneOf(CATEGORIAS_GASTO, row, 'categoria'),
    descripcion: str(row, 'descripcion'),
    monto: int(row, 'monto'),
    proveedor: strOrNull(row, 'proveedor'),
    origen: oneOf(ORIGENES_GASTO, row, 'origen'),
    creadoPor: creadoPorId === null ? null : { id: creadoPorId, nombre: str(row, 'creado_por_nombre') },
    createdAt: isoTimestamp(row, 'created_at'),
    updatedAt: isoTimestamp(row, 'updated_at'),
  };
}

/**
 * Crea un gasto con el cliente que se le pase: sirve dentro de la transacción de quien llama (por ejemplo, una compra
 * de inventario que crea su gasto junto con el movimiento de stock). Todo con parámetros.
 */
export async function crearGasto(sql: SqlClient, nuevo: NuevoGasto): Promise<Gasto> {
  const { rows } = await sql.query(
    `WITH g AS (
       INSERT INTO mgdetailing.gastos (fecha, categoria, descripcion, monto, proveedor, origen, creado_por)
       VALUES ($1::date, $2::text, $3::text, $4::int, $5::text, $6::text, $7::uuid)
       RETURNING id, fecha, categoria, descripcion, monto, proveedor, origen, creado_por, created_at, updated_at
     )
     SELECT g.id::text AS id, to_char(g.fecha, 'YYYY-MM-DD') AS fecha, g.categoria, g.descripcion, g.monto::int AS monto,
            g.proveedor, g.origen, g.creado_por::text AS creado_por,
            coalesce(nullif(btrim(p.nombre), ''), 'Sin nombre') AS creado_por_nombre,
            g.created_at, g.updated_at
     FROM g
     LEFT JOIN mgdetailing.perfiles p ON p.id = g.creado_por`,
    [nuevo.fecha, nuevo.categoria, nuevo.descripcion, nuevo.monto, nuevo.proveedor, nuevo.origen, nuevo.creadoPor],
  );
  const row = rows[0];
  if (!row) throw new Error('El alta del gasto no devolvió fila');
  return toGasto(row);
}

/** Gastos sobre Postgres. Las sumas se agregan en la base (nunca se traen todas las filas para sumar). */
export class PostgresGastoRepository implements GastoRepository {
  constructor(private readonly sql: SqlClient) {}

  async listar(filtro: FiltroGastos): Promise<ListaGastos> {
    // Texto: mgdetailing.texto_busqueda (minúsculas y sin acentos) a los dos lados del LIKE; los comodines vienen
    // escapados (escapeLike) y el ESCAPE es explícito.
    const patron = filtro.q === undefined ? null : `%${escapeLike(filtro.q)}%`;
    const desde = filtro.desde ?? null;
    const hasta = filtro.hasta ?? null;
    const categoria = filtro.categoria ?? null;

    const [resumen, lista] = await Promise.all([
      this.sql.query(
        `SELECT count(*)::int AS total, coalesce(sum(g.monto), 0)::float8 AS suma
         FROM mgdetailing.gastos g
         WHERE ($1::date IS NULL OR g.fecha >= $1::date)
           AND ($2::date IS NULL OR g.fecha <= $2::date)
           AND ($3::text IS NULL OR g.categoria = $3::text)
           AND ($4::text IS NULL
                OR mgdetailing.texto_busqueda(g.descripcion) LIKE mgdetailing.texto_busqueda($4::text) ESCAPE '\\'
                OR mgdetailing.texto_busqueda(g.proveedor) LIKE mgdetailing.texto_busqueda($4::text) ESCAPE '\\')`,
        [desde, hasta, categoria, patron],
      ),
      this.sql.query(
        `SELECT g.id::text AS id, to_char(g.fecha, 'YYYY-MM-DD') AS fecha, g.categoria, g.descripcion, g.monto::int AS monto,
                g.proveedor, g.origen, g.creado_por::text AS creado_por,
                coalesce(nullif(btrim(p.nombre), ''), 'Sin nombre') AS creado_por_nombre,
                g.created_at, g.updated_at
         FROM mgdetailing.gastos g
         LEFT JOIN mgdetailing.perfiles p ON p.id = g.creado_por
         WHERE ($1::date IS NULL OR g.fecha >= $1::date)
           AND ($2::date IS NULL OR g.fecha <= $2::date)
           AND ($3::text IS NULL OR g.categoria = $3::text)
           AND ($4::text IS NULL
                OR mgdetailing.texto_busqueda(g.descripcion) LIKE mgdetailing.texto_busqueda($4::text) ESCAPE '\\'
                OR mgdetailing.texto_busqueda(g.proveedor) LIKE mgdetailing.texto_busqueda($4::text) ESCAPE '\\')
         ORDER BY g.fecha DESC, g.created_at DESC, g.id
         LIMIT $5::int OFFSET $6::int`,
        [desde, hasta, categoria, patron, filtro.limit, filtro.offset],
      ),
    ]);
    const fila = resumen.rows[0];
    if (!fila) throw new Error('La suma de gastos no devolvió fila');
    return { gastos: lista.rows.map(toGasto), total: int(fila, 'total'), suma: int(fila, 'suma') };
  }

  crear(nuevo: NuevoGasto): Promise<Gasto> {
    return crearGasto(this.sql, nuevo);
  }

  async actualizar(id: string, cambios: CambiosGasto, ahora: Date): Promise<Gasto | null> {
    if (!isUuid(id)) return null;
    // Solo los gastos manuales: el WHERE lo garantiza aunque dos pedidos lleguen a la vez.
    const { rows } = await this.sql.query(
      `WITH g AS (
         UPDATE mgdetailing.gastos
         SET fecha = coalesce($2::date, fecha),
             categoria = coalesce($3::text, categoria),
             descripcion = coalesce($4::text, descripcion),
             monto = coalesce($5::int, monto),
             proveedor = CASE WHEN $6::boolean THEN $7::text ELSE proveedor END,
             updated_at = $8::timestamptz
         WHERE id = $1::uuid AND origen = 'manual'
         RETURNING id, fecha, categoria, descripcion, monto, proveedor, origen, creado_por, created_at, updated_at
       )
       SELECT g.id::text AS id, to_char(g.fecha, 'YYYY-MM-DD') AS fecha, g.categoria, g.descripcion, g.monto::int AS monto,
              g.proveedor, g.origen, g.creado_por::text AS creado_por,
              coalesce(nullif(btrim(p.nombre), ''), 'Sin nombre') AS creado_por_nombre,
              g.created_at, g.updated_at
       FROM g
       LEFT JOIN mgdetailing.perfiles p ON p.id = g.creado_por`,
      [
        id,
        cambios.fecha ?? null,
        cambios.categoria ?? null,
        cambios.descripcion ?? null,
        cambios.monto ?? null,
        cambios.proveedor !== undefined,
        cambios.proveedor ?? null,
        ahora.toISOString(),
      ],
    );
    const row = rows[0];
    if (row) return toGasto(row);
    // No se actualizó nada: o no existe o es de inventario.
    if (await this.existe(id)) throw new GastoDeInventarioError();
    return null;
  }

  async borrar(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const { rowCount } = await this.sql.query(
      "DELETE FROM mgdetailing.gastos WHERE id = $1::uuid AND origen = 'manual'",
      [id],
    );
    if (rowCount > 0) return true;
    if (await this.existe(id)) throw new GastoDeInventarioError();
    return false;
  }

  private async existe(id: string): Promise<boolean> {
    const { rows } = await this.sql.query('SELECT 1 AS ok FROM mgdetailing.gastos WHERE id = $1::uuid', [id]);
    return rows.length > 0;
  }
}
