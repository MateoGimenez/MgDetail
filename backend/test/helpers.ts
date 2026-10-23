import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { createPostgresCheck } from '../src/db/postgres.js';
import type { BookingNotifier } from '../src/domain/notifier.js';
import type { Rol } from '../src/domain/perfil.js';
import type { Logger } from '../src/lib/logger.js';
import { createPostgresRepositories } from '../src/repositories/index.js';
import { type PgliteDatabase, createPgliteDatabase } from './pglite.js';
import { FakeSupabaseAuth, PUBLISHABLE_KEY, SECRET_KEY, SUPABASE_ISSUER, SUPABASE_URL, TEST_JWKS } from './supabase-fake.js';

/** Origen del frontend en desarrollo (el que manda el navegador a través del proxy de Vite). */
export const ORIGIN = 'http://localhost:5173';
/** "Ahora" fijo de los tests: 2026-10-16 12:00 en La Rioja (UTC-3). */
export const NOW = new Date('2026-10-16T15:00:00.000Z');
export const TODAY = '2026-10-16';
export const TODAY_PLUS_60 = '2026-12-15';
export const TODAY_PLUS_61 = '2026-12-16';

export const ADMIN_EMAIL = 'dueno@mgdetailing.test';
export const ADMIN_PASSWORD = 'clave-de-prueba-123';

/** Límites altísimos: los tests funcionales no deben chocar con el rate limit (se prueba aparte). */
const NO_LIMIT = { windowMs: 60_000, limit: 100_000 };

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    isProduction: false,
    host: '127.0.0.1',
    port: 0,
    frontendOrigins: [ORIGIN],
    sessionCookieMaxAgeSeconds: 8 * 60 * 60,
    database: {
      connection: { host: '127.0.0.1', port: 5432, user: 'mgdetailing_app', password: 'x', database: 'postgres' },
      sslCaFile: undefined,
      label: 'PGlite',
    },
    supabase: {
      url: SUPABASE_URL,
      authUrl: SUPABASE_ISSUER,
      jwksUrl: `${SUPABASE_ISSUER}/.well-known/jwks.json`,
      publishableKey: PUBLISHABLE_KEY,
      secretKey: SECRET_KEY,
    },
    trustProxy: false,
    serveFrontend: false,
    frontendDistPath: '',
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
  /** PGlite: `sql` como superusuario (preparar datos), `appSql` como mgdetailing_app (lo que usa la app). */
  db: PgliteDatabase;
  logger: MemoryLogger;
  config: AppConfig;
  /** Supabase Auth falso (usuarios, sesiones en auth.sessions, llamadas recibidas). */
  supabase: FakeSupabaseAuth;
  /** Reloj controlable: `clock.current = new Date(...)`. */
  clock: { current: Date };
  close: () => Promise<void>;
}

const openContexts = new Set<TestContext>();

export async function createTestContext(
  options: { config?: Partial<AppConfig>; now?: Date; notifier?: BookingNotifier } = {},
): Promise<TestContext> {
  const db = await createPgliteDatabase();
  const logger = new MemoryLogger();
  const clock = { current: options.now ?? NOW };
  const now = () => clock.current;
  const config = testConfig(options.config);
  const supabase = new FakeSupabaseAuth(db, now);
  let app: Express;
  try {
    app = createApp({
    config,
    // Como en producción: la app habla con la base como mgdetailing_app.
    repositories: createPostgresRepositories(db.appSql),
    checkDatabase: createPostgresCheck(db.appSql),
    logger,
    now,
    authFetch: supabase.fetch,
    jwks: TEST_JWKS,
    ...(options.notifier && { notifier: options.notifier }),
  });
  } catch (error) {
    await db.close();
    throw error;
  }

  const context: TestContext = {
    app,
    db,
    logger,
    config,
    supabase,
    clock,
    close: async () => {
      openContexts.delete(context);
      if (!db.pg.closed) await db.close();
    },
  };
  openContexts.add(context);
  return context;
}

