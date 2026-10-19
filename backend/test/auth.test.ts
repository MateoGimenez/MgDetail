import { randomUUID } from 'node:crypto';
import { SignJWT, UnsecuredJWT, generateKeyPair } from 'jose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMITS } from '../src/config.js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  NOW,
  ORIGIN,
  type TestContext,
  addAdmin,
  addUser,
  closeAllContexts,
  cookieHeader,
  cookieValue,
  createClient,
  createTestContext,
  loginClient,
  rawPost,
  setCookieFor,
} from './helpers.js';
import { PUBLISHABLE_KEY, SUPABASE_ISSUER, TEST_KID, signAccessToken } from './supabase-fake.js';

afterEach(closeAllContexts);

const TWO_HOURS_LATER = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);

const credentials = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD };

async function contextWithAdmin(options: Parameters<typeof createTestContext>[0] = {}) {
  const context = await createTestContext(options);
  const userId = await addAdmin(context);
  return { context, userId };
}


const INVALID_CREDENTIALS_MESSAGE =
  'El email o la contraseña no son correctos, o tu usuario todavía no está habilitado para el panel.';
describe('POST /api/auth/login (Supabase Auth, BFF)', () => {
  it('con credenciales correctas responde 200 { usuario } y guarda los tokens SOLO en cookies httpOnly', async () => {
    const { context, userId } = await contextWithAdmin();
    const response = await rawPost(context.app, '/api/auth/login').send(credentials);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ usuario: { id: userId, email: ADMIN_EMAIL, nombre: null, rol: 'admin' } });
    expect(JSON.stringify(response.body)).not.toMatch(/token|eyJ/);

    const access = setCookieFor(response, 'mg_at') ?? '';
    const refresh = setCookieFor(response, 'mg_rt') ?? '';
    expect(access).toMatch(/^mg_at=eyJ[^;]+; Max-Age=28800; Path=\/api; Expires=[^;]+; HttpOnly; SameSite=Strict$/);
    expect(refresh).toMatch(/^mg_rt=[^;]+; Max-Age=28800; Path=\/api\/auth; Expires=[^;]+; HttpOnly; SameSite=Strict$/);

    // El backend llamó a Supabase con la clave publishable; el log solo tiene el id del usuario.
    expect(context.supabase.calls).toEqual([{ path: '/token?grant_type=password', apikey: PUBLISHABLE_KEY, bearer: false }]);
    expect(context.logger.text).toContain(`Inicio de sesión usuario=${userId} rol=admin`);
    expect(context.logger.text).not.toContain(ADMIN_EMAIL);
    expect(context.logger.text).not.toContain(cookieValue(response, 'mg_at') ?? 'x');
  });

  it('en producción las dos cookies además son Secure', async () => {
    const { context } = await contextWithAdmin({ config: { isProduction: true, nodeEnv: 'production' } });
    const response = await rawPost(context.app, '/api/auth/login').send(credentials);

    expect(setCookieFor(response, 'mg_at')).toMatch(/; Secure;/);
    expect(setCookieFor(response, 'mg_rt')).toMatch(/; Secure;/);
  });

  it('contraseña incorrecta y email inexistente dan exactamente la misma respuesta 401, sin cookies', async () => {
    const { context } = await contextWithAdmin();
    const wrong = await rawPost(context.app, '/api/auth/login').send({ ...credentials, password: 'otra-clave-123' });
    const unknown = await rawPost(context.app, '/api/auth/login').send({ ...credentials, email: 'nadie@x.com' });

    for (const response of [wrong, unknown]) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: { code: 'INVALID_CREDENTIALS', message: INVALID_CREDENTIALS_MESSAGE },
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('validación del body: faltan campos, campos extra y email mal formado => 400 (sin llamar a Supabase)', async () => {
    const { context } = await contextWithAdmin();
    for (const body of [{}, { email: ADMIN_EMAIL }, { ...credentials, extra: 1 }, { email: 'no-es-email', password: 'x' }]) {
      const response = await rawPost(context.app, '/api/auth/login').send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(context.supabase.calls).toHaveLength(0);
  });

  it('usuario inactivo o sin perfil => el MISMO 401 que una contraseña incorrecta (sin oráculo), sin cookies, y la sesión se cierra en Supabase', async () => {
    const context = await createTestContext();
    await addUser(context, { email: 'nuevo@mgdetailing.test', rol: 'empleado', activo: false });
    const sinPerfil = await addUser(context, { email: 'sinperfil@mgdetailing.test' });
    await context.db.sql.query('DELETE FROM mgdetailing.perfiles WHERE id = $1::uuid', [sinPerfil]);

    for (const email of ['nuevo@mgdetailing.test', 'sinperfil@mgdetailing.test']) {
      const response = await rawPost(context.app, '/api/auth/login').send({ email, password: ADMIN_PASSWORD });
      expect(response.status, email).toBe(401);
      expect(response.body).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: INVALID_CREDENTIALS_MESSAGE } });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    // La revocación va en segundo plano (no demora la respuesta), pero se hace.
    await expect.poll(() => context.supabase.sessionCount()).toBe(0);
  });

  it('si Supabase Auth no responde => 503; si limita los pedidos => 429 (sin detalles internos)', async () => {
    const { context } = await contextWithAdmin();

    context.supabase.mode = 'down';
    const down = await rawPost(context.app, '/api/auth/login').send(credentials);
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe('SERVICE_UNAVAILABLE');

    context.supabase.mode = 'error';
    expect((await rawPost(context.app, '/api/auth/login').send(credentials)).status).toBe(503);

    context.supabase.mode = 'rate';
    const limited = await rawPost(context.app, '/api/auth/login').send(credentials);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(context.logger.errors).toHaveLength(0);
  });
});

