import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Database } from '../src/db/database.js';
import {
  createPgPool,
  createPostgresCheck,
  pgPoolClient,
  privilegedRoleWarning,
  verifyPostgresSchema,
} from '../src/db/postgres.js';
import { createPostgresRepositories } from '../src/repositories/index.js';
import { runCrearAdmin } from '../src/scripts/crear-admin-cli.js';
import { saveAdmin } from '../src/services/admin-accounts.js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  MemoryLogger,
  NOW,
  TEST_SCRYPT_PARAMS,
  createClient,
  testConfig,
  validBooking,
} from './helpers.js';
import { type PgliteDatabase, createPgliteDatabase } from './pglite.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function pglite(options: { asAppRole?: boolean } = {}): Promise<PgliteDatabase> {
  const database = await createPgliteDatabase(options);
  cleanups.push(database.close);
  return database;
}

const TABLES = ['servicios', 'bookings', 'admins', 'sessions'];

describe('esquema Postgres (migraciones de supabase/migrations/ aplicadas en PGlite)', () => {
  it('RLS activo en todas las tablas y anon/authenticated/service_role sin ningún privilegio', async () => {
    const { pg } = await pglite();

    const rls = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'mgdetailing' AND c.relkind = 'r' ORDER BY c.relname`,
    );
    expect(rls.rows).toEqual([...TABLES].sort().map((relname) => ({ relname, relrowsecurity: true })));

    const grants = await pg.query<{ grants: number }>(
      `SELECT count(*)::int AS grants FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role)
       CROSS JOIN unnest(ARRAY['servicios', 'bookings', 'admins', 'sessions']) AS t(name)
       WHERE has_table_privilege(r.role, 'mgdetailing.' || t.name, 'SELECT, INSERT, UPDATE, DELETE')
          OR has_schema_privilege(r.role, 'mgdetailing', 'USAGE')`,
    );
    expect(grants.rows[0]?.grants).toBe(0);

    // Comprobación de punta a punta: como anon, ni siquiera se puede leer el esquema.
    await pg.exec('SET ROLE anon');
    await expect(pg.query('SELECT * FROM mgdetailing.bookings')).rejects.toThrow(/permission denied/);
    await pg.exec('RESET ROLE');
  });

  it('el rol del backend (mgdetailing_app) solo tiene el DML mínimo: sin DDL, sin TRUNCATE, sin tocar otras columnas', async () => {
    const { pg } = await pglite({ asAppRole: true });

    const role = await pg.query<{ usuario: string; bypass: boolean; superuser: boolean }>(
      'SELECT current_user AS usuario, rolbypassrls AS bypass, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user',
    );
    expect(role.rows[0]).toEqual({ usuario: 'mgdetailing_app', bypass: false, superuser: false });

    const denied = [
      "UPDATE mgdetailing.bookings SET nombre = 'otro'", // solo estado y updated_at
      "UPDATE mgdetailing.admins SET email = 'x@y.z'", // solo password_hash y updated_at
      "UPDATE mgdetailing.sessions SET expires_at = now()",
      "INSERT INTO mgdetailing.servicios (id, nombre) VALUES ('nuevo', 'Nuevo')",
      'DELETE FROM mgdetailing.admins',
      'TRUNCATE mgdetailing.bookings',
      'DROP TABLE mgdetailing.sessions',
      'CREATE TABLE mgdetailing.otra (id int)',
      'ALTER TABLE mgdetailing.bookings DISABLE ROW LEVEL SECURITY',
    ];
    for (const statement of denied) {
      // eslint-disable-next-line no-restricted-syntax -- SQL literal del propio test
      await expect(pg.exec(statement), statement).rejects.toThrow(/permission denied|must be owner/);
    }
  });

  it('las restricciones rechazan valores inválidos directamente en la base y updated_at se actualiza solo', async () => {
    const { pg } = await pglite();
    const insert = (columns: string, values: string) =>
      // eslint-disable-next-line no-restricted-syntax -- SQL de prueba armado con literales del propio test
      pg.exec(`INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja${columns})
               VALUES ('N', '12345678', 'auto', 'pulido', '2026-10-20', 'manana'${values})`);

    await expect(insert(', estado', ", 'archivado'")).rejects.toThrow(/bookings_estado_valido/);
    await expect(insert(', comentario', `, '${'x'.repeat(501)}'`)).rejects.toThrow(/bookings_comentario_largo/);
    await expect(pg.exec("INSERT INTO mgdetailing.admins (email, password_hash) VALUES ('Dueno@X.com', repeat('h', 40))")).rejects.toThrow(
      /admins_email_minusculas/,
    );

    await insert('', '');
    await pg.exec("UPDATE mgdetailing.bookings SET updated_at = '2000-01-01T00:00:00Z'");
    await pg.exec("UPDATE mgdetailing.bookings SET estado = 'confirmado'"); // sin tocar updated_at => now()
    const row = await pg.query<{ fresh: boolean }>(
      "SELECT updated_at > '2020-01-01'::timestamptz AS fresh FROM mgdetailing.bookings",
    );
    expect(row.rows[0]?.fresh).toBe(true);
  });

  it('verifyPostgresSchema pasa con el esquema completo y explica qué falta si el catálogo está incompleto', async () => {
    const { pg, sql } = await pglite();

    await expect(verifyPostgresSchema(sql)).resolves.toBeUndefined();
    // Conectado como superusuario (como "postgres" en Supabase) avisa; con el rol dedicado, no.
    expect(await privilegedRoleWarning(sql)).toMatch(/privilegios de administrador.*mgdetailing_app/);
    const app = await pglite({ asAppRole: true });
    await expect(verifyPostgresSchema(app.sql)).resolves.toBeUndefined();
    expect(await privilegedRoleWarning(app.sql)).toBeUndefined();

    await pg.exec("DELETE FROM mgdetailing.servicios WHERE id = 'encerado'");
    await expect(verifyPostgresSchema(sql)).rejects.toThrow(/Faltan servicios en mgdetailing\.servicios \(encerado\)/);
  });
});

describe('la app sobre Postgres', () => {
  it('flujo completo con PGlite (rol mgdetailing_app): turno público, login, listado, cambio de estado y borrado', async () => {
    const { sql } = await pglite({ asAppRole: true });
    const repositories = createPostgresRepositories(sql);
    await saveAdmin(repositories, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, { params: TEST_SCRYPT_PARAMS, now: NOW });
    const app = createApp({
      config: testConfig(),
      repositories,
      checkDatabase: createPostgresCheck(sql),
      logger: new MemoryLogger(),
      now: () => NOW,
    });
    const client = createClient(app);

    expect((await client.get('/api/health')).body).toEqual({ status: 'ok' });
    const created = await client.post('/api/bookings', validBooking());
    expect(created.status).toBe(201);
    const { id } = created.body.booking;

    expect((await client.post('/api/auth/login', { email: ADMIN_EMAIL.toUpperCase(), password: ADMIN_PASSWORD })).status).toBe(200);
    const list = await client.get('/api/admin/bookings?estado=pendiente');
    expect(list.body).toMatchObject({ total: 1, bookings: [{ id, telefonoWhatsapp: '5493804123456', fechaPreferida: '2026-10-20' }] });

    expect((await client.patch(`/api/admin/bookings/${id}`, { estado: 'confirmado' })).body.booking.estado).toBe('confirmado');
    expect((await client.delete(`/api/admin/bookings/${id}`)).status).toBe(204);
    expect((await client.delete(`/api/admin/bookings/${id}`)).status).toBe(404);
  });

  it('GET /api/health da 503 si Postgres no responde (pool real de node-postgres contra un puerto cerrado)', async () => {
    const logger = new MemoryLogger();
    const pool = createPgPool(
      {
        driver: 'postgres',
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

  it('crear-admin usa Postgres cuando hay DATABASE_URL y no imprime la contraseña de la base', async () => {
    const { sql } = await pglite();
    const out: string[] = [];
    const err: string[] = [];
    const openDatabase = (): Promise<Database> =>
      Promise.resolve({
        driver: 'postgres',
        description: 'Postgres (PGlite)',
        repositories: createPostgresRepositories(sql),
        checkDatabase: createPostgresCheck(sql),
        close: () => Promise.resolve(),
      });

    const code = await runCrearAdmin(
      ['--email', 'Dueno@MgDetailing.com'],
      {
        ADMIN_PASSWORD: 'una-clave-bien-larga',
        DATABASE_URL: 'postgresql://postgres.ref:secreto-de-la-base@127.0.0.1:5432/postgres',
      },
      { out: (text) => out.push(text), err: (text) => err.push(text) },
      { passwordParams: TEST_SCRYPT_PARAMS, openDatabase },
    );

    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Administrador creado: dueno@mgdetailing.com');
    expect(`${out.join('\n')}${err.join('\n')}`).not.toContain('secreto-de-la-base');
    const admin = await createPostgresRepositories(sql).admins.findByEmail('DUENO@mgdetailing.com');
    expect(admin?.email).toBe('dueno@mgdetailing.com');
  });
});
