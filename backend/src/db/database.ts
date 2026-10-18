import type { DatabaseSync } from 'node:sqlite';
import type { DatabaseConfig } from '../config.js';
import type { Logger } from '../lib/logger.js';
import { type Repositories, createPostgresRepositories, createSqliteRepositories } from '../repositories/index.js';
import { openDatabase } from './connection.js';
import { createDatabaseCheck } from './health.js';
import { migrate } from './migrations.js';
import {
  createPgPool,
  createPostgresCheck,
  pgPoolClient,
  privilegedRoleWarning,
  verifyPostgresSchema,
} from './postgres.js';

/**
 * Una base de datos lista para usar, sea SQLite o Postgres: los repositorios, el chequeo de salud y cómo
 * cerrarla. Es lo que reciben index.ts y el script crear-admin; createApp solo usa repositories y checkDatabase.
 */
export interface Database {
  readonly driver: DatabaseConfig['driver'];
  /** Para logs. Nunca incluye la contraseña. */
  readonly description: string;
  readonly repositories: Repositories;
  /** Resuelve si la base responde; se rechaza si no (lo usa /api/health). */
  readonly checkDatabase: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** Envuelve una base SQLite ya abierta y migrada. */
export function sqliteDatabase(db: DatabaseSync, description: string): Database {
  return {
    driver: 'sqlite',
    description,
    repositories: createSqliteRepositories(db),
    checkDatabase: createDatabaseCheck(db),
    close: () => {
      if (db.isOpen) db.close();
      return Promise.resolve();
    },
  };
}

/**
 * Abre la base que indica la configuración:
 *  - SQLite: abre el archivo y aplica las migraciones pendientes (db/migrations.ts).
 *  - Postgres: crea el pool y verifica que las migraciones de supabase/migrations/ ya estén aplicadas
 *    (no las aplica: el esquema de Postgres se administra con la CLI / el MCP de Supabase).
 * Si algo falla, cierra lo que haya abierto y propaga el error.
 */
export async function openConfiguredDatabase(config: DatabaseConfig, logger: Logger): Promise<Database> {
  if (config.driver === 'sqlite') {
    const db = openDatabase(config.path);
    try {
      const version = migrate(db);
      return sqliteDatabase(db, `SQLite ${config.path} (esquema v${String(version)})`);
    } catch (error) {
      db.close();
      throw error;
    }
  }

  const pool = createPgPool(config, logger);
  const client = pgPoolClient(pool);
  try {
    await verifyPostgresSchema(client);
    const roleWarning = await privilegedRoleWarning(client);
    if (roleWarning !== undefined) logger.warn(roleWarning);
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
  return {
    driver: 'postgres',
    description: `Postgres ${config.label}, esquema mgdetailing, TLS ${config.sslCaFile === undefined ? 'SIN verificar el certificado' : 'verificado'}`,
    repositories: createPostgresRepositories(client),
    checkDatabase: createPostgresCheck(client),
    close: () => pool.end(),
  };
}
