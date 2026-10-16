import { randomUUID } from 'node:crypto';
import { SignJWT, UnsecuredJWT } from 'jose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMITS } from '../src/config.js';
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/lib/session-token.js';
import { createSqliteRepositories } from '../src/repositories/index.js';
import { saveAdmin } from '../src/services/admin-accounts.js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  JWT_SECRET,
  NOW,
  ORIGIN,
  TEST_SCRYPT_PARAMS,
  type TestContext,
  addAdmin,
  closeAllContexts,
  countRows,
  createTestContext,
  loginClient,
  rawPost,
  sessionCookieValue,
  setCookieHeader,
} from './helpers.js';

afterEach(closeAllContexts);

async function contextWithAdmin(options: Parameters<typeof createTestContext>[0] = {}): Promise<TestContext> {
  const context = createTestContext(options);
  await addAdmin(context);
  return context;
}

const HOUR = 60 * 60 * 1000;

describe('POST /api/auth/login', () => {
  it('con credenciales correctas responde 200 { admin: { email } } y setea la cookie de sesión', async () => {
    const { app } = await contextWithAdmin();
    const response = await rawPost(app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ admin: { email: ADMIN_EMAIL } });
    expect(sessionCookieValue(response.headers['set-cookie'] as unknown as string[])).toBeTruthy();
  });

  it('la cookie es httpOnly, SameSite=Strict, Path=/ y dura 8 horas (sin Secure fuera de producción)', async () => {
    const { app } = await contextWithAdmin();
    const response = await rawPost(app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const cookie = setCookieHeader(response);

    expect(cookie).toMatch(/^mg_session=[\w-]+\.[\w-]+\.[\w-]+;/); // JWT: tres partes base64url
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Strict/i);
    expect(cookie).toMatch(/;\s*Path=\/(;|$)/i);
    expect(cookie).toMatch(/;\s*Max-Age=28800/i);
    expect(cookie).not.toMatch(/;\s*Secure/i);
  });

  it('en producción la cookie además es Secure', async () => {
    const { app } = await contextWithAdmin({ config: { isProduction: true, nodeEnv: 'production' } });
    const response = await rawPost(app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    expect(setCookieHeader(response)).toMatch(/;\s*Secure/i);
  });

  it('contraseña incorrecta => 401 INVALID_CREDENTIALS, sin cookie', async () => {
    const { app } = await contextWithAdmin();
    const response = await rawPost(app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: 'otra-clave-equivocada' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'El email o la contraseña no son correctos.' },
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('email inexistente => exactamente la misma respuesta que contraseña incorrecta', async () => {
    const { app } = await contextWithAdmin();
    const wrongPassword = await rawPost(app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: 'otra-clave-equivocada' });
    const unknownEmail = await rawPost(app, '/api/auth/login').send({ email: 'nadie@example.com', password: 'otra-clave-equivocada' });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(unknownEmail.headers['set-cookie']).toBeUndefined();
  });

  it('con un email inexistente igual se hace el trabajo de scrypt: tarda como una contraseña incorrecta', async () => {
    // Costo real de scrypt (no el barato de los tests) para que la diferencia sea medible.
    const context = createTestContext({ config: { passwordHashing: { logN: 15, r: 8, p: 3 } } });
    const { admins, sessions } = createSqliteRepositories(context.db);
    await saveAdmin({ admins, sessions }, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, { now: NOW });
    await new Promise((resolve) => setTimeout(resolve, 800)); // deja terminar el hash señuelo (se calcula al arrancar)

    const timeOf = async (email: string): Promise<number> => {
      const startedAt = performance.now();
      await rawPost(context.app, '/api/auth/login').send({ email, password: 'otra-clave-equivocada' });
      return performance.now() - startedAt;
    };
    const wrongPassword = await timeOf(ADMIN_EMAIL);
    const unknownEmail = await timeOf('nadie@example.com');

    expect(unknownEmail).toBeGreaterThan(40); // hizo trabajo real de scrypt
    expect(unknownEmail).toBeGreaterThan(wrongPassword * 0.5);
  });

  it('validación del body: faltan campos, campos extra y email mal formado => 400', async () => {
    const { app } = await contextWithAdmin();

    const empty = await rawPost(app, '/api/auth/login').send({});
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(empty.body.error.fields as object).sort()).toEqual(['email', 'password']);

    const extra = await rawPost(app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, admin: true });
    expect(extra.status).toBe(400);
    expect(Object.keys(extra.body.error.fields as object)).toEqual(['admin']);

    const badEmail = await rawPost(app, '/api/auth/login').send({ email: 'no-es-email', password: 'x' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error.fields).toEqual({ email: 'Revisá el email.' });

    const longPassword = await rawPost(app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: 'x'.repeat(129) });
    expect(longPassword.status).toBe(400);
    expect(Object.keys(longPassword.body.error.fields as object)).toEqual(['password']);
  });
});

