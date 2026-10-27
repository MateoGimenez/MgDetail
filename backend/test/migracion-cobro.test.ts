import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, SUPABASE_STUB, migrationFiles } from './pglite.js';

/*
 * Migración 20261027100000_estadisticas_cobro_trabajador aplicada sobre una base que YA tiene turnos (como el
 * Supabase de producción): primero se aplican todas las migraciones anteriores, se cargan turnos viejos y recién
 * después se aplica la nueva.
 */

const NUEVA = '20261027100000_estadisticas_cobro_trabajador.sql';
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

async function turnoViejo(pg: PGlite, estado: string, fecha: string): Promise<string> {
  const { rows } = await pg.query<{ id: string }>(
    `INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja, estado)
     VALUES ('Cliente', '12345678', 'auto', 'pulido', $1::date, 'manana', $2) RETURNING id::text AS id`,
    [fecha, estado],
  );
  return String(rows[0]?.id);
}

describe('migración de cobro y trabajador sobre una base con turnos existentes', () => {
  it('se aplica sin tocar las filas existentes: completados viejos quedan con monto y trabajador en null', async () => {
    const pg = await baseAntes();
    const ids = [
      await turnoViejo(pg, 'completado', '2026-09-01'),
      await turnoViejo(pg, 'pendiente', '2026-10-01'),
      await turnoViejo(pg, 'cancelado', '2026-10-02'),
    ];
    await pg.query("UPDATE mgdetailing.bookings SET updated_at = '2026-09-02T10:00:00Z'");
    await aplicarNueva(pg);
    const { rows } = await pg.query<{ estado: string; monto: number | null; trabajador_id: string | null; updated_at: Date }>(
      'SELECT estado, monto, trabajador_id::text, updated_at FROM mgdetailing.bookings ORDER BY seq',
    );
    expect(rows).toHaveLength(ids.length);
    for (const row of rows) {
      expect(row.monto).toBeNull();
      expect(row.trabajador_id).toBeNull();
      expect(row.updated_at.toISOString()).toBe('2026-09-02T10:00:00.000Z'); // la migración no mueve updated_at
    }
  });

  it('el trigger de updated_at sigue andando para el resto y no se pisa la condición del recordatorio', async () => {
    const pg = await baseAntes();
    const id = await turnoViejo(pg, 'confirmado', '2026-10-20');
    await aplicarNueva(pg);
    const anio = async () =>
      (await pg.query<{ u: Date }>('SELECT updated_at AS u FROM mgdetailing.bookings WHERE id = $1::uuid', [id])).rows[0]?.u.getUTCFullYear();
    const reset = () => pg.exec("UPDATE mgdetailing.bookings SET updated_at = '2000-01-01T00:00:00Z'");
    await reset();

    // recordatorio_enviado_at solo: no mueve updated_at (condición de la migración anterior, conservada)
    await pg.query('UPDATE mgdetailing.bookings SET recordatorio_enviado_at = now() WHERE id = $1::uuid', [id]);
    expect(await anio()).toBe(2000);
    // monto solo (en un completado): tampoco
    await pg.query("UPDATE mgdetailing.bookings SET estado = 'completado' WHERE id = $1::uuid", [id]);
    await reset();
    await pg.query('UPDATE mgdetailing.bookings SET monto = 100 WHERE id = $1::uuid', [id]);
    expect(await anio()).toBe(2000);
    // cualquier otra columna: sí lo mueve
    await pg.query("UPDATE mgdetailing.bookings SET notas_internas = 'hola' WHERE id = $1::uuid", [id]);
    expect(await anio()).toBeGreaterThan(2020);
    // estado solo: sí lo mueve (la base lo hace sola)
    await pg.query('UPDATE mgdetailing.bookings SET monto = NULL WHERE id = $1::uuid', [id]);
    await reset();
    await pg.query("UPDATE mgdetailing.bookings SET estado = 'pendiente' WHERE id = $1::uuid", [id]);
    expect(await anio()).toBeGreaterThan(2020);
  });

  it('CHECKs: rango del monto, coherencia con el estado y FK ON DELETE SET NULL que sigue cumpliendo el CHECK', async () => {
    const pg = await baseAntes();
    const id = await turnoViejo(pg, 'completado', '2026-10-20');
    const pendiente = await turnoViejo(pg, 'pendiente', '2026-10-20');
    await aplicarNueva(pg);
    const { rows } = await pg.query<{ id: string }>("INSERT INTO auth.users (email) VALUES ('t@t.test') RETURNING id::text AS id");
    const persona = String(rows[0]?.id);

    await expect(pg.query('UPDATE mgdetailing.bookings SET monto = -1 WHERE id = $1::uuid', [id])).rejects.toThrow(/bookings_monto_rango/);
    await expect(pg.query('UPDATE mgdetailing.bookings SET monto = 100000000 WHERE id = $1::uuid', [id])).rejects.toThrow(
      /bookings_monto_rango/,
    );
    await expect(pg.query('UPDATE mgdetailing.bookings SET monto = 5 WHERE id = $1::uuid', [pendiente])).rejects.toThrow(
      /bookings_cobro_solo_completado/,
    );
    await expect(
      pg.query('UPDATE mgdetailing.bookings SET trabajador_id = $2::uuid WHERE id = $1::uuid', [pendiente, persona]),
    ).rejects.toThrow(/bookings_cobro_solo_completado/);
    await expect(pg.query('UPDATE mgdetailing.bookings SET trabajador_id = gen_random_uuid() WHERE id = $1::uuid', [id])).rejects.toThrow(
      /bookings_trabajador_id_fkey/,
    );
    await pg.query('UPDATE mgdetailing.bookings SET monto = 99999999, trabajador_id = $2::uuid WHERE id = $1::uuid', [id, persona]);
    // Salir de completado sin limpiar el cobro: el CHECK lo frena.
    await expect(pg.query("UPDATE mgdetailing.bookings SET estado = 'pendiente' WHERE id = $1::uuid", [id])).rejects.toThrow(
      /bookings_cobro_solo_completado/,
    );

    // Se borra a la persona: el completado queda con monto y sin trabajador, y el CHECK lo acepta.
    await pg.query('DELETE FROM auth.users WHERE id = $1::uuid', [persona]);
    const despues = await pg.query<{ monto: number; trabajador_id: string | null }>(
      'SELECT monto, trabajador_id::text FROM mgdetailing.bookings WHERE id = $1::uuid',
      [id],
    );
    expect(despues.rows[0]).toEqual({ monto: 99999999, trabajador_id: null });
  });

  it('GRANT mínimo: mgdetailing_app actualiza monto y trabajador_id pero no otras columnas; anon y authenticated nada', async () => {
    const pg = await baseAntes();
    await aplicarNueva(pg);
    const priv = async (rol: string, columna: string, permiso: string) =>
      (
        await pg.query<{ ok: boolean }>("SELECT has_column_privilege($1, 'mgdetailing.bookings', $2, $3) AS ok", [rol, columna, permiso])
      ).rows[0]?.ok;
    for (const columna of ['monto', 'trabajador_id']) {
      expect(await priv('mgdetailing_app', columna, 'UPDATE')).toBe(true);
      expect(await priv('mgdetailing_app', columna, 'SELECT')).toBe(true);
      for (const rol of ['anon', 'authenticated', 'service_role']) {
        expect(await priv(rol, columna, 'SELECT')).toBe(false);
        expect(await priv(rol, columna, 'UPDATE')).toBe(false);
      }
    }
    expect(await priv('mgdetailing_app', 'nombre', 'UPDATE')).toBe(false);
  });

  it('las consultas de estadísticas usan los índices con unos miles de turnos', async () => {
    const pg = await baseAntes();
    await aplicarNueva(pg);
    await pg.exec(`
      INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja, estado)
      SELECT 'C' || g, '12345678', 'auto', 'pulido', date '2024-01-01' + (g % 1000), 'manana',
             (ARRAY['pendiente','confirmado','completado','cancelado'])[1 + g % 4]
      FROM generate_series(1, 5000) AS g;
      ANALYZE mgdetailing.bookings;
    `);
    const plan = async (sql: string) =>
      // eslint-disable-next-line no-restricted-syntax -- EXPLAIN de consultas fijas del propio test
      (await pg.query<Record<string, string>>(`EXPLAIN ${sql}`)).rows.map((r) => r['QUERY PLAN']).join('\n');

    const rango = await plan(
      `SELECT count(*) FROM mgdetailing.bookings b
       WHERE coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN '2026-01-01'::date AND '2026-01-31'::date`,
    );
    expect(rango).toMatch(/bookings_(fecha_agenda_estado|agenda)_idx/);

    const porEstado = await plan(
      `SELECT count(*) FROM mgdetailing.bookings b WHERE b.estado = 'completado'
         AND coalesce(b.fecha_confirmada, b.fecha_preferida) BETWEEN '2026-01-01'::date AND '2026-01-31'::date`,
    );
    expect(porEstado).toMatch(/bookings_(fecha_agenda_estado|agenda)_idx/);

    // Los trabajos de una persona (y el SET NULL de la FK) usan el índice parcial.
    await pg.exec('SET enable_seqscan = off');
    const trabajos = await plan(
      "SELECT count(*) FROM mgdetailing.bookings WHERE trabajador_id = '00000000-0000-4000-8000-000000000001'::uuid",
    );
    expect(trabajos).toMatch(/bookings_trabajador_id_idx/);
  });

  it('las descripciones de los roles quedan actualizadas', async () => {
    const pg = await baseAntes();
    await aplicarNueva(pg);
    const { rows } = await pg.query<{ id: string; descripcion: string }>('SELECT id, descripcion FROM mgdetailing.roles');
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === 'empleado')?.descripcion).toMatch(/sin importes/);
    expect(rows.find((r) => r.id === 'admin')?.descripcion).toMatch(/estadísticas con importes/);
  });
});