describe('POST /api/auth/login: rate limit de intentos fallidos', () => {
  it('al 6.º intento fallido de la misma IP responde 429; un X-Forwarded-For falso no lo esquiva', async () => {
    const { context } = await contextWithAdmin({ config: { rateLimits: DEFAULT_RATE_LIMITS } });
    const bad = { ...credentials, password: 'incorrecta-1234' };
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await rawPost(context.app, '/api/auth/login').send(bad)).status).toBe(401);
    }
    const blocked = await rawPost(context.app, '/api/auth/login').set('X-Forwarded-For', '203.0.113.9').send(credentials);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});

describe('GET /api/auth/me', () => {
  it('sin sesión => 401 UNAUTHORIZED; con sesión => { usuario: { id, email, nombre, rol } }', async () => {
    const { context, userId } = await contextWithAdmin();
    const anonymous = await request(context.app).get('/api/auth/me');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHORIZED');

    await context.db.sql.query("UPDATE mgdetailing.perfiles SET nombre = 'Mateo' WHERE id = $1::uuid", [userId]);
    const client = await loginClient(context);
    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ usuario: { id: userId, email: ADMIN_EMAIL, nombre: 'Mateo', rol: 'admin' } });
  });
});

describe('refresco de la sesión', () => {
  it('con el access token vencido, /api/admin responde 401 SESSION_EXPIRED; POST /api/auth/refresh rota los tokens y se sigue', async () => {
    const { context } = await contextWithAdmin();
    const client = await loginClient(context);

    context.clock.current = TWO_HOURS_LATER;
    const expired = await client.get('/api/admin/bookings');
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('SESSION_EXPIRED');
    expect(expired.headers['set-cookie']).toBeUndefined(); // no borra nada: se puede refrescar

    const refreshed = await client.post('/api/auth/refresh');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.usuario.email).toBe(ADMIN_EMAIL);
    expect(cookieValue(refreshed, 'mg_at')).toMatch(/^eyJ/);
    expect(cookieValue(refreshed, 'mg_rt')).toMatch(/.+/);

    expect((await client.get('/api/admin/bookings')).status).toBe(200);
  });

  it('GET /api/auth/me refresca solo (ahí sí viaja el refresh token) y reescribe las cookies', async () => {
    const { context } = await contextWithAdmin();
    const client = await loginClient(context);
    context.clock.current = TWO_HOURS_LATER;

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(setCookieFor(me, 'mg_at')).toMatch(/^mg_at=eyJ.*Path=\/api;/);
    expect(setCookieFor(me, 'mg_rt')).toMatch(/Path=\/api\/auth;/);
    expect(context.supabase.calls.map((call) => call.path)).toContain('/token?grant_type=refresh_token');
  });

  it('un refresh token ya usado (o revocado) => 401, borra las cookies y Supabase cierra la sesión', async () => {
    const { context } = await contextWithAdmin();
    const login = await rawPost(context.app, '/api/auth/login').send(credentials);
    const oldCookies = cookieHeader(login);

    context.clock.current = TWO_HOURS_LATER;
    const first = await rawPost(context.app, '/api/auth/refresh').set('Cookie', oldCookies);
    expect(first.status).toBe(200);

    const reused = await rawPost(context.app, '/api/auth/refresh').set('Cookie', oldCookies);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('UNAUTHORIZED');
    expect(cookieValue(reused, 'mg_at')).toBe('');
    expect(cookieValue(reused, 'mg_rt')).toBe('');

    // La detección de reuso revocó la sesión entera: el par nuevo tampoco sirve.
    const second = await request(context.app).get('/api/admin/bookings').set('Cookie', cookieHeader(first));
    expect(second.status).toBe(401);
  });

  it('sin refresh token, POST /api/auth/refresh => 401', async () => {
    const { context } = await contextWithAdmin();
    expect((await rawPost(context.app, '/api/auth/refresh')).status).toBe(401);
  });

  it('un mg_rt inventado (sin mg_at auténtico) no llega a Supabase: no gasta el cupo de Auth que comparten todos', async () => {
    const { context } = await contextWithAdmin();
    for (const cookie of ['mg_rt=inventado', 'mg_rt=inventado; mg_at=eyJhbGciOiJFUzI1NiJ9.e30.firma-falsa']) {
      expect((await rawPost(context.app, '/api/auth/refresh').set('Cookie', cookie)).status, cookie).toBe(401);
      expect((await request(context.app).get('/api/auth/me').set('Cookie', cookie)).status, cookie).toBe(401);
      expect((await rawPost(context.app, '/api/auth/logout').set('Cookie', cookie)).status, cookie).toBe(204);
    }
    expect(context.supabase.calls).toHaveLength(0);
  });
});

