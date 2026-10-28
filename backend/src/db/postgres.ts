import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { DatabaseConfig } from '../config.js';
import { ROLES } from '../domain/perfil.js';
import type { Logger } from '../lib/logger.js';
import type { Row } from './rows.js';

/**
 * Lo mínimo que los repositorios Postgres necesitan de un cliente: una consulta parametrizada ($1, $2...).
 * Lo implementan el Pool de node-postgres (producción) y PGlite (tests), así los repositorios no dependen
 * del driver.
 */
export interface SqlClient {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Row[]; rowCount: number }>;
  /**
   * Corre `fn` en una transacción, sobre UNA sola conexión: BEGIN, COMMIT si `fn` resuelve y ROLLBACK si rechaza
   * (el error se propaga). Dentro de `fn` se usa el cliente que recibe, no este. Llamarla sobre el cliente de una
   * transacción ya abierta corre `fn` en esa misma transacción (no anida).
   */
  transaction<T>(fn: (sql: SqlClient) => Promise<T>): Promise<T>;
}

/** Esquema propio de la app en Postgres (no expuesto por la Data API de Supabase). Ver supabase/migrations/. */
export const PG_SCHEMA = 'mgdetailing';
const REQUIRED_TABLES = ['servicios', 'bookings', 'roles', 'perfiles'] as const;
/** Lo que agrega la migración disponibilidad_seguimiento (tablas y la columna del recordatorio). */
const DISPONIBILIDAD_TABLES = ['horario_semanal', 'dias_especiales'] as const;
/** Lo que agrega la migración finanzas_gastos_metas_taller (gastos, metas mensuales y datos del taller). */
const FINANZAS_TABLES = ['gastos', 'metas_mensuales', 'taller'] as const;
/** Lo que agregan las migraciones de inventario y de presupuestos y comprobantes. */
const INVENTARIO_TABLES = ['insumos', 'movimientos_stock'] as const;
const DOCUMENTOS_TABLES = ['presupuestos', 'comprobantes'] as const;
/** Lo que agrega la migración push_suscripciones (avisos push al celular). */
const PUSH_COLUMNS = ['perfil_id', 'endpoint', 'p256dh', 'auth', 'agente', 'ultimo_aviso_at'] as const;
/** Columnas que agrega la migración catalogo_editable (las que lee el repositorio de servicios). */
const CATALOGO_COLUMNS = ['resumen', 'descripcion', 'incluye', 'glosario', 'destacado'] as const;
/** Columnas que agrega la migración agenda_fecha_confirmada (las que lee el repositorio de turnos). */
const AGENDA_COLUMNS = ['fecha_confirmada', 'franja_confirmada'] as const;
/** Columnas que agrega la migración estadisticas_cobro_trabajador (cobro de cada trabajo). */
const COBRO_COLUMNS = ['monto', 'trabajador_id'] as const;
/** Columnas que agrega la migración notas_telefono_cliente (las que lee el repositorio de turnos). */
const NOTAS_COLUMNS = ['notas_internas', 'telefono_whatsapp'] as const;

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

async function runQuery(
  target: pg.Pool | pg.PoolClient,
  text: string,
  params: readonly unknown[],
): Promise<{ rows: Row[]; rowCount: number }> {
  // Adaptador: acá el SQL llega como variable a propósito. La regla de "SQL literal" se aplica donde se
  // escribe la consulta: en cada llamada a sql.query() de los repositorios.
  const result = await target.query<Record<string, unknown>>(text, [...params]);
  return { rows: result.rows, rowCount: result.rowCount ?? 0 };
}

/** Cliente de una transacción abierta sobre una conexión del pool. */
function transactionClient(connection: pg.PoolClient): SqlClient {
  const client: SqlClient = {
    query: (text, params = []) => runQuery(connection, text, params),
    transaction: (fn) => fn(client),
  };
  return client;
}

