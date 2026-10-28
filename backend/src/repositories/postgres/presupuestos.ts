import type { SqlClient } from '../../db/postgres.js';
import { type Row, int, isoTimestamp, oneOf, str, strOrNull } from '../../db/rows.js';
import { TurnoInexistenteError } from '../../domain/inventario.js';
import {
  type CambiosPresupuesto,
  ESTADOS_PRESUPUESTO,
  type FiltroPresupuestos,
  type ItemPresupuesto,
  type ListaPresupuestos,
  type NuevoPresupuesto,
  PresupuestoAceptadoError,
  type PresupuestoGuardado,
  type PresupuestoRepository,
} from '../../domain/presupuestos.js';
import { escapeLike } from './bookings.js';
import { isUuid } from './uuid.js';

function toItems(row: Row): ItemPresupuesto[] {
  const valor = row.items;
  if (!Array.isArray(valor)) throw new TypeError('La columna "items" debería ser una lista');
  return valor.map((item: unknown) => {
    const { descripcion, cantidad, precioUnitario } = (item ?? {}) as Record<string, unknown>;
    if (typeof descripcion !== 'string' || typeof cantidad !== 'number' || typeof precioUnitario !== 'number') {
      throw new TypeError('Un ítem del presupuesto tiene un formato inesperado');
    }
    return { descripcion, cantidad, precioUnitario };
  });
}

function toPresupuesto(row: Row): PresupuestoGuardado {
  const creadoPorId = strOrNull(row, 'creado_por');
  return {
    id: str(row, 'id'),
    numero: int(row, 'numero'),
    clienteNombre: str(row, 'cliente_nombre'),
    clienteTelefono: strOrNull(row, 'cliente_telefono'),
    vehiculo: strOrNull(row, 'vehiculo'),
    items: toItems(row),
    descuento: int(row, 'descuento'),
    total: int(row, 'total'),
    validezDias: int(row, 'validez_dias'),
    estado: oneOf(ESTADOS_PRESUPUESTO, row, 'estado'),
    notas: strOrNull(row, 'notas'),
    turnoId: strOrNull(row, 'turno_id'),
    creadoPor: creadoPorId === null ? null : { id: creadoPorId, nombre: str(row, 'creado_por_nombre') },
    createdAt: isoTimestamp(row, 'created_at'),
    updatedAt: isoTimestamp(row, 'updated_at'),
  };
}

/** Los ítems con las claves exactas, en el orden del contrato, listos para el jsonb. */
function itemsJson(items: readonly ItemPresupuesto[]): string {
  return JSON.stringify(
    items.map((item) => ({
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
    })),
  );
}

async function verificarTurno(sql: SqlClient, turnoId: string | null | undefined): Promise<void> {
  if (turnoId === null || turnoId === undefined) return;
  const { rows } = await sql.query('SELECT 1 AS ok FROM mgdetailing.bookings WHERE id = $1::uuid', [turnoId]);
  if (rows.length === 0) throw new TurnoInexistenteError();
}

/** Presupuestos sobre Postgres. Todo con parámetros; los comodines de la búsqueda van escapados. */
export class PostgresPresupuestoRepository implements PresupuestoRepository {
  constructor(private readonly sql: SqlClient) {}

