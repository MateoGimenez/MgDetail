import type { SqlClient } from '../../db/postgres.js';
import { type Row, bool, int, intOrNull, isoTimestamp, num, oneOf, str, strOrNull } from '../../db/rows.js';
import {
  type CambiosInsumo,
  type ContextoMovimiento,
  type FiltroInsumos,
  type Insumo,
  type InventarioRepository,
  type ListaInsumos,
  type ListaMovimientos,
  type Movimiento,
  type NuevoInsumo,
  NombreDeInsumoRepetidoError,
  type PedidoMovimiento,
  type ResultadoMovimiento,
  STOCK_MAX,
  StockExcedidoError,
  StockInsuficienteError,
  TIPOS_MOVIMIENTO,
  TurnoInexistenteError,
  UNIDADES,
  formatearCantidad,
  redondear2,
} from '../../domain/inventario.js';
import { registrarGastoDeInventario } from '../../services/gastos.js';
import { escapeLike } from './bookings.js';
import { isUuid } from './uuid.js';

/** Claves de los pg_advisory_xact_lock de este módulo (7340001 a 7340003 y los de push ya están en uso). */
const LOCK_STOCK = 7340010;
const LOCK_NOMBRES = 7340011;

function toInsumo(row: Row): Insumo {
  return {
    id: str(row, 'id'),
    nombre: str(row, 'nombre'),
    categoria: strOrNull(row, 'categoria'),
    unidad: oneOf(UNIDADES, row, 'unidad'),
    stock: num(row, 'stock'),
    stockMinimo: num(row, 'stock_minimo'),
    costoUnitario: intOrNull(row, 'costo_unitario'),
    activo: bool(row, 'activo'),
    bajoStock: bool(row, 'bajo_stock'),
    valorEnStock: intOrNull(row, 'valor_en_stock'),
    updatedAt: isoTimestamp(row, 'updated_at'),
  };
}

function toMovimiento(row: Row): Movimiento {
  const perfilId = strOrNull(row, 'perfil_id');
  return {
    id: str(row, 'id'),
    tipo: oneOf(TIPOS_MOVIMIENTO, row, 'tipo'),
    cantidad: num(row, 'cantidad'),
    costoTotal: intOrNull(row, 'costo_total'),
    proveedor: strOrNull(row, 'proveedor'),
    nota: strOrNull(row, 'nota'),
    persona: perfilId === null ? null : { id: perfilId, nombre: str(row, 'persona_nombre') },
    turnoId: strOrNull(row, 'turno_id'),
    createdAt: isoTimestamp(row, 'created_at'),
  };
}

async function leerInsumo(sql: SqlClient, id: string): Promise<Insumo | null> {
  const { rows } = await sql.query(
    `SELECT i.id::text AS id, i.nombre, i.categoria, i.unidad, i.stock::float8 AS stock,
            i.stock_minimo::float8 AS stock_minimo, i.costo_unitario, i.activo,
            (i.stock_minimo > 0 AND i.stock <= i.stock_minimo) AS bajo_stock,
            CASE WHEN i.costo_unitario IS NULL THEN NULL ELSE round(i.stock * i.costo_unitario)::float8 END AS valor_en_stock,
            i.updated_at
     FROM mgdetailing.insumos i
     WHERE i.id = $1::uuid`,
    [id],
  );
  const row = rows[0];
  return row ? toInsumo(row) : null;
}

