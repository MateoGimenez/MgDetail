import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BACKEND_ROOT } from '../src/config.js';
import { ORIGIN, addAdmin, closeAllContexts, createTestContext, loginClient, validBooking } from './helpers.js';

afterEach(closeAllContexts);

let dist: string;

beforeAll(() => {
  dist = mkdtempSync(path.join(tmpdir(), 'mg-dist-'));
  mkdirSync(path.join(dist, 'assets'));
  mkdirSync(path.join(dist, 'fotos'));
  writeFileSync(path.join(dist, 'fotos', 'taller.jpg'), 'no-es-un-jpg-real');
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><body><div id="root">SPA</div></body></html>');
  writeFileSync(path.join(dist, 'assets', 'app.abc123.js'), 'console.log("app");');
  writeFileSync(path.join(dist, 'assets', 'big.abc123.js'), 'console.log("una línea repetida de JavaScript");\n'.repeat(200));
  writeFileSync(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(path.join(dist, '.secreto'), 'no-se-sirve');
});

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
});

function frontendApp() {
  return createTestContext({ config: { serveFrontend: true, frontendDistPath: dist } });
}

describe('SERVE_FRONTEND=true', () => {
  it('sirve index.html en / y hace fallback SPA en rutas que no son /api (ej.: /admin)', async () => {
    const { app } = frontendApp();

    for (const url of ['/', '/admin', '/admin/turnos', '/servicios/pulido']) {
      const response = await request(app).get(url);
      expect(response.status, url).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.text, url).toContain('id="root"');
      expect(response.headers['cache-control'], url).toBe('no-cache');
    }
  });

  it('los archivos de /assets se sirven con caché larga e inmutable', async () => {
    const { app } = frontendApp();
    const response = await request(app).get('/assets/app.abc123.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('las fotos de /fotos se cachean 7 días (sin hash en el nombre) y las demás rutas estáticas se revalidan', async () => {
    const { app } = frontendApp();

    const photo = await request(app).get('/fotos/taller.jpg');
    expect(photo.status).toBe(200);
    expect(photo.headers['cache-control']).toBe('public, max-age=604800');

    const favicon = await request(app).get('/favicon.svg');
    expect(favicon.status).toBe(200);
    expect(favicon.headers['cache-control']).toBe('public, max-age=0');
    expect((await request(app).get('/fotos/no-existe.jpg')).status).toBe(404);
  });

  it('un archivo con extensión que no existe da 404, no el HTML de la SPA', async () => {
    const { app } = frontendApp();

    for (const url of ['/assets/viejo.js', '/imagen.png', '/robots.txt']) {
      const response = await request(app).get(url);
      expect(response.status, url).toBe(404);
      expect(response.text, url).not.toContain('id="root"');
    }
  });

  it('las rutas /api desconocidas siguen dando 404 JSON (nunca el HTML de la SPA)', async () => {
    const { app } = frontendApp();

    for (const url of ['/api/no-existe', '/api', '/api/', '/API/no-existe', '/api/admin/algo']) {
      const response = await request(app).get(url);
      expect(response.headers['content-type'], url).toMatch(/application\/json/);
      expect(response.text, url).not.toContain('id="root"');
    }
    expect((await request(app).get('/api/no-existe')).body.error.code).toBe('NOT_FOUND');
  });

  it('la API sigue funcionando al lado del frontend', async () => {
    const { app } = frontendApp();
    const health = await request(app).get('/api/health');
    expect(health.body).toEqual({ status: 'ok' });

    const booking = await request(app).post('/api/bookings').set('Origin', ORIGIN).set('Content-Type', 'application/json').send(validBooking());
    expect(booking.status).toBe(201);
  });

  it('no sirve archivos ocultos (dotfiles) y tampoco los "simula" con el HTML de la SPA', async () => {
    const { app } = frontendApp();

    for (const url of ['/.secreto', '/.env', '/.git/config', '/assets/.secreto', '/admin/.hidden/x']) {
      const response = await request(app).get(url);
      expect(response.status, url).toBe(404);
      expect(response.text, url).not.toContain('no-se-sirve');
      expect(response.text, url).not.toContain('id="root"');
    }
  });

  it('no permite salir de la carpeta del build (path traversal)', async () => {
    const { app } = frontendApp();
    const attempts = [
      '/..%2f..%2fpackage.json',
      '/%2e%2e/%2e%2e/package.json',
      '/assets/..%2f..%2f..%2fpackage.json',
      '/assets/../../package.json',
      '/..%5c..%5cpackage.json',
    ];

    for (const url of attempts) {
      const response = await request(app).get(url);
      expect(response.text, url).not.toContain('mgdetailing-backend');
      expect(response.text, url).not.toContain('"dependencies"');
    }
  });

  it('la SPA lleva una CSP restrictiva y la API la suya (default-src none)', async () => {
    const { app } = frontendApp();

    const page = await request(app).get('/admin');
    const csp = page.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    // CSP recortada a lo real: todo propio, fuentes autoalojadas, sin iframes.
    const directives = String(csp).split(';');
    expect(directives).toEqual(
      expect.arrayContaining([
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "font-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ]),
    );
    expect(csp).not.toMatch(/unsafe-(inline|eval)/);
    expect(csp).not.toMatch(/google|gstatic|https:/i);
    expect(page.headers['x-frame-options']).toBe('DENY');
    expect(page.headers['x-content-type-options']).toBe('nosniff');

    const api = await request(app).get('/api/health');
    expect(api.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
  });

  it('comprime los estáticos grandes (gzip) pero nunca las respuestas de /api', async () => {
    const context = frontendApp();
    // Datos suficientes para que la API devuelva una respuesta grande (> umbral de compresión de 1 kb).
    const insert = context.db.prepare(
      "INSERT INTO bookings (id, nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja, estado, created_at, updated_at) VALUES (?, ?, '3804123456', 'auto', 'pulido', '2026-10-20', 'manana', 'pendiente', 't', 't')",
    );
    for (let index = 0; index < 20; index++) insert.run(`id-${String(index)}`, `Cliente número ${String(index)}`);
    await addAdmin(context);
    const admin = await loginClient(context);

    const asset = await request(context.app).get('/assets/big.abc123.js').set('Accept-Encoding', 'gzip');
    expect(asset.status).toBe(200);
    expect(asset.headers['content-encoding']).toBe('gzip');
    expect(asset.headers.vary).toMatch(/Accept-Encoding/i);

    const page = await request(context.app).get('/admin').set('Accept-Encoding', 'gzip');
    expect(page.headers['content-encoding']).toBeUndefined(); // index.html chico: bajo el umbral

    const api = await request(context.app).get('/api/health').set('Accept-Encoding', 'gzip');
    expect(api.headers['content-encoding']).toBeUndefined();

    // Respuesta grande de la API (listado de turnos con sesión): tampoco se comprime.
    const listing = await admin.get('/api/admin/bookings?limit=100').set('Accept-Encoding', 'gzip');
    expect(listing.status).toBe(200);
    expect(Number(listing.headers['content-length'])).toBeGreaterThan(1024);
    expect(listing.headers['content-encoding']).toBeUndefined();
  });

  it('en producción la CSP de la SPA agrega upgrade-insecure-requests', async () => {
    const { app } = createTestContext({
      config: { serveFrontend: true, frontendDistPath: dist, isProduction: true, nodeEnv: 'production' },
    });
    const response = await request(app).get('/');

    expect(response.headers['content-security-policy']).toContain('upgrade-insecure-requests');
  });

  it('si no existe el build del frontend, falla al crear la app con un mensaje claro', () => {
    expect(() =>
      createTestContext({ config: { serveFrontend: true, frontendDistPath: path.join(BACKEND_ROOT, 'no-existe', 'dist') } }),
    ).toThrow(/SERVE_FRONTEND está activo pero no existe .*index\.html/);
  });
});

describe('SERVE_FRONTEND=false (por defecto)', () => {
  it('no sirve ningún archivo del frontend', async () => {
    const { app } = createTestContext({ config: { frontendDistPath: dist } });

    for (const url of ['/', '/admin', '/assets/app.abc123.js', '/favicon.svg']) {
      const response = await request(app).get(url);
      expect(response.status, url).toBe(404);
      expect(response.body.error.code, url).toBe('NOT_FOUND');
    }
  });
});