describe('POST /api/auth/login: rate limit de intentos fallidos', () => {
  it('al 6.º intento fallido de la misma IP responde 429 RATE_LIMITED', async () => {
    const { app } = await contextWithAdmin({ config: { rateLimits: DEFAULT_RATE_LIMITS } });

    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await rawPost(app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: 'incorrecta-' + String(attempt) });
      expect(response.status, `intento ${String(attempt)}`).toBe(401);
    }

    const blocked = await rawPost(app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: 'incorrecta-6' });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Hiciste demasiados intentos fallidos. Esperá unos minutos antes de volver a probar.',
      },
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('los logins correctos no cuentan para el límite', async () => {
    const { app } = await contextWithAdmin({ config: { rateLimits: DEFAULT_RATE_LIMITS } });

    for (let attempt = 0; attempt < 8; attempt++) {
      const response = await rawPost(app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      expect(response.status, `login ${String(attempt)}`).toBe(200);
    }
  });

  it('con TRUST_PROXY desactivado, un X-Forwarded-For falso NO permite esquivar el límite', async () => {
    const { app } = await contextWithAdmin({ config: { rateLimits: DEFAULT_RATE_LIMITS, trustProxy: false } });

    for (let attempt = 1; attempt <= 5; attempt++) {
      await rawPost(app, '/api/auth/login').set('X-Forwarded-For', `10.0.0.${String(attempt)}`).send({ email: ADMIN_EMAIL, password: 'mal' });
    }
    const blocked = await rawPost(app, '/api/auth/login').set('X-Forwarded-For', '10.9.9.9').send({ email: ADMIN_EMAIL, password: 'mal' });
    expect(blocked.status).toBe(429);
  });
});

describe('GET /api/auth/me', () => {
  it('sin sesión => 401 UNAUTHORIZED', async () => {
    const { app } = await contextWithAdmin();
    const response = await request(app).get('/api/auth/me').set('Origin', ORIGIN);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Tu sesión no es válida o venció. Iniciá sesión de nuevo.' },
    });
  });

  it('con sesión => 200 { admin: { email } }', async () => {
    const context = await contextWithAdmin();
    const client = await loginClient(context);
    const response = await client.get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ admin: { email: ADMIN_EMAIL } });
  });

  it('la sesión dura 8 horas: a las 7:59 sigue activa y a las 8:01 vence', async () => {
    const context = await contextWithAdmin();
    const client = await loginClient(context);

    context.clock.current = new Date(NOW.getTime() + 8 * HOUR - 60_000);
    expect((await client.get('/api/auth/me')).status).toBe(200);

    context.clock.current = new Date(NOW.getTime() + 8 * HOUR + 60_000);
    expect((await client.get('/api/auth/me')).status).toBe(401);
  });

  it('una cookie basura => 401 y se le pide al navegador que la borre', async () => {
    const { app } = await contextWithAdmin();
    const response = await request(app).get('/api/auth/me').set('Cookie', 'mg_session=esto-no-es-un-jwt');

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toMatch(/^mg_session=;.*Expires=Thu, 01 Jan 1970/i);
  });
});