  async listar(filtro: FiltroPresupuestos): Promise<ListaPresupuestos> {
    // Texto: mgdetailing.texto_busqueda (minúsculas y sin acentos) a los dos lados del LIKE; el código (P-0007) se
    // arma en SQL con el mismo formato que el de la API.
    const patron = filtro.q === undefined ? null : `%${escapeLike(filtro.q)}%`;
    const estado = filtro.estado ?? null;
    const [conteo, lista] = await Promise.all([
      this.sql.query(
        `SELECT count(*)::int AS total
         FROM mgdetailing.presupuestos p
         WHERE ($1::text IS NULL OR p.estado = $1::text)
           AND ($2::text IS NULL
                OR mgdetailing.texto_busqueda(p.cliente_nombre) LIKE mgdetailing.texto_busqueda($2::text) ESCAPE '\\'
                OR mgdetailing.texto_busqueda(coalesce(p.vehiculo, '')) LIKE mgdetailing.texto_busqueda($2::text) ESCAPE '\\'
                OR lower('P-' || lpad(p.numero::text, 4, '0')) LIKE lower($2::text) ESCAPE '\\'
                OR lower('P-' || p.numero::text) LIKE lower($2::text) ESCAPE '\\')`,
        [estado, patron],
      ),
      this.sql.query(
        `SELECT p.id::text AS id, p.numero, p.cliente_nombre, p.cliente_telefono, p.vehiculo, p.items, p.descuento, p.total,
                p.validez_dias::int AS validez_dias, p.estado, p.notas, p.turno_id::text AS turno_id,
                p.creado_por::text AS creado_por,
                coalesce(nullif(btrim(pf.nombre), ''), 'Sin nombre') AS creado_por_nombre,
                p.created_at, p.updated_at
         FROM mgdetailing.presupuestos p
         LEFT JOIN mgdetailing.perfiles pf ON pf.id = p.creado_por
         WHERE ($1::text IS NULL OR p.estado = $1::text)
           AND ($2::text IS NULL
                OR mgdetailing.texto_busqueda(p.cliente_nombre) LIKE mgdetailing.texto_busqueda($2::text) ESCAPE '\\'
                OR mgdetailing.texto_busqueda(coalesce(p.vehiculo, '')) LIKE mgdetailing.texto_busqueda($2::text) ESCAPE '\\'
                OR lower('P-' || lpad(p.numero::text, 4, '0')) LIKE lower($2::text) ESCAPE '\\'
                OR lower('P-' || p.numero::text) LIKE lower($2::text) ESCAPE '\\')
         ORDER BY p.numero DESC
         LIMIT $3::int OFFSET $4::int`,
        [estado, patron, filtro.limit, filtro.offset],
      ),
    ]);
    const fila = conteo.rows[0];
    if (!fila) throw new Error('El conteo de presupuestos no devolvió fila');
    return { presupuestos: lista.rows.map(toPresupuesto), total: int(fila, 'total') };
  }

  async obtener(id: string): Promise<PresupuestoGuardado | null> {
    if (!isUuid(id)) return null;
    const { rows } = await this.sql.query(
      `SELECT p.id::text AS id, p.numero, p.cliente_nombre, p.cliente_telefono, p.vehiculo, p.items, p.descuento, p.total,
              p.validez_dias::int AS validez_dias, p.estado, p.notas, p.turno_id::text AS turno_id,
              p.creado_por::text AS creado_por,
              coalesce(nullif(btrim(pf.nombre), ''), 'Sin nombre') AS creado_por_nombre,
              p.created_at, p.updated_at
       FROM mgdetailing.presupuestos p
       LEFT JOIN mgdetailing.perfiles pf ON pf.id = p.creado_por
       WHERE p.id = $1::uuid`,
      [id],
    );
    const row = rows[0];
    return row ? toPresupuesto(row) : null;
  }

  crear(nuevo: NuevoPresupuesto, ahora: Date): Promise<PresupuestoGuardado> {
    return this.sql.transaction(async (tx) => {
      await verificarTurno(tx, nuevo.turnoId);
      const { rows } = await tx.query(
        `WITH p AS (
           INSERT INTO mgdetailing.presupuestos
             (cliente_nombre, cliente_telefono, vehiculo, items, descuento, total, validez_dias, notas, turno_id, creado_por, created_at, updated_at)
           VALUES ($1::text, $2::text, $3::text, $4::jsonb, $5::int, $6::int, $7::smallint, $8::text, $9::uuid, $10::uuid, $11::timestamptz, $11::timestamptz)
           RETURNING *
         )
         SELECT p.id::text AS id, p.numero, p.cliente_nombre, p.cliente_telefono, p.vehiculo, p.items, p.descuento, p.total,
                p.validez_dias::int AS validez_dias, p.estado, p.notas, p.turno_id::text AS turno_id,
                p.creado_por::text AS creado_por,
                coalesce(nullif(btrim(pf.nombre), ''), 'Sin nombre') AS creado_por_nombre,
                p.created_at, p.updated_at
         FROM p
         LEFT JOIN mgdetailing.perfiles pf ON pf.id = p.creado_por`,
        [
          nuevo.clienteNombre,
          nuevo.clienteTelefono,
          nuevo.vehiculo,
          itemsJson(nuevo.items),
          nuevo.descuento,
          nuevo.total,
          nuevo.validezDias,
          nuevo.notas,
          nuevo.turnoId,
          nuevo.creadoPor,
          ahora.toISOString(),
        ],
      );
      const row = rows[0];
      if (!row) throw new Error('El alta del presupuesto no devolvió fila');
      return toPresupuesto(row);
    });
  }

