import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite, type PGliteInterface } from '@electric-sql/pglite';
import { BACKEND_ROOT } from '../src/config.js';
import type { SqlClient } from '../src/db/postgres.js';

/** Las migraciones de Supabase: la misma fuente de verdad que se aplica al proyecto remoto. */
export const MIGRATIONS_DIR = path.join(BACKEND_ROOT, 'supabase', 'migrations');

export interface PgliteDatabase {
  pg: PGliteInterface;
  /** Adaptador al mismo SqlClient que usan los repositorios con node-postgres. */
  sql: SqlClient;
  close: () => Promise<void>;
}

const migrationFiles = (): string[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{14}_[a-z0-9_]+\.sql$/.test(file))
    .sort();

async function createMigratedTemplate(): Promise<PGlite> {
  const pg = await PGlite.create();
  // Roles que en Supabase ya existen y que las migraciones nombran (REVOKE ... FROM anon, authenticated,
  // service_role). En PGlite no existen: se crean sin login antes de migrar, así los tests aplican las migraciones
  // TAL CUAL (sin saltear ninguna sentencia) y además se puede comprobar que esos roles no tienen acceso.
  await pg.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;');
  for (const file of migrationFiles()) {
    // El SQL viene de los archivos de migración versionados (confiables), no de datos de usuario.
    // eslint-disable-next-line no-restricted-syntax
    await pg.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return pg;
}

/** Base migrada una sola vez por archivo de test; cada test trabaja sobre un clon independiente (rápido). */
let template: Promise<PGlite> | undefined;

/** Rol con el que se conecta el backend en producción (migración rol_app_minimo_privilegio). */
export const APP_ROLE = 'mgdetailing_app';

/**
 * Postgres en memoria (PGlite, sin servidor) con todas las migraciones de supabase/migrations/ aplicadas.
 * `asAppRole`: las consultas corren como mgdetailing_app (como en producción), así los tests prueban que sus
 * GRANT y policies alcanzan. Sin él, corren como el superusuario de PGlite (para preparar datos a mano).
 */
export async function createPgliteDatabase(options: { asAppRole?: boolean } = {}): Promise<PgliteDatabase> {
  template ??= createMigratedTemplate();
  const pg = await (await template).clone();
  if (options.asAppRole) await pg.exec('SET ROLE mgdetailing_app');
  const sql: SqlClient = {
    async query(text, params = []) {
      // Adaptador: el SQL literal lo controla la regla en cada repositorio que llama a sql.query().
      // eslint-disable-next-line no-restricted-syntax
      const result = await pg.query<Record<string, unknown>>(text, [...params]);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
  };
  return { pg, sql, close: () => pg.close() };
}
