import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyPostgresSchema } from '../src/db/postgres.js';
import { createPgliteDatabase, MIGRATIONS_DIR, SUPABASE_STUB, migrationFiles } from './pglite.js';

/*
 * Migraciones de inventario (20261028110000) y de presupuestos y comprobantes (20261028120000) sobre una base que YA
 * tiene datos, más los permisos mínimos de mgdetailing_app y las defensas de la base (CHECK, FK, RLS).
 */

const INVENTARIO = '20261028110000_inventario.sql';
const DOCUMENTOS = '20261028120000_presupuestos_comprobantes.sql';
const abiertas: PGlite[] = [];
afterEach(async () => {
  for (const pg of abiertas.splice(0)) if (!pg.closed) await pg.close();
});

const leer = (file: string) => readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

async function baseAntes(): Promise<PGlite> {
  const pg = await PGlite.create();
  abiertas.push(pg);
  // eslint-disable-next-line no-restricted-syntax -- constante del propio test
  await pg.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    if (file >= INVENTARIO) continue;
    // eslint-disable-next-line no-restricted-syntax -- migraciones versionadas
    await pg.exec(leer(file));
  }
  return pg;
}

describe('migraciones de inventario y documentos sobre una base con datos', () => {
  it('no tocan turnos, catálogo, perfiles ni gastos existentes y crean las tablas vacías', async () => {
    const pg = await baseAntes();
    await pg.query("INSERT INTO auth.users (email) VALUES ('ana@t.test')");
    await pg.exec(
      `INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja, estado, monto)
       VALUES ('Cliente', '12345678', 'auto', 'pulido', '2026-09-01', 'manana', 'completado', 5000);
       INSERT INTO mgdetailing.gastos (fecha, categoria, descripcion, monto) VALUES ('2026-09-01', 'otros', 'Algo', 100);
       UPDATE mgdetailing.bookings SET updated_at = '2026-09-02T10:00:00Z';`,
    );
    // eslint-disable-next-line no-restricted-syntax -- migraciones versionadas
    await pg.exec(leer(INVENTARIO));
    // eslint-disable-next-line no-restricted-syntax -- migraciones versionadas
    await pg.exec(leer(DOCUMENTOS));
    const b = await pg.query<{ updated_at: Date; monto: number }>('SELECT updated_at, monto FROM mgdetailing.bookings');
    expect(b.rows.map((r) => [r.updated_at.toISOString(), r.monto])).toEqual([['2026-09-02T10:00:00.000Z', 5000]]);
    expect((await pg.query('SELECT count(*)::int AS n FROM mgdetailing.gastos')).rows[0]).toEqual({ n: 1 });
    for (const tabla of ['insumos', 'movimientos_stock', 'presupuestos', 'comprobantes']) {
      // eslint-disable-next-line no-restricted-syntax -- nombre de tabla fijo del propio test
      expect((await pg.query(`SELECT count(*)::int AS n FROM mgdetailing.${tabla}`)).rows[0]).toEqual({ n: 0 });
    }
    const rls = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'mgdetailing'::regnamespace AND relname IN ('insumos','movimientos_stock','presupuestos','comprobantes') ORDER BY relname",
    );
    expect(rls.rows.map((r) => r.relrowsecurity)).toEqual([true, true, true, true]);
  });

  it('verifyPostgresSchema exige las tablas nuevas', async () => {
    const db = await createPgliteDatabase();
    await expect(verifyPostgresSchema(db.appSql)).resolves.toBeUndefined();
    await db.sql.query('DROP TABLE mgdetailing.movimientos_stock');
    await db.sql.query('DROP TABLE mgdetailing.insumos');
    await expect(verifyPostgresSchema(db.appSql)).rejects.toThrow(/inventario.*insumos/s);
    await db.close();
  });
});

