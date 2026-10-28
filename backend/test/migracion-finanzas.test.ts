import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, SUPABASE_STUB, migrationFiles } from './pglite.js';

/*
 * Migración 20261028100000_finanzas_gastos_metas_taller aplicada sobre una base que YA tiene datos (como el Supabase
 * de producción): primero todas las anteriores, se cargan turnos y personas, y recién después la nueva.
 */

const NUEVA = '20261028100000_finanzas_gastos_metas_taller.sql';
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
    if (file >= NUEVA) continue; // las que van después también quedan afuera
    // eslint-disable-next-line no-restricted-syntax -- migraciones versionadas
    await pg.exec(leer(file));
  }
  return pg;
}

// eslint-disable-next-line no-restricted-syntax -- migración versionada
const aplicarNueva = (pg: PGlite) => pg.exec(leer(NUEVA));

describe('migración de finanzas sobre una base con datos', () => {
  it('es la última o está en orden y no toca turnos, catálogo ni perfiles', async () => {
    const pg = await baseAntes();
    await pg.query("INSERT INTO auth.users (email) VALUES ('ana@t.test')");
    await pg.exec(
      `INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja, estado, monto)
       VALUES ('Cliente', '12345678', 'auto', 'pulido', '2026-09-01', 'manana', 'completado', 5000),
              ('Otro', '12345678', 'auto', 'pulido', '2026-10-01', 'tarde', 'pendiente', null);
       UPDATE mgdetailing.bookings SET updated_at = '2026-09-02T10:00:00Z';`,
    );
    const antes = await pg.query('SELECT count(*)::int AS n FROM mgdetailing.bookings');
    const serviciosAntes = await pg.query('SELECT count(*)::int AS n FROM mgdetailing.servicios');
    await aplicarNueva(pg);
    expect((await pg.query('SELECT count(*)::int AS n FROM mgdetailing.bookings')).rows).toEqual(antes.rows);
    expect((await pg.query('SELECT count(*)::int AS n FROM mgdetailing.servicios')).rows).toEqual(serviciosAntes.rows);
    const { rows } = await pg.query<{ updated_at: Date; monto: number | null }>('SELECT updated_at, monto FROM mgdetailing.bookings ORDER BY seq');
    expect(rows.map((r) => r.updated_at.toISOString())).toEqual(['2026-09-02T10:00:00.000Z', '2026-09-02T10:00:00.000Z']);
    expect(rows.map((r) => r.monto)).toEqual([5000, null]);
    expect((await pg.query('SELECT count(*)::int AS n FROM mgdetailing.perfiles')).rows[0]).toEqual({ n: 1 });
  });

  it('crea las tres tablas con RLS: gastos y metas vacías y la fila sembrada del taller', async () => {
    const pg = await baseAntes();
    await aplicarNueva(pg);
    expect((await pg.query('SELECT count(*)::int AS n FROM mgdetailing.gastos')).rows[0]).toEqual({ n: 0 });
    expect((await pg.query('SELECT count(*)::int AS n FROM mgdetailing.metas_mensuales')).rows[0]).toEqual({ n: 0 });
    const taller = await pg.query('SELECT id, nombre, telefono, direccion, instagram, cuit, leyenda_pdf FROM mgdetailing.taller');
    expect(taller.rows).toEqual([
      {
        id: 1,
        nombre: 'MgDetailing',
        telefono: '5493804781737',
        direccion: 'Calle Olta Pasaje N2, La Rioja',
        instagram: null,
        cuit: null,
        leyenda_pdf: null,
      },
    ]);
    const rls = await pg.query(
      `SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'mgdetailing' AND relname IN ('gastos', 'metas_mensuales', 'taller') ORDER BY relname`,
    );
    expect(rls.rows).toEqual([
      { relname: 'gastos', relrowsecurity: true },
      { relname: 'metas_mensuales', relrowsecurity: true },
      { relname: 'taller', relrowsecurity: true },
    ]);
  });

  it('anon, authenticated y service_role no tienen ningún privilegio sobre las tablas nuevas', async () => {
    const pg = await baseAntes();
    await aplicarNueva(pg);
    const { rows } = await pg.query(
      `SELECT count(*)::int AS n FROM information_schema.role_table_grants
       WHERE table_schema = 'mgdetailing' AND table_name IN ('gastos', 'metas_mensuales', 'taller')
         AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')`,
    );
    expect(rows[0]).toEqual({ n: 0 });
    await pg.exec('SET ROLE anon');
    await expect(pg.query('SELECT * FROM mgdetailing.gastos')).rejects.toThrow(/permission denied/);
    await pg.exec('RESET ROLE');
  });

  it('actualiza las descripciones de los roles (máx. 300) y deja intactos los ids', async () => {
    const pg = await baseAntes();
    await aplicarNueva(pg);
    const { rows } = await pg.query<{ id: string; descripcion: string }>('SELECT id, descripcion FROM mgdetailing.roles ORDER BY id');
    expect(rows.map((r) => r.id)).toEqual(['admin', 'empleado', 'superadmin']);
    for (const r of rows) expect(r.descripcion.length).toBeLessThanOrEqual(300);
    expect(rows.find((r) => r.id === 'admin')?.descripcion).toMatch(/gastos.*inventario/);
    expect(rows.find((r) => r.id === 'empleado')?.descripcion).toMatch(/No ve gastos ni metas/);
  });

  it('los gastos viejos de una persona que se borra quedan sin autor (ON DELETE SET NULL)', async () => {
    const pg = await baseAntes();
    await aplicarNueva(pg);
    const { rows } = await pg.query<{ id: string }>("INSERT INTO auth.users (email) VALUES ('ana@t.test') RETURNING id::text AS id");
    const id = String(rows[0]?.id);
    await pg.query(
      "INSERT INTO mgdetailing.gastos (fecha, categoria, descripcion, monto, creado_por) VALUES ('2026-10-01', 'otros', 'x', 5, $1::uuid)",
      [id],
    );
    await pg.query('DELETE FROM auth.users WHERE id = $1::uuid', [id]);
    expect((await pg.query('SELECT creado_por FROM mgdetailing.gastos')).rows).toEqual([{ creado_por: null }]);
  });
});
