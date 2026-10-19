import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite, type PGliteInterface } from '@electric-sql/pglite';
import { BACKEND_ROOT } from '../src/config.js';
import type { SqlClient } from '../src/db/postgres.js';

/** Las migraciones de Supabase: la misma fuente de verdad que se aplica al proyecto remoto. */
export const MIGRATIONS_DIR = path.join(BACKEND_ROOT, 'supabase', 'migrations');

/** Rol con el que se conecta el backend en producción (migración rol_app_minimo_privilegio). */
export const APP_ROLE = 'mgdetailing_app';

export interface PgliteDatabase {
  /** Conexión cruda como superusuario (para preparar datos y simular a Supabase Auth). */
  pg: PGliteInterface;
  /** SqlClient como superusuario. */
  sql: SqlClient;
  /** SqlClient como mgdetailing_app (como en producción): prueba que sus GRANT y policies alcanzan. */
  appSql: SqlClient;
  close: () => Promise<void>;
}

const migrationFiles = (): string[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{14}_[a-z0-9_]+\.sql$/.test(file))
    .sort();

/**
 * Lo mínimo de Supabase que las migraciones nombran y PGlite no tiene:
 *  - los roles anon, authenticated y service_role (sin login), para aplicar los REVOKE tal cual y poder comprobar
 *    que no tienen acceso;
 *  - un esquema `auth` con las columnas de auth.users y auth.sessions que usan el trigger de perfiles y la
 *    verificación de sesión (en Supabase son tablas de Auth, mucho más grandes).
 */
const SUPABASE_STUB = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE auth.sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    not_after timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
`;

async function createMigratedTemplate(): Promise<PGlite> {
  const pg = await PGlite.create();
  // eslint-disable-next-line no-restricted-syntax -- constante del propio test
  await pg.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    // El SQL viene de los archivos de migración versionados (confiables), no de datos de usuario.
    // eslint-disable-next-line no-restricted-syntax
    await pg.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return pg;
}

/** Base migrada una sola vez por archivo de test; cada test trabaja sobre un clon independiente (rápido). */
let template: Promise<PGlite> | undefined;

/**
 * Postgres en memoria (PGlite, sin servidor) con todas las migraciones de supabase/migrations/ aplicadas.
 * PGlite tiene una sola conexión: las consultas de `appSql` corren en una transacción con
 * `SET LOCAL ROLE mgdetailing_app`, así conviven con las del superusuario sin pisarse el rol.
 */
export async function createPgliteDatabase(): Promise<PgliteDatabase> {
  template ??= createMigratedTemplate();
  const pg = await (await template).clone();

  const sql: SqlClient = {
    async query(text, params = []) {
      // Adaptador: el SQL literal lo controla la regla en cada repositorio que llama a sql.query().
      // eslint-disable-next-line no-restricted-syntax
      const result = await pg.query<Record<string, unknown>>(text, [...params]);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
  };

  const appSql: SqlClient = {
    query(text, params = []) {
      return pg.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE mgdetailing_app');
        const result = await tx.query<Record<string, unknown>>(text, [...params]);
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
      });
    },
  };

  return { pg, sql, appSql, close: () => pg.close() };
}
