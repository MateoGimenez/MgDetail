import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMITS } from '../src/config.js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ORIGIN,
  addAdmin,
  closeAllContexts,
  countRows,
  createTestContext,
  rawPost,
  validBooking,
} from './helpers.js';

afterEach(closeAllContexts);

const EVIL_ORIGIN = 'https://sitio-malicioso.example';

describe('defensa CSRF: Content-Type', () => {
  it('POST sin Content-Type JSON => 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const { app, db } = await createTestContext();
    const response = await request(app)
      .post('/api/bookings')
      .set('Origin', ORIGIN)
      .type('form')
      .send('nombre=Juan&telefono=3804123456');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'El formato de la solicitud no es válido. Tiene que enviarse como JSON.',
      },
    });
    expect(await countRows(db, 'bookings')).toBe(0);
  });

  it('text/plain (el truco clásico para enviar JSON sin preflight) => 415', async () => {
    const { app, db } = await createTestContext();
    const response = await request(app)
      .post('/api/bookings')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(validBooking()));

    expect(response.status).toBe(415);
    expect(await countRows(db, 'bookings')).toBe(0);
  });

  it('application/json con charset y mayúsculas es válido', async () => {
    const { app } = await createTestContext();
    const response = await request(app)
      .post('/api/bookings')
      .set('Content-Type', 'Application/JSON; charset=UTF-8')
      .send(JSON.stringify(validBooking()));

    expect(response.status).toBe(201);
  });
});

