import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  createPgPool,
  createPostgresCheck,
  pgPoolClient,
  privilegedRoleWarning,
  verifyPostgresSchema,
} from '../src/db/postgres.js';
import { createPostgresRepositories } from '../src/repositories/index.js';
import { MemoryLogger, testConfig } from './helpers.js';
import { type PgliteDatabase, createPgliteDatabase } from './pglite.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function pglite(): Promise<PgliteDatabase> {
  const database = await createPgliteDatabase();
  cleanups.push(database.close);
  return database;
}

const TABLES = ['bookings', 'perfiles', 'roles', 'servicios'];

describe('esquema Postgres (migraciones de supabase/migrations/ aplicadas en PGlite)', () => {
  it('RLS activo en todas las tablas, sin admins/sessions, y anon/authenticated/service_role sin ningún privilegio', async () => {
    const { pg } = await pglite();

    const rls = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'mgdetailing' AND c.relkind = 'r' ORDER BY c.relname`,
    );
    expect(rls.rows).toEqual(TABLES.map((relname) => ({ relname, relrowsecurity: true })));

    const grants = await pg.query<{ grants: number }>(
      `SELECT count(*)::int AS grants FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role)
       CROSS JOIN unnest(ARRAY['servicios', 'bookings', 'roles', 'perfiles']) AS t(name)
       WHERE has_table_privilege(r.role, 'mgdetailing.' || t.name, 'SELECT, INSERT, UPDATE, DELETE')
          OR has_schema_privilege(r.role, 'mgdetailing', 'USAGE')
          OR has_schema_privilege(r.role, 'mgdetailing_private', 'USAGE')
          OR has_function_privilege(r.role, 'mgdetailing_private.sesion_vigente(uuid, uuid, integer)', 'EXECUTE')
          OR has_function_privilege(r.role, 'mgdetailing_private.sincronizar_perfil()', 'EXECUTE')`,
    );
    expect(grants.rows[0]?.grants).toBe(0);

    await pg.exec('SET ROLE anon');
    await expect(pg.query('SELECT * FROM mgdetailing.perfiles')).rejects.toThrow(/permission denied/);
    await pg.exec('RESET ROLE');
  });

  it('mgdetailing_app solo tiene el DML mínimo: perfiles sin INSERT/DELETE y UPDATE solo de rol, activo y nombre', async () => {
    const { pg } = await pglite();
    await pg.exec('SET ROLE mgdetailing_app');

    const role = await pg.query<{ usuario: string; bypass: boolean; superuser: boolean }>(
      'SELECT current_user AS usuario, rolbypassrls AS bypass, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user',
    );
    expect(role.rows[0]).toEqual({ usuario: 'mgdetailing_app', bypass: false, superuser: false });

    const denied = [
      "UPDATE mgdetailing.bookings SET nombre = 'otro'", // solo estado y updated_at
      "INSERT INTO mgdetailing.perfiles (id) VALUES (gen_random_uuid())", // los crea el trigger
      'DELETE FROM mgdetailing.perfiles', // se borran en cascada con auth.users
      "UPDATE mgdetailing.perfiles SET email = 'x@y.z'", // el email lo copia el trigger
      "UPDATE mgdetailing.roles SET nombre = 'x'",
      "UPDATE mgdetailing.servicios SET id = 'otro' WHERE id = 'pulido'", // el id (slug) es inmutable
      'UPDATE mgdetailing.servicios SET created_at = now()',
      "INSERT INTO mgdetailing.servicios (id, nombre, resumen, descripcion, created_at) VALUES ('n', 'N', 'r', 'd', now())",
      "DELETE FROM mgdetailing.servicios WHERE id = 'pulido'", // un servicio se desactiva, no se borra
      'SELECT * FROM auth.users',
      'SELECT * FROM auth.sessions',
      'SELECT mgdetailing_private.sincronizar_perfil()',
      'TRUNCATE mgdetailing.bookings',
      'CREATE TABLE mgdetailing.otra (id int)',
      'ALTER TABLE mgdetailing.perfiles DISABLE ROW LEVEL SECURITY',
    ];
    for (const statement of denied) {
      // eslint-disable-next-line no-restricted-syntax -- SQL literal del propio test
      await expect(pg.exec(statement), statement).rejects.toThrow(/permission denied|must be owner/);
    }
    await pg.exec('RESET ROLE');
  });

  it('trigger de auth.users: el usuario nuevo nace empleado e inactivo; cambiar el email lo copia sin tocar rol ni activo', async () => {
    const { sql } = await pglite();
    const { rows } = await sql.query(
      "INSERT INTO auth.users (email) VALUES ('Nuevo@MgDetailing.test') RETURNING id::text AS id",
    );
    const id = String(rows[0]?.id);
    const perfil = async () =>
      (await sql.query('SELECT email, rol_id, activo FROM mgdetailing.perfiles WHERE id = $1::uuid', [id])).rows[0];

    expect(await perfil()).toEqual({ email: 'nuevo@mgdetailing.test', rol_id: 'empleado', activo: false });

    await sql.query("UPDATE mgdetailing.perfiles SET rol_id = 'admin', activo = true WHERE id = $1::uuid", [id]);
    await sql.query("UPDATE auth.users SET email = 'Cambiado@MgDetailing.test' WHERE id = $1::uuid", [id]);
    expect(await perfil()).toEqual({ email: 'cambiado@mgdetailing.test', rol_id: 'admin', activo: true });

    await sql.query('DELETE FROM auth.users WHERE id = $1::uuid', [id]);
    expect(await perfil()).toBeUndefined(); // ON DELETE CASCADE

    // Borrar en Supabase Auth al ÚLTIMO superadmin activo (cascada a perfiles) se rechaza.
    const ultimo = String(
      (await sql.query("INSERT INTO auth.users (email) VALUES ('jefe@mgdetailing.test') RETURNING id::text AS id")).rows[0]?.id,
    );
    await sql.query("UPDATE mgdetailing.perfiles SET rol_id = 'superadmin', activo = true WHERE id = $1::uuid", [ultimo]);
    await expect(sql.query('DELETE FROM auth.users WHERE id = $1::uuid', [ultimo])).rejects.toThrow(
      /sin ningún superadmin activo/,
    );
  });

  it('sesion_vigente aplica el tope absoluto desde el login (auth.sessions.created_at)', async () => {
    const { sql, appSql } = await pglite();
    const user = String((await sql.query("INSERT INTO auth.users (email) VALUES ('u@mgdetailing.test') RETURNING id::text AS id")).rows[0]?.id);
    await sql.query(
      `INSERT INTO auth.sessions (id, user_id, created_at) VALUES
         ('11111111-1111-4111-8111-111111111111', $1::uuid, now() - interval '13 hours'),
         ('22222222-2222-4222-8222-222222222222', $1::uuid, now() - interval '1 hour')`,
      [user],
    );
    const { rows } = await appSql.query(
      `SELECT mgdetailing_private.sesion_vigente('11111111-1111-4111-8111-111111111111', $1::uuid, 43200) AS vieja,
              mgdetailing_private.sesion_vigente('22222222-2222-4222-8222-222222222222', $1::uuid, 43200) AS nueva`,
      [user],
    );
    expect(rows[0]).toEqual({ vieja: false, nueva: true });
  });

  it('las restricciones rechazan valores inválidos directamente en la base y updated_at se actualiza solo', async () => {
    const { pg } = await pglite();
    const insert = (columns: string, values: string) =>
      // eslint-disable-next-line no-restricted-syntax -- SQL de prueba armado con literales del propio test
      pg.exec(`INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja${columns})
               VALUES ('N', '12345678', 'auto', 'pulido', '2026-10-20', 'manana'${values})`);

    await expect(insert(', estado', ", 'archivado'")).rejects.toThrow(/bookings_estado_valido/);
    await expect(insert(', comentario', `, '${'x'.repeat(501)}'`)).rejects.toThrow(/bookings_comentario_largo/);
    await pg.exec("INSERT INTO auth.users (email) VALUES ('a@b.co')");
    await expect(pg.exec("UPDATE mgdetailing.perfiles SET rol_id = 'dueño'")).rejects.toThrow(/perfiles_rol_id_fkey/);

    await insert('', '');
    await pg.exec("UPDATE mgdetailing.bookings SET updated_at = '2000-01-01T00:00:00Z'");
    await pg.exec("UPDATE mgdetailing.bookings SET estado = 'confirmado'"); // sin tocar updated_at => now()
    const row = await pg.query<{ fresh: boolean }>(
      "SELECT updated_at > '2020-01-01'::timestamptz AS fresh FROM mgdetailing.bookings",
    );
    expect(row.rows[0]?.fresh).toBe(true);
  });

  it('verifyPostgresSchema pasa con el esquema completo y explica qué falta; avisa si se conecta un rol privilegiado', async () => {
    const { pg, sql, appSql } = await pglite();

    await expect(verifyPostgresSchema(appSql)).resolves.toBeUndefined();
    expect(await privilegedRoleWarning(appSql)).toBeUndefined();
    expect(await privilegedRoleWarning(sql)).toMatch(/privilegios de administrador.*mgdetailing_app/);

    // Si la migración catalogo_editable no está aplicada (o al rol le falta el GRANT), lo explica.
    await pg.exec('ALTER TABLE mgdetailing.servicios DROP COLUMN glosario');
    await expect(verifyPostgresSchema(sql)).rejects.toThrow(/Faltan columnas en mgdetailing\.servicios \(glosario\)/);
  });
});

describe('la app sobre Postgres', () => {
  it('GET /api/health da 503 si Postgres no responde (pool real de node-postgres contra un puerto cerrado)', async () => {
    const logger = new MemoryLogger();
    const pool = createPgPool(
      {
        connection: { host: '127.0.0.1', port: 1, user: 'postgres', password: 'x', database: 'postgres' },
        sslCaFile: undefined,
        label: '127.0.0.1:1/postgres',
      },
      logger,
    );
    cleanups.push(() => pool.end());
    const client = pgPoolClient(pool);
    const app = createApp({
      config: testConfig(),
      repositories: createPostgresRepositories(client),
      checkDatabase: createPostgresCheck(client),
      logger,
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(logger.errors).toHaveLength(0);
  });
});