  actualizar(
    id: string,
    cambiosPedidos: CambiosPresupuesto,
    ahora: Date,
    recalcularTotal?: (items: ItemPresupuesto[], descuento: number) => number,
  ): Promise<PresupuestoGuardado | null> {
    if (!isUuid(id)) return Promise.resolve(null);
    return this.sql.transaction(async (tx) => {
      const cambios: CambiosPresupuesto = { ...cambiosPedidos };
      if (recalcularTotal !== undefined && (cambios.items !== undefined || cambios.descuento !== undefined)) {
        const actual = await tx.query(
          'SELECT items, descuento FROM mgdetailing.presupuestos WHERE id = $1::uuid FOR UPDATE',
          [id],
        );
        const fila = actual.rows[0];
        if (!fila) return null;
        cambios.total = recalcularTotal(cambios.items ?? toItems(fila), cambios.descuento ?? int(fila, 'descuento'));
      }
      await verificarTurno(tx, cambios.turnoId);
      const { rows } = await tx.query(
        `WITH p AS (
           UPDATE mgdetailing.presupuestos
           SET cliente_nombre = coalesce($2::text, cliente_nombre),
               cliente_telefono = CASE WHEN $3::boolean THEN $4::text ELSE cliente_telefono END,
               vehiculo = CASE WHEN $5::boolean THEN $6::text ELSE vehiculo END,
               items = coalesce($7::jsonb, items),
               descuento = coalesce($8::int, descuento),
               total = coalesce($9::int, total),
               validez_dias = coalesce($10::smallint, validez_dias),
               estado = coalesce($11::text, estado),
               notas = CASE WHEN $12::boolean THEN $13::text ELSE notas END,
               turno_id = CASE WHEN $14::boolean THEN $15::uuid ELSE turno_id END,
               updated_at = $16::timestamptz
           WHERE id = $1::uuid
           RETURNING *
         )
         SELECT p.id::text AS id, p.numero, p.cliente_nombre, p.cliente_telefono, p.vehiculo, p.items, p.descuento, p.total,
                p.validez_dias::int AS validez_dias, p.estado, p.notas, p.turno_id::text AS turno_id,
                p.creado_por::text AS creado_por,
                coalesce(nullif(btrim(pf.nombre), ''), 'Sin nombre') AS creado_por_nombre,
                p.created_at, p.updated_at
         FROM p
         LEFT JOIN mgdetailing.perfiles pf ON pf.id = p.creado_por`,
        [
          id,
          cambios.clienteNombre ?? null,
          cambios.clienteTelefono !== undefined,
          cambios.clienteTelefono ?? null,
          cambios.vehiculo !== undefined,
          cambios.vehiculo ?? null,
          cambios.items === undefined ? null : itemsJson(cambios.items),
          cambios.descuento ?? null,
          cambios.total ?? null,
          cambios.validezDias ?? null,
          cambios.estado ?? null,
          cambios.notas !== undefined,
          cambios.notas ?? null,
          cambios.turnoId !== undefined,
          cambios.turnoId ?? null,
          ahora.toISOString(),
        ],
      );
      const row = rows[0];
      return row ? toPresupuesto(row) : null;
    });
  }

  async borrar(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    // Un presupuesto aceptado no se borra: el WHERE lo garantiza aunque dos pedidos lleguen a la vez.
    const { rowCount } = await this.sql.query(
      "DELETE FROM mgdetailing.presupuestos WHERE id = $1::uuid AND estado <> 'aceptado'",
      [id],
    );
    if (rowCount > 0) return true;
    const { rows } = await this.sql.query('SELECT 1 AS ok FROM mgdetailing.presupuestos WHERE id = $1::uuid', [id]);
    if (rows.length > 0) throw new PresupuestoAceptadoError();
    return false;
  }
}