describe('POST /api/auth/logout', () => {
  it('responde 204, cierra la sesión en Supabase y el access token viejo deja de servir aunque no haya vencido', async () => {
    const { context } = await contextWithAdmin();
    const login = await rawPost(context.app, '/api/auth/login').send(credentials);
    const cookies = cookieHeader(login);

    const logout = await rawPost(context.app, '/api/auth/logout').set('Cookie', cookies);
    expect(logout.status).toBe(204);
    expect(cookieValue(logout, 'mg_at')).toBe('');
    expect(cookieValue(logout, 'mg_rt')).toBe('');
    expect(context.supabase.calls.at(-1)).toEqual({ path: '/logout?scope=local', apikey: PUBLISHABLE_KEY, bearer: true });
    expect(await context.supabase.sessionCount()).toBe(0);

    // Reutilizar el token robado después de salir: la sesión ya no está en auth.sessions.
    const reuse = await request(context.app).get('/api/admin/bookings').set('Cookie', cookies);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('UNAUTHORIZED');
  });

  it('con el access token vencido refresca primero y cierra igual; sin sesión también responde 204', async () => {
    const { context } = await contextWithAdmin();
    const client = await loginClient(context);
    context.clock.current = TWO_HOURS_LATER;

    expect((await client.post('/api/auth/logout')).status).toBe(204);
    expect(await context.supabase.sessionCount()).toBe(0);
    expect((await rawPost(context.app, '/api/auth/logout')).status).toBe(204);
  });
});