/** Cierra todas las bases abiertas por createTestContext (se llama desde afterEach en cada archivo de test). */
export async function closeAllContexts(): Promise<void> {
  for (const context of [...openContexts]) await context.close();
}

export interface NewUser {
  email?: string;
  password?: string;
  rol?: Rol;
  activo?: boolean;
  nombre?: string | null;
}

/**
 * Crea un usuario como lo haría Supabase (INSERT en auth.users: el trigger crea el perfil como empleado inactivo)
 * y después le asigna rol y estado, como haría un superadmin. Devuelve su id.
 */
export async function addUser(context: TestContext, user: NewUser = {}): Promise<string> {
  const email = user.email ?? ADMIN_EMAIL;
  const { rows } = await context.db.sql.query('INSERT INTO auth.users (email) VALUES ($1) RETURNING id::text AS id', [
    email,
  ]);
  const id = String(rows[0]?.id);
  await context.db.sql.query(
    'UPDATE mgdetailing.perfiles SET rol_id = $2, activo = $3, nombre = $4 WHERE id = $1::uuid',
    [id, user.rol ?? 'admin', user.activo ?? true, user.nombre ?? null],
  );
  context.supabase.addUser(email, user.password ?? ADMIN_PASSWORD, id);
  return id;
}

/** El usuario de siempre de los tests: admin activo. */
export function addAdmin(context: TestContext): Promise<string> {
  return addUser(context);
}

export async function countRows(db: PgliteDatabase, table: 'bookings' | 'perfiles'): Promise<number> {
  const { rows } =
    table === 'bookings'
      ? await db.sql.query('SELECT count(*)::int AS n FROM mgdetailing.bookings')
      : await db.sql.query('SELECT count(*)::int AS n FROM mgdetailing.perfiles');
  const n = rows[0]?.n;
  if (typeof n !== 'number') throw new TypeError('COUNT inválido');
  return n;
}

/** Cliente HTTP con cookie jar y las cabeceras que manda el frontend (Origin + Content-Type JSON). */
export function createClient(app: Express) {
  const agent = request.agent(app);
  const json = (test: request.Test): request.Test =>
    test.set('Origin', ORIGIN).set('Content-Type', 'application/json');

  return {
    agent,
    get: (url: string) => agent.get(url).set('Origin', ORIGIN),
    post: (url: string, body?: unknown) => json(agent.post(url)).send(body as object | undefined),
    patch: (url: string, body?: unknown) => json(agent.patch(url)).send(body as object | undefined),
    put: (url: string, body?: unknown) => json(agent.put(url)).send(body as object | undefined),
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

/** Crea un usuario con ese rol y devuelve un cliente con la sesión iniciada. */
export async function loginAs(
  context: TestContext,
  rol: Rol,
  email = `${rol}@mgdetailing.test`,
): Promise<{ client: Client; id: string }> {
  const id = await addUser(context, { email, rol });
  return { client: await loginClient(context, email), id };
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

/** Las cabeceras Set-Cookie de una respuesta (lista vacía si no hay). */
export function setCookies(response: request.Response): string[] {
  return (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
}

/** La cabecera Set-Cookie de una cookie por nombre, o undefined. */
export function setCookieFor(response: request.Response, name: string): string | undefined {
  return setCookies(response).find((cookie) => cookie.startsWith(`${name}=`));
}

/** Valor de una cookie seteada en la respuesta ('' si la borra), o undefined si no la toca. */
export function cookieValue(response: request.Response, name: string): string | undefined {
  return setCookieFor(response, name)?.split(';')[0]?.slice(name.length + 1);
}

/** "mg_at=...; mg_rt=..." listo para la cabecera Cookie a partir de una respuesta de login. */
export function cookieHeader(response: request.Response): string {
  return setCookies(response)
    .map((cookie) => cookie.split(';')[0] ?? '')
    .join('; ');
}
