import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, SUPABASE_STUB, migrationFiles } from './pglite.js';

/*
 * Migraciones 20261102100000_varios_destacados y 20261102110000_duracion_por_vehiculo aplicadas sobre una base que
 * YA tiene servicios (como producción): primero todas las anteriores, y recién después las nuevas. Son aditivas: no
 * tocan filas ni permisos existentes.
 */

const DESTACADOS = '20261102100000_varios_destacados.sql';
const DURACION = '20261102110000_duracion_por_vehiculo.sql';
const NUEVAS = [DESTACADOS, DURACION];
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
    if (NUEVAS.includes(file)) continue;
    // eslint-disable-next-line no-restricted-syntax -- migraciones versionadas
    await pg.exec(leer(file));
  }
  return pg;
}

// eslint-disable-next-line no-restricted-syntax -- migración versionada
const aplicar = (pg: PGlite, file: string) => pg.exec(leer(file));

describe('migración de varios destacados', () => {
  it('antes no se puede destacar un segundo; después sí, y el CHECK de inactivo se mantiene', async () => {
    expect(migrationFiles()).toContain(DESTACADOS);
    const pg = await baseAntes();
    await expect(pg.query("UPDATE mgdetailing.servicios SET destacado = true WHERE id = 'pulido'")).rejects.toThrow(
      /servicios_un_destacado/,
    );
    await aplicar(pg, DESTACADOS);
    await pg.query("UPDATE mgdetailing.servicios SET destacado = true WHERE id IN ('pulido', 'encerado')");
    const { rows } = await pg.query<{ id: string }>('SELECT id FROM mgdetailing.servicios WHERE destacado ORDER BY orden');
    expect(rows.map((r) => r.id)).toEqual(['lavado-premium', 'pulido', 'encerado']);
    await expect(pg.query("UPDATE mgdetailing.servicios SET activo = false WHERE id = 'pulido'")).rejects.toThrow(
      /servicios_destacado_activo/,
    );
  });
});

describe('migración de duración por vehículo sobre una base con servicios existentes', () => {
  it('no toca las filas: la de auto queda igual y camioneta/moto en null; las columnas son text nullable sin default', async () => {
    const pg = await baseAntes();
    const antes = await pg.query('SELECT id, duracion_estimada, updated_at FROM mgdetailing.servicios ORDER BY orden');
    await aplicar(pg, DURACION);
    const despues = await pg.query<Record<string, unknown>>(
      'SELECT id, duracion_estimada, updated_at, duracion_estimada_camioneta, duracion_estimada_moto FROM mgdetailing.servicios ORDER BY orden',
    );
    expect(despues.rows.map(({ duracion_estimada_camioneta: c, duracion_estimada_moto: m, ...resto }) => {
      expect(c).toBeNull();
      expect(m).toBeNull();
      return resto;
    })).toEqual(antes.rows);
    const { rows } = await pg.query(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'mgdetailing' AND table_name = 'servicios' AND column_name LIKE 'duracion_estimada%'
       ORDER BY column_name`,
    );
    expect(rows).toEqual([
      { column_name: 'duracion_estimada', data_type: 'text', is_nullable: 'YES', column_default: null },
      { column_name: 'duracion_estimada_camioneta', data_type: 'text', is_nullable: 'YES', column_default: null },
      { column_name: 'duracion_estimada_moto', data_type: 'text', is_nullable: 'YES', column_default: null },
    ]);
  });

  it('CHECKs: de 1 a 60 caracteres pasa; vacío, solo espacios y 61 no; null pasa', async () => {
    const pg = await baseAntes();
    await aplicar(pg, DURACION);
    for (const columna of ['duracion_estimada_camioneta', 'duracion_estimada_moto']) {
      for (const valor of ['2 a 3 horas', 'x'.repeat(60)]) {
        // eslint-disable-next-line no-restricted-syntax -- nombre de columna de una lista fija del propio test
        await pg.query(`UPDATE mgdetailing.servicios SET ${columna} = $1 WHERE id = 'pulido'`, [valor]);
      }
      // eslint-disable-next-line no-restricted-syntax -- idem
      await pg.query(`UPDATE mgdetailing.servicios SET ${columna} = NULL WHERE id = 'pulido'`);
      for (const valor of ['', '   ', 'x'.repeat(61)]) {
        await expect(
          // eslint-disable-next-line no-restricted-syntax -- idem
          pg.query(`UPDATE mgdetailing.servicios SET ${columna} = $1 WHERE id = 'pulido'`, [valor]),
          columna,
        ).rejects.toThrow(/servicios_duracion_(camioneta|moto)_valida/);
      }
    }
  });

  it('GRANT mínimo: mgdetailing_app lee, inserta y actualiza las columnas nuevas; los demás roles nada', async () => {
    const pg = await baseAntes();
    await aplicar(pg, DURACION);
    const priv = async (rol: string, columna: string, permiso: string) =>
      (
        await pg.query<{ ok: boolean }>("SELECT has_column_privilege($1, 'mgdetailing.servicios', $2, $3) AS ok", [rol, columna, permiso])
      ).rows[0]?.ok;
    for (const columna of ['duracion_estimada_camioneta', 'duracion_estimada_moto']) {
      for (const permiso of ['SELECT', 'INSERT', 'UPDATE']) expect(await priv('mgdetailing_app', columna, permiso), `${columna} ${permiso}`).toBe(true);
      for (const rol of ['anon', 'authenticated', 'service_role']) {
        for (const permiso of ['SELECT', 'INSERT', 'UPDATE']) expect(await priv(rol, columna, permiso), `${rol} ${columna} ${permiso}`).toBe(false);
      }
    }
    expect(await priv('mgdetailing_app', 'id', 'UPDATE')).toBe(false);
  });
});
