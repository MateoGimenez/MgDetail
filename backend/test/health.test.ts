import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { closeAllContexts, createTestContext } from './helpers.js';

afterEach(closeAllContexts);

describe('GET /api/health', () => {
  it('responde { status: "ok" } sin cache y sin exponer la tecnología', async () => {
    const { app } = createTestContext();
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('envía las cabeceras de seguridad y una CSP que bloquea todo en la API; HSTS solo en producción', async () => {
    const development = await request(createTestContext().app).get('/api/health');
    expect(development.headers['x-content-type-options']).toBe('nosniff');
    expect(development.headers['x-frame-options']).toBe('DENY');
    expect(development.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
    expect(development.headers['strict-transport-security']).toBeUndefined();

    const production = await request(createTestContext({ config: { isProduction: true, nodeEnv: 'production' } }).app).get(
      '/api/health',
    );
    expect(production.headers['strict-transport-security']).toBe('max-age=15552000');
  });

  it('devuelve 503 SERVICE_UNAVAILABLE sin detalles internos y sin stack en el log si la base no responde', async () => {
    const context = createTestContext();
    context.db.close();
    const response = await request(context.app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'El servicio no está disponible en este momento. Probá de nuevo en unos minutos.',
      },
    });
    expect(context.logger.errors).toHaveLength(0);
  });
});

describe('rutas desconocidas', () => {
  it('/api/<inexistente> y GET /api/bookings (no hay listado público) dan 404 JSON', async () => {
    const { app } = createTestContext();

    for (const url of ['/api/no-existe', '/api/bookings']) {
      const response = await request(app).get(url);
      expect(response.status, url).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No encontramos lo que buscás.' } });
    }
  });

  it('una ruta fuera de /api también da 404 JSON cuando no se sirve el frontend', async () => {
    const response = await request(createTestContext().app).get('/admin');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