async function leerMovimiento(sql: SqlClient, id: string): Promise<Movimiento> {
  const { rows } = await sql.query(
    `SELECT m.id::text AS id, m.tipo, m.cantidad::float8 AS cantidad, m.costo_total, m.proveedor, m.nota,
            m.perfil_id::text AS perfil_id,
            coalesce(nullif(btrim(p.nombre), ''), 'Sin nombre') AS persona_nombre,
            m.turno_id::text AS turno_id, m.created_at
     FROM mgdetailing.movimientos_stock m
     LEFT JOIN mgdetailing.perfiles p ON p.id = m.perfil_id
     WHERE m.id = $1::uuid`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error('El movimiento de stock no se encontró después de guardarlo');
  return toMovimiento(row);
}

/** Falla si ya hay OTRO insumo activo con ese nombre (sin distinguir mayúsculas). Siempre con el bloqueo de nombres. */
async function verificarNombreLibre(sql: SqlClient, nombre: string, excepto: string | null): Promise<void> {
  const { rows } = await sql.query(
    `SELECT 1 AS ok FROM mgdetailing.insumos
     WHERE activo AND lower(btrim(nombre)) = lower(btrim($1::text)) AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [nombre, excepto],
  );
  if (rows.length > 0) throw new NombreDeInsumoRepetidoError();
}

/** Insumos y su historial sobre Postgres. El stock y el movimiento cambian juntos, en una transacción. */
export class PostgresInventarioRepository implements InventarioRepository {
  constructor(private readonly sql: SqlClient) {}

  async listar(filtro: FiltroInsumos): Promise<ListaInsumos> {
    // Texto: mgdetailing.texto_busqueda (minúsculas y sin acentos) a los dos lados del LIKE; los comodines vienen
    // escapados (escapeLike) y el ESCAPE es explícito.
    const patron = filtro.q === undefined ? null : `%${escapeLike(filtro.q)}%`;
    const soloBajoStock = filtro.bajoStock === true;

    const [conteo, global, lista] = await Promise.all([
      this.sql.query(
        `SELECT count(*)::int AS total
         FROM mgdetailing.insumos i
         WHERE ($1::text = 'todos' OR i.activo = ($1::text = 'true'))
           AND ($2::text IS NULL
                OR mgdetailing.texto_busqueda(i.nombre) LIKE mgdetailing.texto_busqueda($2::text) ESCAPE '\\'
                OR mgdetailing.texto_busqueda(coalesce(i.categoria, '')) LIKE mgdetailing.texto_busqueda($2::text) ESCAPE '\\')
           AND (NOT $3::boolean OR (i.stock_minimo > 0 AND i.stock <= i.stock_minimo))`,
        [filtro.activo, patron, soloBajoStock],
      ),
      // Todo el inventario activo, sin filtros: el aviso de stock bajo y el valor total.
      this.sql.query(
        `SELECT count(*) FILTER (WHERE i.stock_minimo > 0 AND i.stock <= i.stock_minimo)::int AS bajo_stock,
                coalesce(sum(round(i.stock * i.costo_unitario)) FILTER (WHERE i.costo_unitario IS NOT NULL), 0)::float8 AS valor_total
         FROM mgdetailing.insumos i
         WHERE i.activo`,
      ),
      this.sql.query(
        `SELECT i.id::text AS id, i.nombre, i.categoria, i.unidad, i.stock::float8 AS stock,
                i.stock_minimo::float8 AS stock_minimo, i.costo_unitario, i.activo,
                (i.stock_minimo > 0 AND i.stock <= i.stock_minimo) AS bajo_stock,
                CASE WHEN i.costo_unitario IS NULL THEN NULL ELSE round(i.stock * i.costo_unitario)::float8 END AS valor_en_stock,
                i.updated_at
         FROM mgdetailing.insumos i
         WHERE ($1::text = 'todos' OR i.activo = ($1::text = 'true'))
           AND ($2::text IS NULL
                OR mgdetailing.texto_busqueda(i.nombre) LIKE mgdetailing.texto_busqueda($2::text) ESCAPE '\\'
                OR mgdetailing.texto_busqueda(coalesce(i.categoria, '')) LIKE mgdetailing.texto_busqueda($2::text) ESCAPE '\\')
           AND (NOT $3::boolean OR (i.stock_minimo > 0 AND i.stock <= i.stock_minimo))
         ORDER BY (i.stock_minimo > 0 AND i.stock <= i.stock_minimo) DESC,
                  mgdetailing.texto_busqueda(i.nombre), i.id
         LIMIT $4::int OFFSET $5::int`,
        [filtro.activo, patron, soloBajoStock, filtro.limit, filtro.offset],
      ),
    ]);
    const total = conteo.rows[0];
    const resumen = global.rows[0];
    if (!total || !resumen) throw new Error('El resumen del inventario no devolvió fila');
    return {
      insumos: lista.rows.map(toInsumo),
      total: int(total, 'total'),
      bajoStock: int(resumen, 'bajo_stock'),
      valorTotal: int(resumen, 'valor_total'),
    };
  }

  obtener(id: string): Promise<Insumo | null> {
    if (!isUuid(id)) return Promise.resolve(null);
    return leerInsumo(this.sql, id);
  }

  crear(nuevo: NuevoInsumo, contexto: ContextoMovimiento): Promise<Insumo> {
    return this.sql.transaction(async (tx) => {
      await tx.query('SELECT pg_catalog.pg_advisory_xact_lock($1::int)', [LOCK_NOMBRES]);
      await verificarNombreLibre(tx, nuevo.nombre, null);
      const { rows } = await tx.query(
        `INSERT INTO mgdetailing.insumos (nombre, categoria, unidad, stock, stock_minimo, costo_unitario)
         VALUES ($1::text, $2::text, $3::text, $4::numeric, $5::numeric, $6::int)
         RETURNING id::text AS id`,
        [nuevo.nombre, nuevo.categoria, nuevo.unidad, nuevo.stockInicial, nuevo.stockMinimo, nuevo.costoUnitario],
      );
      const id = str(rows[0] ?? {}, 'id');
      if (nuevo.stockInicial > 0) {
        await tx.query(
          `INSERT INTO mgdetailing.movimientos_stock (insumo_id, tipo, cantidad, nota, perfil_id)
           VALUES ($1::uuid, 'ajuste', $2::numeric, 'Stock inicial', $3::uuid)`,
          [id, nuevo.stockInicial, contexto.perfilId],
        );
      }
      const insumo = await leerInsumo(tx, id);
      if (!insumo) throw new Error('El insumo no se encontró después de crearlo');
      return insumo;
    });
  }

  actualizar(id: string, cambios: CambiosInsumo, ahora: Date): Promise<Insumo | null> {
    if (!isUuid(id)) return Promise.resolve(null);
    return this.sql.transaction(async (tx) => {
      await tx.query('SELECT pg_catalog.pg_advisory_xact_lock($1::int)', [LOCK_NOMBRES]);
      const actual = await tx.query('SELECT nombre, activo FROM mgdetailing.insumos WHERE id = $1::uuid FOR UPDATE', [id]);
      const fila = actual.rows[0];
      if (!fila) return null;
      const nombreFinal = cambios.nombre ?? str(fila, 'nombre');
      const activoFinal = cambios.activo ?? bool(fila, 'activo');
      // Solo cuando queda activo y cambia el nombre o se reactiva puede chocar con otro activo.
      if (activoFinal && (cambios.nombre !== undefined || cambios.activo === true)) {
        await verificarNombreLibre(tx, nombreFinal, id);
      }
      await tx.query(
        `UPDATE mgdetailing.insumos
         SET nombre = coalesce($2::text, nombre),
             categoria = CASE WHEN $3::boolean THEN $4::text ELSE categoria END,
             unidad = coalesce($5::text, unidad),
             stock_minimo = coalesce($6::numeric, stock_minimo),
             costo_unitario = CASE WHEN $7::boolean THEN $8::int ELSE costo_unitario END,
             activo = coalesce($9::boolean, activo),
             updated_at = $10::timestamptz
         WHERE id = $1::uuid`,
        [
          id,
          cambios.nombre ?? null,
          cambios.categoria !== undefined,
          cambios.categoria ?? null,
          cambios.unidad ?? null,
          cambios.stockMinimo ?? null,
          cambios.costoUnitario !== undefined,
          cambios.costoUnitario ?? null,
          cambios.activo ?? null,
          ahora.toISOString(),
        ],
      );
      return leerInsumo(tx, id);
    });
  }

  async listarMovimientos(id: string, limit: number, offset: number): Promise<ListaMovimientos | null> {
    if (!isUuid(id)) return null;
    const existe = await this.sql.query('SELECT 1 AS ok FROM mgdetailing.insumos WHERE id = $1::uuid', [id]);
    if (existe.rows.length === 0) return null;
    const [conteo, lista] = await Promise.all([
      this.sql.query('SELECT count(*)::int AS total FROM mgdetailing.movimientos_stock WHERE insumo_id = $1::uuid', [id]),
      this.sql.query(
        `SELECT m.id::text AS id, m.tipo, m.cantidad::float8 AS cantidad, m.costo_total, m.proveedor, m.nota,
                m.perfil_id::text AS perfil_id,
                coalesce(nullif(btrim(p.nombre), ''), 'Sin nombre') AS persona_nombre,
                m.turno_id::text AS turno_id, m.created_at
         FROM mgdetailing.movimientos_stock m
         LEFT JOIN mgdetailing.perfiles p ON p.id = m.perfil_id
         WHERE m.insumo_id = $1::uuid
         ORDER BY m.created_at DESC, m.id
         LIMIT $2::int OFFSET $3::int`,
        [id, limit, offset],
      ),
    ]);
    const total = conteo.rows[0];
    if (!total) throw new Error('El conteo de movimientos no devolvió fila');
    return { movimientos: lista.rows.map(toMovimiento), total: int(total, 'total') };
  }

  registrarMovimiento(
    id: string,
    pedido: PedidoMovimiento,
    contexto: ContextoMovimiento,
  ): Promise<ResultadoMovimiento | null> {
    if (!isUuid(id)) return Promise.resolve(null);
    return this.sql.transaction(async (tx) => {
      // Un bloqueo por insumo, hasta el COMMIT: dos usos a la vez se ordenan y el segundo ve el stock ya descontado.
      await tx.query('SELECT pg_catalog.pg_advisory_xact_lock($1::int, pg_catalog.hashtext($2::text))', [LOCK_STOCK, id]);
      const actual = await tx.query(
        'SELECT nombre, unidad, stock::float8 AS stock FROM mgdetailing.insumos WHERE id = $1::uuid FOR UPDATE',
        [id],
      );
      const fila = actual.rows[0];
      if (!fila) return null;
      const stock = num(fila, 'stock');
      const unidad = oneOf(UNIDADES, fila, 'unidad');

      let movimientoId: string | null = null;
      if (pedido.tipo === 'uso') {
        if (pedido.turnoId !== null) {
          const turno = await tx.query('SELECT 1 AS ok FROM mgdetailing.bookings WHERE id = $1::uuid', [pedido.turnoId]);
          if (turno.rows.length === 0) throw new TurnoInexistenteError();
        }
        // UPDATE condicional: aunque algo se saltara el bloqueo, nunca resta de más (y el CHECK stock >= 0 es la red).
        const resta = await tx.query(
          'UPDATE mgdetailing.insumos SET stock = stock - $2::numeric WHERE id = $1::uuid AND stock >= $2::numeric',
          [id, pedido.cantidad],
        );
        if (resta.rowCount === 0) throw new StockInsuficienteError(stock, unidad);
        const { rows } = await tx.query(
          `INSERT INTO mgdetailing.movimientos_stock (insumo_id, tipo, cantidad, nota, turno_id, perfil_id)
           VALUES ($1::uuid, 'uso', -$2::numeric, $3::text, $4::uuid, $5::uuid)
           RETURNING id::text AS id`,
          [id, pedido.cantidad, pedido.nota, pedido.turnoId, contexto.perfilId],
        );
        movimientoId = str(rows[0] ?? {}, 'id');
      } else if (pedido.tipo === 'compra') {
        if (redondear2(stock + pedido.cantidad) > STOCK_MAX) throw new StockExcedidoError();
        const costo = pedido.costoTotal !== null && pedido.costoTotal > 0 ? pedido.costoTotal : null;
        let gastoId: string | null = null;
        if (costo !== null) {
          const descripcion = `Compra: ${str(fila, 'nombre')} (${formatearCantidad(pedido.cantidad)} ${unidad})`;
          const gasto = await registrarGastoDeInventario(tx, {
            fecha: contexto.hoy,
            descripcion: Array.from(descripcion).slice(0, 120).join(''),
            monto: costo,
            proveedor: pedido.proveedor,
            creadoPor: contexto.perfilId,
          });
          gastoId = gasto.id;
        }
        await tx.query(
          `UPDATE mgdetailing.insumos
           SET stock = stock + $2::numeric,
               costo_unitario = CASE WHEN $3::int IS NULL THEN costo_unitario ELSE round($3::int::numeric / $2::numeric)::int END
           WHERE id = $1::uuid`,
          [id, pedido.cantidad, costo],
        );
        const { rows } = await tx.query(
          `INSERT INTO mgdetailing.movimientos_stock (insumo_id, tipo, cantidad, costo_total, proveedor, nota, gasto_id, perfil_id)
           VALUES ($1::uuid, 'compra', $2::numeric, $3::int, $4::text, $5::text, $6::uuid, $7::uuid)
           RETURNING id::text AS id`,
          [id, pedido.cantidad, costo, pedido.proveedor, pedido.nota, gastoId, contexto.perfilId],
        );
        movimientoId = str(rows[0] ?? {}, 'id');
      } else {
        const diferencia = await tx.query('SELECT ($2::numeric - stock)::float8 AS diferencia FROM mgdetailing.insumos WHERE id = $1::uuid', [
          id,
          pedido.stockReal,
        ]);
        if (num(diferencia.rows[0] ?? {}, 'diferencia') !== 0) {
          const { rows } = await tx.query(
            `INSERT INTO mgdetailing.movimientos_stock (insumo_id, tipo, cantidad, nota, perfil_id)
             SELECT i.id, 'ajuste', $2::numeric - i.stock, $3::text, $4::uuid
             FROM mgdetailing.insumos i WHERE i.id = $1::uuid
             RETURNING id::text AS id`,
            [id, pedido.stockReal, pedido.nota, contexto.perfilId],
          );
          movimientoId = str(rows[0] ?? {}, 'id');
          await tx.query('UPDATE mgdetailing.insumos SET stock = $2::numeric WHERE id = $1::uuid', [id, pedido.stockReal]);
        }
      }

      const insumo = await leerInsumo(tx, id);
      if (!insumo) throw new Error('El insumo no se encontró después de moverlo');
      return { insumo, movimiento: movimientoId === null ? null : await leerMovimiento(tx, movimientoId) };
    });
  }
}