describe('permisos mínimos y defensas de la base', () => {
  it('mgdetailing_app: movimientos y comprobantes no se editan ni se borran; insumos no se borran; anon/authenticated/service_role no acceden', async () => {
    const db = await createPgliteDatabase();
    const { rows } = await db.sql.query("INSERT INTO mgdetailing.insumos (nombre, unidad) VALUES ('X', 'kg') RETURNING id::text AS id");
    const id = String(rows[0]?.id);
    await db.sql.query("INSERT INTO mgdetailing.movimientos_stock (insumo_id, tipo, cantidad) VALUES ($1::uuid, 'compra', 1)", [id]);
    await expect(db.appSql.query('UPDATE mgdetailing.movimientos_stock SET cantidad = 5')).rejects.toThrow(/permission denied/);
    await expect(db.appSql.query('DELETE FROM mgdetailing.movimientos_stock')).rejects.toThrow(/permission denied/);
    await expect(db.appSql.query('DELETE FROM mgdetailing.insumos')).rejects.toThrow(/permission denied/);
    await expect(db.appSql.query('UPDATE mgdetailing.insumos SET id = gen_random_uuid()')).rejects.toThrow(/permission denied/);
    await expect(db.appSql.query('UPDATE mgdetailing.comprobantes SET monto = 1')).rejects.toThrow(/permission denied/);
    await expect(db.appSql.query('DELETE FROM mgdetailing.comprobantes')).rejects.toThrow(/permission denied/);
    await expect(db.appSql.query('UPDATE mgdetailing.presupuestos SET id = gen_random_uuid()')).rejects.toThrow(/permission denied/);
    for (const rol of ['anon', 'authenticated', 'service_role']) {
      for (const tabla of ['insumos', 'movimientos_stock', 'presupuestos', 'comprobantes']) {
        // eslint-disable-next-line no-restricted-syntax -- rol fijo del propio test
        await db.pg.exec(`SET ROLE ${rol}`);
        // eslint-disable-next-line no-restricted-syntax -- tabla fija del propio test
        await expect(db.sql.query(`SELECT 1 FROM mgdetailing.${tabla}`)).rejects.toThrow();
        await db.pg.exec('RESET ROLE');
      }
    }
    await db.close();
  });

  it('CHECK de insumos y movimientos: stock negativo, unidad, signo por tipo y costo solo en compras', async () => {
    const db = await createPgliteDatabase();
    const { rows } = await db.sql.query("INSERT INTO mgdetailing.insumos (nombre, unidad, stock) VALUES ('X', 'kg', 1) RETURNING id::text AS id");
    const id = String(rows[0]?.id);
    await expect(db.appSql.query("INSERT INTO mgdetailing.insumos (nombre, unidad, stock) VALUES ('Y', 'kg', -1)")).rejects.toThrow();
    await expect(db.appSql.query("INSERT INTO mgdetailing.insumos (nombre, unidad) VALUES ('Y', 'galon')")).rejects.toThrow();
    await expect(db.appSql.query("INSERT INTO mgdetailing.insumos (nombre, unidad) VALUES ('x', 'kg')")).rejects.toThrow(); // nombre repetido entre activos
    for (const [tipo, cantidad] of [['compra', -1], ['compra', 0], ['uso', 1], ['uso', 0], ['ajuste', 0]] as const) {
      await expect(
        db.appSql.query('INSERT INTO mgdetailing.movimientos_stock (insumo_id, tipo, cantidad) VALUES ($1::uuid, $2, $3)', [id, tipo, cantidad]),
      ).rejects.toThrow();
    }
    await expect(
      db.appSql.query("INSERT INTO mgdetailing.movimientos_stock (insumo_id, tipo, cantidad, costo_total) VALUES ($1::uuid, 'uso', -1, 5)", [id]),
    ).rejects.toThrow();
    await expect(db.appSql.query("INSERT INTO mgdetailing.movimientos_stock (insumo_id, tipo, cantidad, nota) VALUES ($1::uuid, 'ajuste', -1, $2)", [id, 'n'.repeat(201)])).rejects.toThrow();
    await db.close();
  });

  it('FK: borrar un turno vinculado deja el movimiento (turno_id en null); el insumo con historial no se borra', async () => {
    const db = await createPgliteDatabase();
    const t = await db.sql.query(
      "INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja) VALUES ('C', '12345678', 'auto', 'pulido', '2026-10-20', 'manana') RETURNING id::text AS id",
    );
    const i = await db.sql.query("INSERT INTO mgdetailing.insumos (nombre, unidad) VALUES ('X', 'kg') RETURNING id::text AS id");
    await db.sql.query("INSERT INTO mgdetailing.movimientos_stock (insumo_id, tipo, cantidad, turno_id) VALUES ($1::uuid, 'ajuste', 2, $2::uuid)", [i.rows[0]?.id, t.rows[0]?.id]);
    await db.sql.query('DELETE FROM mgdetailing.bookings');
    expect((await db.sql.query('SELECT turno_id FROM mgdetailing.movimientos_stock')).rows[0]?.turno_id).toBeNull();
    await expect(db.sql.query('DELETE FROM mgdetailing.insumos')).rejects.toThrow();
    await db.close();
  });
});
