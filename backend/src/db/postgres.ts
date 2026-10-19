import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { DatabaseConfig } from '../config.js';
import { ROLES } from '../domain/perfil.js';
import { SERVICIO_IDS } from '../domain/servicios.js';
import type { Logger } from '../lib/logger.js';
import type { Row } from './rows.js';

/**
 * Lo mínimo que los repositorios Postgres necesitan de un cliente: una consulta parametrizada ($1, $2...).
 * Lo implementan el Pool de node-postgres (producción) y PGlite (tests), así los repositorios no dependen
 * del driver.
 */
export interface SqlClient {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Row[]; rowCount: number }>;
}

/** Esquema propio de la app en Postgres (no expuesto por la Data API de Supabase). Ver supabase/migrations/. */
export const PG_SCHEMA = 'mgdetailing';
const REQUIRED_TABLES = ['servicios', 'bookings', 'roles', 'perfiles'] as const;

/**
 * Pool chico y con timeouts: un taller con un servidor Node de larga vida no necesita más, y el pooler de
 * Supabase (Supavisor, modo sesión) tiene un cupo de conexiones compartido con el resto del proyecto.
 */
export const PG_POOL_SETTINGS = {
  max: 5,
  /** Una conexión ociosa se cierra a los 30 s (el pooler también corta las ociosas). */
  idleTimeoutMillis: 30_000,
  /** Si no se puede conectar en 5 s, falla (y /api/health responde 503) en vez de colgarse. */
  connectionTimeoutMillis: 5_000,
  /** Tope del lado del cliente para cada consulta. */
  query_timeout: 10_000,
  /** Se renuevan las conexiones cada 30 min (reinicios del pooler, rotación de certificados). */
  maxLifetimeSeconds: 30 * 60,
  keepAlive: true,
} as const;

/** TLS: siempre cifrado. Con el CA de Supabase se verifica el certificado y el nombre del host (verify-full). */
function tlsOptions(config: DatabaseConfig): pg.ClientConfig['ssl'] {
  if (config.sslCaFile === undefined) {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true, ca: readFileSync(config.sslCaFile, 'utf8') };
}

/**
 * Crea el Pool de node-postgres. No conecta todavía: la primera consulta abre la primera conexión.
 * Las partes de la conexión vienen ya separadas (config.ts), así que ningún parámetro de una URL puede pisar
 * la configuración TLS.
 */
export function createPgPool(config: DatabaseConfig, logger: Logger): pg.Pool {
  const pool = new pg.Pool({
    ...config.connection,
    ssl: tlsOptions(config),
    ...PG_POOL_SETTINGS,
  });
  // Sin este listener, un error en una conexión OCIOSA (corte de red, reinicio del pooler) tumba el proceso.
  // El pool descarta esa conexión y abre otra en la próxima consulta.
  pool.on('error', (error) => {
    logger.error('Postgres: se perdió una conexión inactiva (el pool la reemplaza)', error);
  });
  return pool;
}

/** Adapta el Pool de node-postgres a SqlClient. */
export function pgPoolClient(pool: pg.Pool): SqlClient {
  return {
    async query(text, params = []) {
      // Adaptador: acá el SQL llega como variable a propósito. La regla de "SQL literal" se aplica donde se
      // escribe la consulta: en cada llamada a sql.query() de los repositorios.
      // eslint-disable-next-line no-restricted-syntax
      const result = await pool.query<Record<string, unknown>>(text, [...params]);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  };
}

/** Chequeo de salud para /api/health: resuelve si Postgres responde, se rechaza si no. */
export function createPostgresCheck(client: SqlClient): () => Promise<void> {
  return async () => {
    await client.query('SELECT 1');
  };
}

/**
 * Mínimo privilegio: el backend tiene que conectarse con el rol dedicado mgdetailing_app (sin DDL ni BYPASSRLS,
 * migración rol_app_minimo_privilegio). Devuelve un aviso si el rol de la conexión es superusuario, salta RLS o
 * puede crear roles (por ejemplo "postgres"); undefined si está bien.
 */
export async function privilegedRoleWarning(client: SqlClient): Promise<string | undefined> {
  const { rows } = await client.query(
    `SELECT current_user AS usuario, rolsuper OR rolbypassrls OR rolcreaterole AS privilegiado
     FROM pg_catalog.pg_roles WHERE rolname = current_user`,
  );
  const row = rows[0];
  if (row?.privilegiado !== true) return undefined;
  return (
    `Postgres: el backend está conectado como "${String(row.usuario)}", un rol con privilegios de administrador ` +
    '(salta RLS y puede cambiar el esquema). Usá el rol dedicado mgdetailing_app (ver README, "Conectar Supabase").'
  );
}

/**
 * Verifica al arrancar que las migraciones de supabase/migrations/ estén aplicadas: que existan las tablas y que
 * el catálogo `servicios` tenga todos los ids que acepta el backend (domain/servicios.ts). Si faltara uno, los
 * turnos de ese servicio fallarían por la FK; mejor no arrancar y decir qué hacer.
 * El backend NO aplica migraciones de Postgres por su cuenta: se aplican con la CLI o el MCP de Supabase.
 */
export async function verifyPostgresSchema(client: SqlClient): Promise<void> {
  const tables = await client.query(
    'SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = $1 AND tablename = ANY($2::text[])',
    [PG_SCHEMA, REQUIRED_TABLES],
  );
  const present = new Set(tables.rows.map((row) => row.tablename));
  const missingTables = REQUIRED_TABLES.filter((table) => !present.has(table));
  if (missingTables.length > 0) {
    throw new Error(
      `Faltan tablas en el esquema "${PG_SCHEMA}" de Postgres (${missingTables.join(', ')}). ` +
        'Aplicá las migraciones de backend/supabase/migrations/ (ver README, "Migraciones").',
    );
  }

  const servicios = await client.query('SELECT id FROM mgdetailing.servicios WHERE id = ANY($1::text[])', [
    SERVICIO_IDS,
  ]);
  const known = new Set(servicios.rows.map((row) => row.id));
  const missingServicios = SERVICIO_IDS.filter((id) => !known.has(id));
  if (missingServicios.length > 0) {
    throw new Error(
      `Faltan servicios en mgdetailing.servicios (${missingServicios.join(', ')}). ` +
        'Agregalos con una migración nueva: el backend los acepta pero la base los rechazaría.',
    );
  }

  const roles = await client.query('SELECT id FROM mgdetailing.roles WHERE id = ANY($1::text[])', [ROLES]);
  const knownRoles = new Set(roles.rows.map((row) => row.id));
  const missingRoles = ROLES.filter((id) => !knownRoles.has(id));
  if (missingRoles.length > 0) {
    throw new Error(`Faltan roles en mgdetailing.roles (${missingRoles.join(', ')}). Aplicá las migraciones.`);
  }

  // La verificación de sesión contra auth.sessions (migración perfiles_roles_supabase_auth).
  const fn = await client.query(
    "SELECT to_regprocedure('mgdetailing_private.sesion_vigente(uuid, uuid, integer)') IS NOT NULL AS ok",
  );
  if (fn.rows[0]?.ok !== true) {
    throw new Error(
      'Falta la función mgdetailing_private.sesion_vigente (o el rol no tiene USAGE sobre mgdetailing_private). Aplicá las migraciones.',
    );
  }
}
