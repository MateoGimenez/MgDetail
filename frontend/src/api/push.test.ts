import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { borrarSuscripcion, estadoDeAvisos, registrarSuscripcion } from './push';

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

function simular(respuesta: Response) {
  const espia = vi.fn<typeof fetch>(() => Promise.resolve(respuesta));
  vi.stubGlobal('fetch', espia);
  return espia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API de avisos push', () => {
  it('GET estado: lee disponible y clavePublica', async () => {
    const espia = simular(json(200, { disponible: true, clavePublica: 'BClave' }));
    await expect(estadoDeAvisos()).resolves.toEqual({ disponible: true, clavePublica: 'BClave' });
    expect(espia.mock.calls[0]?.[0]).toBe('/api/admin/push/estado');
  });

  it('GET estado: acepta clavePublica null (sin configurar)', async () => {
    simular(json(200, { disponible: false, clavePublica: null }));
    await expect(estadoDeAvisos()).resolves.toEqual({ disponible: false, clavePublica: null });
  });

  it('GET estado: una respuesta con otra forma es INVALID_RESPONSE', async () => {
    simular(json(200, { disponible: 'si' }));
    await expect(estadoDeAvisos()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('POST suscripciones: manda la suscripción como JSON y valida { ok: true }', async () => {
    const espia = simular(json(201, { ok: true }));
    const cuerpo = {
      endpoint: 'https://fcm.googleapis.com/x',
      keys: { p256dh: 'P', auth: 'A' },
      agente: 'Chrome · Android',
    };
    await registrarSuscripcion(cuerpo);
    const [ruta, init] = espia.mock.calls[0] ?? [];
    expect(ruta).toBe('/api/admin/push/suscripciones');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual(cuerpo);
  });

  it('POST suscripciones: 400 con fields.endpoint llega como ApiError con sus campos', async () => {
    simular(json(400, { error: { code: 'VALIDATION_ERROR', message: 'Revisá.', fields: { endpoint: 'No es válido.' } } }));
    const error = await registrarSuscripcion({ endpoint: 'https://x', keys: { p256dh: 'P', auth: 'A' } }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fields).toEqual({ endpoint: 'No es válido.' });
  });

  it('DELETE suscripciones: manda { endpoint } y acepta el 204', async () => {
    const espia = simular(new Response(null, { status: 204 }));
    await expect(borrarSuscripcion('https://fcm.googleapis.com/x')).resolves.toBeUndefined();
    const [ruta, init] = espia.mock.calls[0] ?? [];
    expect(ruta).toBe('/api/admin/push/suscripciones');
    expect(init?.method).toBe('DELETE');
    expect(JSON.parse(init?.body as string)).toEqual({ endpoint: 'https://fcm.googleapis.com/x' });
  });
});