describe('defensa CSRF: Origin', () => {
  it('Origin ajeno => 403 FORBIDDEN_ORIGIN y no se hace nada', async () => {
    const { app, db } = await createTestContext();
    const response = await request(app)
      .post('/api/bookings')
      .set('Origin', EVIL_ORIGIN)
      .set('Content-Type', 'application/json')
      .send(validBooking());

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN_ORIGIN', message: 'No podemos procesar la solicitud desde este sitio.' },
    });
    expect(await countRows(db, 'bookings')).toBe(0);
  });

  it('Origin ajeno en el login => 403, sin cookie', async () => {
    const context = await createTestContext();
    await addAdmin(context);
    const response = await request(context.app)
      .post('/api/auth/login')
      .set('Origin', EVIL_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('el Origin tiene que coincidir exactamente: otro puerto, otro esquema, subdominio o "null" se rechazan', async () => {
    const { app } = await createTestContext();
    for (const origin of [
      'http://localhost:5174',
      'https://localhost:5173',
      'http://localhost',
      'http://127.0.0.1:5173',
      'http://localhost:5173.evil.example',
      'http://sub.localhost:5173',
      'http://localhost:5173/',
      'null',
      '',
    ]) {
      const response = await request(app)
        .post('/api/bookings')
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .send(validBooking());
      expect(response.status, `Origin: "${origin}"`).toBe(403);
    }
  });

  it('sin cabecera Origin (curl, scripts) se acepta: no es un navegador cross-origin', async () => {
    const { app } = await createTestContext();
    const response = await request(app).post('/api/bookings').set('Content-Type', 'application/json').send(validBooking());

    expect(response.status).toBe(201);
  });

  it('GET con Origin ajeno no es bloqueado por la defensa CSRF pero no recibe cabeceras CORS', async () => {
    const { app } = await createTestContext();
    const response = await request(app).get('/api/health').set('Origin', EVIL_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

describe('CORS', () => {
  it('al origen del frontend le permite credenciales y refleja SOLO ese origen', async () => {
    const { app } = await createTestContext();
    const response = await request(app).get('/api/health').set('Origin', ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers.vary).toMatch(/Origin/i);
  });

  it('preflight del origen permitido: 204 con métodos y cabeceras acotados', async () => {
    const { app } = await createTestContext();
    const response = await request(app)
      .options('/api/admin/bookings/abc')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-methods']).toBe('GET,POST,PATCH,DELETE');
    expect(response.headers['access-control-allow-headers']).toBe('Content-Type');
    expect(response.headers['access-control-max-age']).toBe('600');
  });

  it('preflight de un origen ajeno: sin ninguna cabecera CORS (el navegador lo bloquea)', async () => {
    const { app } = await createTestContext();
    const response = await request(app)
      .options('/api/bookings')
      .set('Origin', EVIL_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(response.headers['access-control-allow-methods']).toBeUndefined();
  });
});

describe('errores de parseo del body', () => {
  it('JSON mal formado => 400 INVALID_JSON (sin eco del contenido ni del error de parseo)', async () => {
    const { app } = await createTestContext();
    const response = await rawPost(app, '/api/bookings').send('{"nombre": "Juan", ');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'INVALID_JSON', message: 'No pudimos leer los datos enviados: el JSON no es válido.' },
    });
    expect(response.text).not.toContain('Juan');
    expect(response.text).not.toMatch(/Unexpected|position|SyntaxError/i);
  });

  it('body de más de 10 kb => 413 PAYLOAD_TOO_LARGE', async () => {
    const { app, db } = await createTestContext();
    const response = await rawPost(app, '/api/bookings').send(JSON.stringify(validBooking({ comentario: 'x'.repeat(11 * 1024) })));

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Los datos enviados son demasiado grandes.' },
    });
    expect(await countRows(db, 'bookings')).toBe(0);
  });

  it('un body comprimido (Content-Encoding: gzip) se rechaza: no se descomprime nada', async () => {
    const { app } = await createTestContext();
    const response = await request(app)
      .post('/api/bookings')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send(Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]));

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('ninguna respuesta de error incluye stack traces ni rutas de archivos', async () => {
    const { app } = await createTestContext();
    const responses = await Promise.all([
      rawPost(app, '/api/bookings').send('{'),
      rawPost(app, '/api/bookings').send({}),
      request(app).get('/api/nada'),
      request(app).post('/api/bookings').send('x'),
    ]);

    for (const response of responses) {
      expect(response.text).not.toMatch(/node_modules|\.ts:\d+|\.js:\d+|at Object\.|at async|stack/i);
      expect(Object.keys(response.body.error as object).sort()).toEqual(
        expect.arrayContaining(['code', 'message']),
      );
    }
  });
});

describe('rate limit de solicitudes de turno (5 por IP cada 15 min)', () => {
  it('permite 5 turnos y el 6.º recibe 429 RATE_LIMITED', async () => {
    const { app, db } = await createTestContext({ config: { rateLimits: DEFAULT_RATE_LIMITS } });

    for (let index = 1; index <= 5; index++) {
      const response = await rawPost(app, '/api/bookings').send(validBooking());
      expect(response.status, `turno ${String(index)}`).toBe(201);
    }

    const blocked = await rawPost(app, '/api/bookings').send(validBooking());
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message:
          'Enviaste demasiadas solicitudes de turno en poco tiempo. Probá de nuevo en unos minutos o escribinos por WhatsApp.',
      },
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(await countRows(db, 'bookings')).toBe(5);
  });

  it('los pedidos rechazados por validación no gastan cupo', async () => {
    const { app } = await createTestContext({ config: { rateLimits: DEFAULT_RATE_LIMITS } });

    for (let index = 0; index < 8; index++) {
      const invalid = await rawPost(app, '/api/bookings').send(validBooking({ telefono: 'x' }));
      expect(invalid.status).toBe(400);
    }
    for (let index = 0; index < 5; index++) {
      const valid = await rawPost(app, '/api/bookings').send(validBooking());
      expect(valid.status, `válido ${String(index + 1)}`).toBe(201);
    }
    expect((await rawPost(app, '/api/bookings').send(validBooking())).status).toBe(429);
  });

  it('los envíos descartados por honeypot SÍ cuentan (un bot no puede spamear gratis)', async () => {
    const { app } = await createTestContext({ config: { rateLimits: DEFAULT_RATE_LIMITS } });

    for (let index = 0; index < 5; index++) {
      const response = await rawPost(app, '/api/bookings').send(validBooking({ website: 'spam' }));
      expect(response.status).toBe(201);
    }
    expect((await rawPost(app, '/api/bookings').send(validBooking({ website: 'spam' }))).status).toBe(429);
  });

  it('el límite es por IP: con TRUST_PROXY=1 otra IP real tiene su propio cupo', async () => {
    const { app } = await createTestContext({ config: { rateLimits: DEFAULT_RATE_LIMITS, trustProxy: 1 } });

    for (let index = 0; index < 5; index++) {
      await rawPost(app, '/api/bookings').set('X-Forwarded-For', '198.51.100.10').send(validBooking());
    }
    expect((await rawPost(app, '/api/bookings').set('X-Forwarded-For', '198.51.100.10').send(validBooking())).status).toBe(429);
    expect((await rawPost(app, '/api/bookings').set('X-Forwarded-For', '198.51.100.11').send(validBooking())).status).toBe(201);
  });
});

describe('rate limit general de la API', () => {
  it('al superar el tope por IP responde 429 aunque la ruta sea inocua', async () => {
    const { app } = await createTestContext({
      config: {
        rateLimits: { ...DEFAULT_RATE_LIMITS, api: { windowMs: 60_000, limit: 5 } },
      },
    });

    for (let index = 0; index < 5; index++) {
      expect((await request(app).get('/api/health')).status).toBe(200);
    }
    const blocked = await request(app).get('/api/health');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('el tope general se aplica antes que el parseo del body y la defensa CSRF', async () => {
    const { app } = await createTestContext({
      config: {
        rateLimits: { ...DEFAULT_RATE_LIMITS, api: { windowMs: 60_000, limit: 2 } },
      },
    });

    await request(app).get('/api/health');
    await request(app).get('/api/health');
    const blocked = await request(app).post('/api/bookings').set('Content-Type', 'text/plain').send('x');
    expect(blocked.status).toBe(429);
  });
});

describe('varios orígenes permitidos (FRONTEND_ORIGIN con una lista, ej.: probar desde el celular por la red local)', () => {
  const LAN_ORIGIN = 'http://192.168.0.10:5173';
  const twoOrigins = { frontendOrigins: [ORIGIN, LAN_ORIGIN] };

  it('los dos orígenes pueden crear turnos; uno que no está en la lista recibe 403', async () => {
    const { app, db } = await createTestContext({ config: twoOrigins });

    for (const origin of [ORIGIN, LAN_ORIGIN]) {
      const response = await request(app)
        .post('/api/bookings')
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .send(validBooking());
      expect(response.status, origin).toBe(201);
    }

    for (const origin of [EVIL_ORIGIN, 'http://192.168.0.10:5174', 'http://192.168.0.11:5173', 'https://192.168.0.10:5173']) {
      const response = await request(app)
        .post('/api/bookings')
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .send(validBooking());
      expect(response.status, origin).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN_ORIGIN');
    }
    expect(await countRows(db, 'bookings')).toBe(2);
  });

  it('CORS refleja únicamente el origen que coincide (nunca la lista completa ni *)', async () => {
    const { app } = await createTestContext({ config: twoOrigins });

    for (const origin of [ORIGIN, LAN_ORIGIN]) {
      const response = await request(app).get('/api/health').set('Origin', origin);
      expect(response.headers['access-control-allow-origin'], origin).toBe(origin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers.vary).toMatch(/Origin/i);
    }

    const stranger = await request(app).get('/api/health').set('Origin', EVIL_ORIGIN);
    expect(stranger.headers['access-control-allow-origin']).toBeUndefined();
  });
});