describe('POST /api/auth/logout', () => {
  it('responde 204 y borra la cookie', async () => {
    const context = await contextWithAdmin();
    const client = await loginClient(context);
    const response = await client.post('/api/auth/logout');

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    const cookie = setCookieHeader(response);
    expect(cookie).toMatch(/^mg_session=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Strict/i);

    expect((await client.get('/api/auth/me')).status).toBe(401);
  });

  it('revoca la sesión en el servidor: reutilizar el token después de salir da 401', async () => {
    const context = await contextWithAdmin();
    const login = await rawPost(context.app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const token = sessionCookieValue(login.headers['set-cookie'] as unknown as string[]) ?? '';
    const cookie = `mg_session=${token}`;
    expect(countRows(context.db, 'sessions')).toBe(1);

    expect((await request(context.app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);

    const logout = await rawPost(context.app, '/api/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(204);
    expect(countRows(context.db, 'sessions')).toBe(0);

    // El token sigue firmado y sin vencer, pero ya no está en la lista de sesiones vigentes.
    const replay = await request(context.app).get('/api/auth/me').set('Cookie', cookie);
    expect(replay.status).toBe(401);
  });

  it('sin sesión también responde 204 (es idempotente)', async () => {
    const { app } = await contextWithAdmin();
    const response = await rawPost(app, '/api/auth/logout');

    expect(response.status).toBe(204);
  });

  it('cerrar sesión en un dispositivo no cierra las de otros', async () => {
    const context = await contextWithAdmin();
    const laptop = await loginClient(context);
    const phone = await loginClient(context);
    expect(countRows(context.db, 'sessions')).toBe(2);

    await laptop.post('/api/auth/logout');

    expect((await laptop.get('/api/auth/me')).status).toBe(401);
    expect((await phone.get('/api/auth/me')).status).toBe(200);
  });
});

describe('tokens manipulados o inválidos', () => {
  const nowSeconds = Math.floor(NOW.getTime() / 1000);

  interface ForgeOptions {
    secret?: string;
    alg?: 'HS256' | 'HS384' | 'HS512';
    sub?: string;
    jti?: string;
    iss?: string;
    aud?: string;
    iat?: number;
    exp?: number;
  }

  async function forge(options: ForgeOptions = {}): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: options.alg ?? 'HS256', typ: 'JWT' })
      .setIssuer(options.iss ?? JWT_ISSUER)
      .setAudience(options.aud ?? JWT_AUDIENCE)
      .setSubject(options.sub ?? '1')
      .setJti(options.jti ?? randomUUID())
      .setIssuedAt(options.iat ?? nowSeconds)
      .setExpirationTime(options.exp ?? nowSeconds + 3600)
      .sign(new TextEncoder().encode(options.secret ?? JWT_SECRET));
  }

  async function expectRejected(context: TestContext, token: string): Promise<void> {
    const response = await request(context.app).get('/api/auth/me').set('Cookie', `mg_session=${token}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  }

  /** Inserta una fila de sesión para que lo único inválido del token sea lo que cada test quiere probar. */
  function registerSession(context: TestContext, jti: string, adminId = 1, expiresAt = nowSeconds + 3600): void {
    context.db
      .prepare('INSERT INTO sessions (id, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(jti, adminId, expiresAt, NOW.toISOString());
  }

  it('control: un token forjado con TODO correcto y sesión registrada sí funciona (valida el helper)', async () => {
    const context = await contextWithAdmin();
    const jti = randomUUID();
    registerSession(context, jti);

    const response = await request(context.app).get('/api/auth/me').set('Cookie', `mg_session=${await forge({ jti })}`);
    expect(response.status).toBe(200);
  });

  it('alg=none (token sin firma) => 401', async () => {
    const context = await contextWithAdmin();
    const jti = randomUUID();
    registerSession(context, jti);
    const unsigned = new UnsecuredJWT({})
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setSubject('1')
      .setJti(jti)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 3600)
      .encode();
    await expectRejected(context, unsigned);
  });

  it('firmado con otro secreto => 401', async () => {
    const context = await contextWithAdmin();
    const jti = randomUUID();
    registerSession(context, jti);
    await expectRejected(context, await forge({ jti, secret: 'otro-secreto-distinto-otro-secreto-distinto-123' }));
  });

  it('token vencido (exp en el pasado) con firma válida => 401', async () => {
    const context = await contextWithAdmin();
    const jti = randomUUID();
    registerSession(context, jti);
    await expectRejected(context, await forge({ jti, iat: nowSeconds - 7200, exp: nowSeconds - 3600 }));
  });

  it('firma válida pero la sesión no existe en el servidor (jti desconocido) => 401', async () => {
    const context = await contextWithAdmin();
    await expectRejected(context, await forge({ jti: randomUUID() }));
  });

  it('firma válida pero la sesión pertenece a OTRO admin => 401', async () => {
    const context = await contextWithAdmin();
    await addAdmin(context, 'otro@mgdetailing.test', 'otra-clave-123456');
    const jti = randomUUID();
    registerSession(context, jti, 2);
    await expectRejected(context, await forge({ jti, sub: '1' }));
  });

  it('cambiar la contraseña del admin cierra todas sus sesiones abiertas', async () => {
    const context = await contextWithAdmin();
    const client = await loginClient(context);
    expect((await client.get('/api/auth/me')).status).toBe(200);

    const { admins, sessions } = createSqliteRepositories(context.db);
    const result = await saveAdmin(
      { admins, sessions },
      { email: ADMIN_EMAIL, password: 'una-clave-nueva-123' },
      { params: TEST_SCRYPT_PARAMS, now: NOW },
    );
    expect(result).toEqual({ created: false, revokedSessions: 1 });

    expect((await client.get('/api/auth/me')).status).toBe(401);
    // La clave vieja ya no sirve y la nueva sí.
    expect((await rawPost(context.app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })).status).toBe(401);
    expect((await rawPost(context.app, '/api/auth/login').send({ email: ADMIN_EMAIL, password: 'una-clave-nueva-123' })).status).toBe(200);
  });
});