describe('tokens manipulados o inválidos', () => {
  /** Un usuario con una sesión registrada en auth.sessions, para firmar tokens a mano. */
  async function session(context: TestContext, userId: string): Promise<string> {
    const sessionId = randomUUID();
    await context.db.sql.query('INSERT INTO auth.sessions (id, user_id) VALUES ($1::uuid, $2::uuid)', [sessionId, userId]);
    return sessionId;
  }

  const getWithToken = (context: TestContext, token: string) =>
    request(context.app).get('/api/admin/bookings').set('Origin', ORIGIN).set('Cookie', `mg_at=${token}`);

  it('control: un token bien firmado, del proyecto y con sesión vigente, funciona (valida el helper)', async () => {
    const { context, userId } = await contextWithAdmin();
    const token = await signAccessToken(userId, await session(context, userId), NOW);
    expect((await getWithToken(context, token)).status).toBe(200);
  });

  it('firma inválida, alg incorrecto (HS256 / none), iss o aud ajenos, sesión desconocida => 401 y borra las cookies', async () => {
    const { context, userId } = await contextWithAdmin();
    const sessionId = await session(context, userId);
    const otherKey = (await generateKeyPair('ES256')).privateKey;
    const now = Math.floor(NOW.getTime() / 1000);

    const forged: Record<string, string> = {
      'firmado con otra clave': await signAccessToken(userId, sessionId, NOW, { key: otherKey }),
      'HS256 con la clave publishable como secreto': await new SignJWT({ role: 'authenticated', session_id: sessionId })
        .setProtectedHeader({ alg: 'HS256', kid: TEST_KID })
        .setIssuer(SUPABASE_ISSUER)
        .setAudience('authenticated')
        .setSubject(userId)
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(new TextEncoder().encode(PUBLISHABLE_KEY)),
      'alg none': new UnsecuredJWT({ role: 'authenticated', session_id: sessionId })
        .setIssuer(SUPABASE_ISSUER)
        .setAudience('authenticated')
        .setSubject(userId)
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .encode(),
      'iss de otro proyecto': await signAccessToken(userId, sessionId, NOW, { iss: 'https://otro.supabase.co/auth/v1' }),
      'aud anon': await signAccessToken(userId, sessionId, NOW, { aud: 'anon' }),
      'usuario anónimo': await signAccessToken(userId, sessionId, NOW, { claims: { is_anonymous: true } }),
      'sesión que no existe en auth.sessions': await signAccessToken(userId, randomUUID(), NOW),
      basura: 'no-es-un-jwt',
    };

    for (const [caso, token] of Object.entries(forged)) {
      const response = await getWithToken(context, token);
      expect(response.status, caso).toBe(401);
      expect(response.body.error.code, caso).toBe('UNAUTHORIZED');
      expect(cookieValue(response, 'mg_at'), caso).toBe('');
    }
  });

  it('un token vencido sin refresh token => 401 SESSION_EXPIRED (también en /api/auth/me)', async () => {
    const { context, userId } = await contextWithAdmin();
    const sessionId = await session(context, userId);
    const now = Math.floor(NOW.getTime() / 1000);
    const token = await signAccessToken(userId, sessionId, NOW, { iat: now - 7200, exp: now - 3600 });

    const admin = await getWithToken(context, token);
    expect(admin.status).toBe(401);
    expect(admin.body.error.code).toBe('SESSION_EXPIRED');

    const me = await request(context.app).get('/api/auth/me').set('Cookie', `mg_at=${token}`);
    expect(me.body.error.code).toBe('SESSION_EXPIRED');
  });
});

describe('el perfil se lee en cada request', () => {
  it('desactivar a un usuario con la sesión abierta lo saca en el siguiente request (403 NO_ACCESS y cookies borradas)', async () => {
    const { context, userId } = await contextWithAdmin();
    const client = await loginClient(context);
    expect((await client.get('/api/admin/bookings')).status).toBe(200);

    await context.db.sql.query('UPDATE mgdetailing.perfiles SET activo = false WHERE id = $1::uuid', [userId]);

    const kicked = await client.get('/api/admin/bookings');
    expect(kicked.status).toBe(403);
    expect(kicked.body.error.code).toBe('NO_ACCESS');
    expect(cookieValue(kicked, 'mg_at')).toBe('');
    expect(await context.supabase.sessionCount()).toBe(0); // también se cerró en Supabase
    expect((await client.get('/api/auth/me')).status).toBe(401);
  });

  it('un cambio de rol tiene efecto inmediato: el admin que pasa a empleado ya no puede borrar', async () => {
    const { context, userId } = await contextWithAdmin();
    const client = await loginClient(context);
    const turno = await createClient(context.app).post('/api/bookings', {
      nombre: 'Cliente',
      telefono: '3804123456',
      vehiculoTipo: 'auto',
      servicioId: 'pulido',
      fechaPreferida: '2026-10-20',
      franja: 'manana',
    });

    await context.db.sql.query("UPDATE mgdetailing.perfiles SET rol_id = 'empleado' WHERE id = $1::uuid", [userId]);

    const response = await client.delete(`/api/admin/bookings/${String(turno.body.booking.id)}`);
    expect(response.status).toBe(403);
    expect((await client.get('/api/auth/me')).body.usuario.rol).toBe('empleado');
  });
});
