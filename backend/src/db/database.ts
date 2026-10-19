import type { DatabaseConfig } from '../config.js';
import type { Logger } from '../lib/logger.js';
import { type Repositories, createPostgresRepositories } from '../repositories/index.js';
import {
  createPgPool,
  createPostgresCheck,
  pgPoolClient,
  privilegedRoleWarning,
  verifyPostgresSchema,
} from './postgres.js';

/**
 * La base de datos lista para usar: los repositorios, el chequeo de salud y cómo cerrarla. Es lo que recibe
 * index.ts; createApp solo usa repositories y checkDatabase.
 */
export interface Database {
  /** Para logs. Nunca incluye la contraseña. */
  readonly description: string;
  readonly repositories: Repositories;
  /** Resuelve si la base responde; se rechaza si no (lo usa /api/health). */
  readonly checkDatabase: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/**
 * Crea el pool de Postgres y verifica que las migraciones de supabase/migrations/ ya estén aplicadas (no las
 * aplica: el esquema se administra con la CLI o el MCP de Supabase). Si algo falla, cierra el pool y propaga el error.
 */
export async function openConfiguredDatabase(config: DatabaseConfig, logger: Logger): Promise<Database> {
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
    description: `Postgres ${config.label}, esquema mgdetailing, TLS ${config.sslCaFile === undefined ? 'SIN verificar el certificado' : 'verificado'}`,
    repositories: createPostgresRepositories(client),
    checkDatabase: createPostgresCheck(client),
    close: () => pool.end(),
  };
}
