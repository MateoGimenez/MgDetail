import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, SUPABASE_STUB, migrationFiles } from './pglite.js';

/*
 * Migración 20261101100000_precios_por_vehiculo aplicada sobre una base que YA tiene servicios (como el Supabase de
 * producción): primero se aplican todas las migraciones anteriores, se cargan precios de auto y recién después se
 * aplica la nueva. Tiene que ser aditiva: no toca ninguna fila ni ningún permiso existente.
 */

const NUEVA = '20261101100000_precios_por_vehiculo.sql';
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
    if (file === NUEVA) continue;
    // eslint-disable-next-line no-restricted-syntax -- migraciones versionadas
    await pg.exec(leer(file));
  }
  return pg;
}

// eslint-disable-next-line no-restricted-syntax -- migración versionada
const aplicarNueva = (pg: PGlite) => pg.exec(leer(NUEVA));

interface Fila {
  id: string;
  precio_desde: number | null;
  precio_desde_camioneta: number | null;
  precio_desde_moto: number | null;
  updated_at: Date;
}

describe('migración de precios por vehículo sobre una base con servicios existentes', () => {
  it('se aplica sin tocar las filas: auto queda igual y camioneta/moto en null', async () => {
    expect(migrationFiles()).toContain(NUEVA);
    const pg = await baseAntes();
    await pg.exec(
      "UPDATE mgdetailing.servicios SET precio_desde = 45000 WHERE id = 'pulido'; UPDATE mgdetailing.servicios SET precio_desde = 0 WHERE id = 'encerado'; UPDATE mgdetailing.servicios SET updated_at = '2026-09-02T10:00:00Z';",
    );
    await aplicarNueva(pg);

    const { rows } = await pg.query<Fila>(
      'SELECT id, precio_desde, precio_desde_camioneta, precio_desde_moto, updated_at FROM mgdetailing.servicios ORDER BY orden',
    );
    expect(rows).toHaveLength(5);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.precio_desde]))).toEqual({
      'lavado-basico': null,
      'lavado-premium': null,
      pulido: 45000,
      encerado: 0,
      'restauracion-opticas': null,
    });
    for (const row of rows) {
      expect(row.precio_desde_camioneta).toBeNull();
      expect(row.precio_desde_moto).toBeNull();
      expect(row.updated_at.toISOString()).toBe('2026-09-02T10:00:00.000Z'); // la migración no mueve updated_at
    }
  });

  it('las columnas nuevas son integer nullable sin default, y precio_desde sigue igual', async () => {
    const pg = await baseAntes();
    await aplicarNueva(pg);
    const { rows } = await pg.query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'mgdetailing' AND table_name = 'servicios' AND column_name LIKE 'precio_desde%'
       ORDER BY column_name`,
    );
    expect(rows).toEqual([
      { column_name: 'precio_desde', data_type: 'integer', is_nullable: 'YES', column_default: null },
      { column_name: 'precio_desde_camioneta', data_type: 'integer', is_nullable: 'YES', column_default: null },
      { column_name: 'precio_desde_moto', data_type: 'integer', is_nullable: 'YES', column_default: null },
    ]);
  });

  it('CHECKs: 0 y 99.999.999 pasan; negativo y 100.000.000 no; null pasa; precio_desde conserva su tope', async () => {
    const pg = await baseAntes();
    await aplicarNueva(pg);
    for (const columna of ['precio_desde_camioneta', 'precio_desde_moto']) {
      for (const valor of [0, 99_999_999]) {
        // eslint-disable-next-line no-restricted-syntax -- nombre de columna de una lista fija del propio test
        await pg.query(`UPDATE mgdetailing.servicios SET ${columna} = $1 WHERE id = 'pulido'`, [valor]);
      }
      // eslint-disable-next-line no-restricted-syntax -- idem
      await pg.query(`UPDATE mgdetailing.servicios SET ${columna} = NULL WHERE id = 'pulido'`);
      for (const valor of [-1, 100_000_000]) {
        await expect(
          // eslint-disable-next-line no-restricted-syntax -- idem
          pg.query(`UPDATE mgdetailing.servicios SET ${columna} = $1 WHERE id = 'pulido'`, [valor]),
          `${columna} = ${String(valor)}`,
        ).rejects.toThrow(/servicios_precio_(camioneta|moto)_rango/);
      }
    }
    await expect(pg.query("UPDATE mgdetailing.servicios SET precio_desde = 100000000 WHERE id = 'pulido'")).rejects.toThrow(
      /servicios_precio_tope/,
    );
  });

  it('GRANT mínimo: mgdetailing_app inserta, actualiza y lee las columnas nuevas; anon, authenticated y service_role nada', async () => {
    const pg = await baseAntes();
    await aplicarNueva(pg);
    const priv = async (rol: string, columna: string, permiso: string) =>
      (
        await pg.query<{ ok: boolean }>("SELECT has_column_privilege($1, 'mgdetailing.servicios', $2, $3) AS ok", [rol, columna, permiso])
      ).rows[0]?.ok;
    for (const columna of ['precio_desde_camioneta', 'precio_desde_moto']) {
      for (const permiso of ['SELECT', 'INSERT', 'UPDATE']) expect(await priv('mgdetailing_app', columna, permiso), `${columna} ${permiso}`).toBe(true);
      for (const rol of ['anon', 'authenticated', 'service_role']) {
        for (const permiso of ['SELECT', 'INSERT', 'UPDATE']) expect(await priv(rol, columna, permiso), `${rol} ${columna} ${permiso}`).toBe(false);
      }
    }
    // Nada de lo que ya había cambió: el id y created_at siguen sin UPDATE, y el rol sigue sin DELETE.
    expect(await priv('mgdetailing_app', 'id', 'UPDATE')).toBe(false);
    expect(await priv('mgdetailing_app', 'created_at', 'UPDATE')).toBe(false);
    expect(await priv('mgdetailing_app', 'precio_desde', 'UPDATE')).toBe(true);
    const { rows } = await pg.query<{ ok: boolean }>("SELECT has_table_privilege('mgdetailing_app', 'mgdetailing.servicios', 'DELETE') AS ok");
    expect(rows[0]?.ok).toBe(false);
  });
});