/** Adapta el Pool de node-postgres a SqlClient. */
export function pgPoolClient(pool: pg.Pool): SqlClient {
  return {
    query: (text, params = []) => runQuery(pool, text, params),

    async transaction(fn) {
      const connection = await pool.connect();
      let result;
      try {
        await connection.query('BEGIN');
        result = await fn(transactionClient(connection));
        await connection.query('COMMIT');
      } catch (error) {
        try {
          await connection.query('ROLLBACK');
          connection.release();
        } catch {
          // Si ni el ROLLBACK anda, la conexión no vuelve al pool en un estado desconocido: se descarta.
          connection.release(true);
        }
        throw error;
      }
      connection.release();
      return result;
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
 * Verifica al arrancar que las migraciones de supabase/migrations/ estén aplicadas: que existan las tablas, las
 * columnas del catálogo editable y de la agenda, los roles y la función de sesión. Si falta algo, mejor no arrancar y decir qué
 * hacer. Qué servicios se pueden reservar ya no se verifica acá: lo decide la tabla servicios (activo = true).
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

  // El catálogo editable (migración catalogo_editable). information_schema solo lista las columnas que el rol
  // puede ver: si falta una, o la migración no se aplicó o al rol le falta el GRANT.
  const columns = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'servicios' AND column_name = ANY($2::text[])`,
    [PG_SCHEMA, CATALOGO_COLUMNS],
  );
  const presentColumns = new Set(columns.rows.map((row) => row.column_name));
  const missingColumns = CATALOGO_COLUMNS.filter((column) => !presentColumns.has(column));
  if (missingColumns.length > 0) {
    throw new Error(
      `Faltan columnas en mgdetailing.servicios (${missingColumns.join(', ')}). ` +
        'Aplicá la migración catalogo_editable de backend/supabase/migrations/ (ver README, "Migraciones").',
    );
  }

  // La agenda (migración agenda_fecha_confirmada): mismas razones que con el catálogo.
  const agendaColumns = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'bookings' AND column_name = ANY($2::text[])`,
    [PG_SCHEMA, AGENDA_COLUMNS],
  );
  const presentAgenda = new Set(agendaColumns.rows.map((row) => row.column_name));
  const missingAgenda = AGENDA_COLUMNS.filter((column) => !presentAgenda.has(column));
  if (missingAgenda.length > 0) {
    throw new Error(
      `Faltan columnas en mgdetailing.bookings (${missingAgenda.join(', ')}). ` +
        'Aplicá la migración agenda_fecha_confirmada de backend/supabase/migrations/ (ver README, "Migraciones").',
    );
  }

  // Notas, búsqueda e historial (migración notas_telefono_cliente): columnas y la función de búsqueda.
  const notasColumns = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'bookings' AND column_name = ANY($2::text[])`,
    [PG_SCHEMA, NOTAS_COLUMNS],
  );
  const presentNotas = new Set(notasColumns.rows.map((row) => row.column_name));
  const missingNotas: string[] = NOTAS_COLUMNS.filter((column) => !presentNotas.has(column));
  const busqueda = await client.query("SELECT to_regprocedure('mgdetailing.texto_busqueda(text)') IS NOT NULL AS ok");
  if (busqueda.rows[0]?.ok !== true) missingNotas.push('función texto_busqueda');
  if (missingNotas.length > 0) {
    throw new Error(
      `Faltan objetos de la migración de notas en mgdetailing (${missingNotas.join(', ')}). ` +
        'Aplicá la migración notas_telefono_cliente de backend/supabase/migrations/ (ver README, "Migraciones").',
    );
  }

  // Disponibilidad, seguimiento y recordatorios (migración disponibilidad_seguimiento).
  const disponibilidad = await client.query(
    'SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = $1 AND tablename = ANY($2::text[])',
    [PG_SCHEMA, DISPONIBILIDAD_TABLES],
  );
  const presentDisponibilidad = new Set(disponibilidad.rows.map((row) => row.tablename));
  const missingDisponibilidad: string[] = DISPONIBILIDAD_TABLES.filter((table) => !presentDisponibilidad.has(table));
  const recordatorio = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'bookings' AND column_name = 'recordatorio_enviado_at'`,
    [PG_SCHEMA],
  );
  if (recordatorio.rows.length === 0) missingDisponibilidad.push('bookings.recordatorio_enviado_at');
  if (missingDisponibilidad.length > 0) {
    throw new Error(
      `Faltan objetos de la migración de disponibilidad en mgdetailing (${missingDisponibilidad.join(', ')}). ` +
        'Aplicá la migración disponibilidad_seguimiento de backend/supabase/migrations/ (ver README, "Migraciones").',
    );
  }

  // Estadísticas y cobro (migración estadisticas_cobro_trabajador): monto y trabajador de cada turno completado.
  const cobroColumns = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'bookings' AND column_name = ANY($2::text[])`,
    [PG_SCHEMA, COBRO_COLUMNS],
  );
  const presentCobro = new Set(cobroColumns.rows.map((row) => row.column_name));
  const missingCobro = COBRO_COLUMNS.filter((column) => !presentCobro.has(column));
  if (missingCobro.length > 0) {
    throw new Error(
      `Faltan columnas en mgdetailing.bookings (${missingCobro.join(', ')}). ` +
        'Aplicá la migración estadisticas_cobro_trabajador de backend/supabase/migrations/ (ver README, "Migraciones").',
    );
  }

  // Finanzas (migración finanzas_gastos_metas_taller): gastos, metas mensuales y datos del taller.
  const finanzas = await client.query(
    'SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = $1 AND tablename = ANY($2::text[])',
    [PG_SCHEMA, FINANZAS_TABLES],
  );
  const presentFinanzas = new Set(finanzas.rows.map((row) => row.tablename));
  const missingFinanzas = FINANZAS_TABLES.filter((table) => !presentFinanzas.has(table));
  if (missingFinanzas.length > 0) {
    throw new Error(
      `Faltan tablas de la migración de finanzas en mgdetailing (${missingFinanzas.join(', ')}). ` +
        'Aplicá la migración finanzas_gastos_metas_taller de backend/supabase/migrations/ (ver README, "Migraciones").',
    );
  }

  for (const [tablas, migracion] of [
    [INVENTARIO_TABLES, 'inventario'],
    [DOCUMENTOS_TABLES, 'presupuestos_comprobantes'],
  ] as const) {
    const presentes = await client.query(
      'SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = $1 AND tablename = ANY($2::text[])',
      [PG_SCHEMA, tablas],
    );
    const nombres = new Set(presentes.rows.map((row) => row.tablename));
    const faltan = tablas.filter((tabla) => !nombres.has(tabla));
    if (faltan.length > 0) {
      throw new Error(
        `Faltan tablas de la migración ${migracion} en mgdetailing (${faltan.join(', ')}). ` +
          `Aplicá la migración ${migracion} de backend/supabase/migrations/ (ver README, "Migraciones").`,
      );
    }
  }

  // Avisos push (migración push_suscripciones): la tabla de dispositivos.
  const pushColumns = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'push_suscripciones' AND column_name = ANY($2::text[])`,
    [PG_SCHEMA, PUSH_COLUMNS],
  );
  const presentPush = new Set(pushColumns.rows.map((row) => row.column_name));
  const missingPush = PUSH_COLUMNS.filter((column) => !presentPush.has(column));
  if (missingPush.length > 0) {
    throw new Error(
      `Faltan objetos de la migración de avisos push en mgdetailing (push_suscripciones: ${missingPush.join(', ')}). ` +
        'Aplicá la migración push_suscripciones de backend/supabase/migrations/ (ver README, "Migraciones").',
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
