import type { DatabaseSync } from 'node:sqlite';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { sqliteDatabase } from '../src/db/database.js';
import { migrate } from '../src/db/migrations.js';
import type { BookingNotifier } from '../src/domain/notifier.js';
import type { Logger } from '../src/lib/logger.js';
import type { ScryptParams } from '../src/lib/password.js';
import { createSqliteRepositories } from '../src/repositories/index.js';
import { saveAdmin } from '../src/services/admin-accounts.js';

/** Parámetros baratos de scrypt, SOLO para tests (los reales son DEFAULT_SCRYPT_PARAMS). */
export const TEST_SCRYPT_PARAMS: Readonly<ScryptParams> = { logN: 10, r: 8, p: 1 };

/** Origen del frontend en desarrollo (el que manda el navegador a través del proxy de Vite). */
export const ORIGIN = 'http://localhost:5173';
/** "Ahora" fijo de los tests: 2026-10-16 12:00 en La Rioja (UTC-3). */
export const NOW = new Date('2026-10-16T15:00:00.000Z');
export const TODAY = '2026-10-16';
export const TODAY_PLUS_60 = '2026-12-15';
export const TODAY_PLUS_61 = '2026-12-16';

export const ADMIN_EMAIL = 'dueno@mgdetailing.test';
export const ADMIN_PASSWORD = 'clave-de-prueba-123';
export const JWT_SECRET = 'secreto-de-prueba-secreto-de-prueba-0123456789';

/** Límites altísimos: los tests funcionales no deben chocar con el rate limit (se prueba aparte). */
const NO_LIMIT = { windowMs: 60_000, limit: 100_000 };

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    isProduction: false,
    host: '127.0.0.1',
    port: 0,
    frontendOrigins: [ORIGIN],
    jwtSecret: JWT_SECRET,
    sessionTtlSeconds: 8 * 60 * 60,
    database: { driver: 'sqlite', path: ':memory:' },
    trustProxy: false,
    serveFrontend: false,
    frontendDistPath: '',
    passwordHashing: { ...TEST_SCRYPT_PARAMS },
    rateLimits: { api: NO_LIMIT, bookings: NO_LIMIT, loginFailures: NO_LIMIT },
    whatsapp: { provider: 'none' },
    publicUrl: undefined,
    warnings: [],
    ...overrides,
  };
}

/** Logger que guarda las líneas en memoria para poder inspeccionarlas. */
export class MemoryLogger implements Logger {
  readonly lines: string[] = [];
  readonly errors: unknown[] = [];

  info(message: string): void {
    this.lines.push(`INFO ${message}`);
  }
  warn(message: string): void {
    this.lines.push(`WARN ${message}`);
  }
  error(message: string, error?: unknown): void {
    this.lines.push(`ERROR ${message}`);
    if (error !== undefined) this.errors.push(error);
  }
  get text(): string {
    return this.lines.join('\n');
  }
}

export interface TestContext {
  app: Express;
  db: DatabaseSync;
  logger: MemoryLogger;
  config: AppConfig;
  /** Reloj controlable: `clock.current = new Date(...)`. */
  clock: { current: Date };
  close: () => void;
}

const openContexts = new Set<TestContext>();

export function createTestContext(options: { config?: Partial<AppConfig>; now?: Date; notifier?: BookingNotifier } = {}): TestContext {
  const db = openDatabase(':memory:');
  migrate(db);
  const logger = new MemoryLogger();
  const clock = { current: options.now ?? NOW };
  const config = testConfig(options.config);
  const { repositories, checkDatabase } = sqliteDatabase(db, 'SQLite :memory:');
  const app = createApp({
    config,
    repositories,
    checkDatabase,
    logger,
    now: () => clock.current,
    ...(options.notifier && { notifier: options.notifier }),
  });

  const context: TestContext = {
    app,
    db,
    logger,
    config,
    clock,
    close: () => {
      if (db.isOpen) db.close();
      openContexts.delete(context);
    },
  };
  openContexts.add(context);
  return context;
}

/** Cierra todas las bases abiertas por createTestContext (se llama desde afterEach en cada archivo de test). */
export function closeAllContexts(): void {
  for (const context of [...openContexts]) context.close();
}

export async function addAdmin(
  context: TestContext,
  email: string = ADMIN_EMAIL,
  password: string = ADMIN_PASSWORD,
): Promise<void> {
  const { admins, sessions } = createSqliteRepositories(context.db);
  await saveAdmin({ admins, sessions }, { email, password }, { params: TEST_SCRYPT_PARAMS, now: NOW });
}

export function countRows(db: DatabaseSync, table: 'bookings' | 'sessions' | 'admins'): number {
  const row =
    table === 'bookings'
      ? db.prepare('SELECT COUNT(*) AS n FROM bookings').get()
      : table === 'sessions'
        ? db.prepare('SELECT COUNT(*) AS n FROM sessions').get()
        : db.prepare('SELECT COUNT(*) AS n FROM admins').get();
  const n = row?.n;
  if (typeof n !== 'number') throw new TypeError('COUNT inválido');
  return n;
}

/** Cliente HTTP con cookie jar y las cabeceras que manda el frontend (Origin + Content-Type JSON). */
export function createClient(app: Express) {
  const agent = request.agent(app);
  const json = (test: request.Test): request.Test =>
    test.set('Origin', ORIGIN).set('Content-Type', 'application/json');

  return {
    get: (url: string) => agent.get(url).set('Origin', ORIGIN),
    post: (url: string, body?: unknown) => json(agent.post(url)).send(body as object | undefined),
    patch: (url: string, body?: unknown) => json(agent.patch(url)).send(body as object | undefined),
    delete: (url: string) => json(agent.delete(url)),
  };
}

export type Client = ReturnType<typeof createClient>;

/** Request suelto (sin cookie jar) con Origin + Content-Type JSON. */
export const rawPost = (app: Express, url: string) =>
  request(app).post(url).set('Origin', ORIGIN).set('Content-Type', 'application/json');

export async function loginClient(
  context: TestContext,
  email: string = ADMIN_EMAIL,
  password: string = ADMIN_PASSWORD,
): Promise<Client> {
  const client = createClient(context.app);
  const response = await client.post('/api/auth/login', { email, password });
  if (response.status !== 200) {
    throw new Error(`No se pudo iniciar sesión en el test (status ${String(response.status)})`);
  }
  return client;
}

/** Un turno válido; `overrides` pisa/agrega campos. */
export function validBooking(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nombre: 'Juan Pérez',
    telefono: '+54 9 380 412-3456',
    email: 'juan@example.com',
    vehiculoTipo: 'auto',
    vehiculoModelo: 'Toyota Corolla 2020',
    servicioId: 'pulido',
    fechaPreferida: '2026-10-20',
    franja: 'manana',
    comentario: 'Tiene rayones en el capot.',
    ...overrides,
  };
}

/** Un turno válido sin el campo indicado. */
export function bookingWithout(field: string): Record<string, unknown> {
  const { [field]: _omitted, ...rest } = validBooking();
  return rest;
}

/** Extrae el valor de la cookie mg_session de una respuesta (o undefined si no la setea). */
export function sessionCookieValue(setCookie: string[] | undefined): string | undefined {
  const header = setCookie?.find((cookie) => cookie.startsWith('mg_session='));
  const value = header?.split(';')[0]?.slice('mg_session='.length);
  return value === '' ? undefined : value;
}

export function setCookieHeader(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((entry) => entry.startsWith('mg_session='));
  if (!cookie) throw new Error('La respuesta no trae la cookie mg_session');
  return cookie;
}
