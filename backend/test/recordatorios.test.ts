import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecordatoriosConfig } from '../src/config.js';
import type { Estado, Franja, NewBooking } from '../src/domain/booking.js';
import { PostgresBookingRepository } from '../src/repositories/postgres/bookings.js';
import { bearerValido } from '../src/routes/internal.js';
import { NOW, type TestContext, closeAllContexts, createTestContext, loginAs } from './helpers.js';

afterEach(closeAllContexts);

/*
 * "Hoy" es el viernes 2026-10-16 (La Rioja): los recordatorios son para los confirmados del sábado 2026-10-17.
 * Ningún test toca la red: el fetch es un mock.
 */
const MANANA = '2026-10-17';
const PASADO = '2026-10-18';
const SECRETO = 'un-secreto-de-cron-largo-y-aleatorio-0123456789';
const RESEND_KEY = ['re', 'clavedeprueba0123456789'].join('_');

const EMAIL: NonNullable<RecordatoriosConfig['email']> = { apiKey: RESEND_KEY, from: 'MgDetailing <turnos@mgdetailing.test>' };
const WHATSAPP: NonNullable<RecordatoriosConfig['whatsapp']> = {
  token: 'token-de-meta',
  phoneNumberId: '123456789',
  template: 'recordatorio_turno',
  language: 'es_AR',
};

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

interface Ctx {
  context: TestContext;
  fetch: FetchMock;
  repo: PostgresBookingRepository;
  turno: (opciones?: { fecha?: string; franja?: Franja; estado?: Estado; email?: string | null; telefono?: string }) => Promise<string>;
  correr: (secreto?: string) => Promise<request.Response>;
  marca: (id: string) => Promise<unknown>;
}

async function setup(recordatorios: Partial<RecordatoriosConfig> = {}, status = 200): Promise<Ctx> {
  const fetchMock: FetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{"id":"x"}', { status })));
  const context = await createTestContext({
    config: {
      publicUrl: 'https://mgdetailing.test',
      recordatorios: { cronSecret: SECRETO, email: EMAIL, whatsapp: WHATSAPP, ...recordatorios },
    },
    fetch: fetchMock,
  });
  const repo = new PostgresBookingRepository(context.db.sql);
  const turno: Ctx['turno'] = async (opciones = {}) => {
    const data: NewBooking = {
      nombre: 'Juana Privada',
      telefono: opciones.telefono ?? '3804123456',
      email: opciones.email === undefined ? 'juana@privado.test' : opciones.email,
      vehiculoTipo: 'auto',
      vehiculoModelo: 'Modelo Secreto',
      servicioId: 'pulido',
      fechaPreferida: opciones.fecha ?? MANANA,
      franja: opciones.franja ?? 'manana',
      comentario: 'comentario privado',
    };
    const { id } = await repo.create(data, NOW);
    await repo.updateEstado(id, opciones.estado ?? 'confirmado', NOW);
    return id;
  };
  const correr = (secreto = SECRETO) =>
    request(context.app)
      .post('/api/internal/recordatorios')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${secreto}`);
  const marca = async (id: string) => {
    const { rows } = await context.db.sql.query(
      'SELECT recordatorio_enviado_at FROM mgdetailing.bookings WHERE id = $1::uuid',
      [id],
    );
    return rows[0]?.recordatorio_enviado_at;
  };
  return { context, fetch: fetchMock, repo, turno, correr, marca };
}

/** Las llamadas del mock: URL, cabeceras y body ya parseado. */
function llamadas(fetchMock: FetchMock) {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: url as string,
    headers: (init?.headers ?? {}) as Record<string, string>,
    body: JSON.parse(init?.body as string) as Record<string, unknown>,
  }));
}

describe('POST /api/internal/recordatorios: autorización', () => {
  it('sin CRON_SECRET configurada responde 404 (igual que una ruta inexistente)', async () => {
    const { context } = await setup({ cronSecret: undefined });
    const response = await request(context.app)
      .post('/api/internal/recordatorios')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${SECRETO}`);
    const inexistente = await request(context.app).post('/api/internal/otra').set('Content-Type', 'application/json');
    expect(response.status).toBe(404);
    expect(response.body).toEqual(inexistente.body);
  });

  it('con CRON_SECRET: sin cabecera, con otro secreto o con otro esquema => 401, sin enviar nada', async () => {
    const { context, fetch, turno } = await setup();
    await turno();
    const post = () => request(context.app).post('/api/internal/recordatorios').set('Content-Type', 'application/json');
    for (const authorization of [
      undefined,
      '',
      `Bearer ${SECRETO}x`,
      `Bearer ${SECRETO.slice(0, -1)}`,
      `bearer ${SECRETO}`,
      `Basic ${SECRETO}`,
      `Bearer  ${SECRETO}`,
      SECRETO,
    ]) {
      const response = authorization === undefined ? await post() : await post().set('Authorization', authorization);
      expect(response.status, String(authorization)).toBe(401);
      expect(response.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'No autorizado.' } });
      expect(response.headers['www-authenticate']).toBe('Bearer');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bearerValido compara en tiempo constante sobre el sha256 (largos distintos no rompen)', () => {
    expect(bearerValido(`Bearer ${SECRETO}`, SECRETO)).toBe(true);
    expect(bearerValido(`Bearer ${'x'.repeat(5)}`, SECRETO)).toBe(false);
    expect(bearerValido(`Bearer ${'x'.repeat(600)}`, SECRETO)).toBe(false);
    expect(bearerValido(undefined, SECRETO)).toBe(false);
  });

  it('pasa por el control de CSRF: un Origin ajeno da 403 y sin Content-Type JSON, 415', async () => {
    const { context } = await setup();
    const ajeno = await request(context.app)
      .post('/api/internal/recordatorios')
      .set('Origin', 'https://otro.example')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${SECRETO}`);
    expect(ajeno.status).toBe(403);
    const sinTipo = await request(context.app).post('/api/internal/recordatorios').set('Authorization', `Bearer ${SECRETO}`);
    expect(sinTipo.status).toBe(415);
  });
});

describe('recordatorios: envío', () => {
  it('manda email (Resend) y WhatsApp (plantilla) a los confirmados de mañana; responde exactamente las cantidades', async () => {
    const { context, fetch, turno, correr, marca } = await setup();
    const id = await turno();
    const response = await correr();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enviados: 1, fallidos: 0, sinCanal: 0 });
    expect(Object.keys(response.body as object)).toEqual(['enviados', 'fallidos', 'sinCanal']);

    const [email, whatsapp] = llamadas(fetch);
    expect(email?.url).toBe('https://api.resend.com/emails');
    expect(email?.headers).toMatchObject({
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `recordatorio-${id}-${MANANA}`,
    });
    expect(email?.body).toMatchObject({
      from: EMAIL.from,
      to: ['juana@privado.test'],
      subject: 'Recordatorio: tu turno de mañana en MgDetailing',
    });
    expect(String(email?.body.text)).toContain('Servicio: Pulido');
    expect(String(email?.body.text)).toContain('Día: sábado 17/10');
    expect(String(email?.body.text)).toContain('Franja: mañana');
    expect(String(email?.body.text)).toContain(`https://mgdetailing.test/turno/${id}`);
    // Lo que el cliente no necesita en el recordatorio no viaja.
    expect(JSON.stringify(email?.body)).not.toMatch(/Juana|Modelo Secreto|comentario privado/);

    expect(whatsapp?.url).toBe('https://graph.facebook.com/v23.0/123456789/messages');
    expect(whatsapp?.headers).toMatchObject({ Authorization: 'Bearer token-de-meta' });
    expect(whatsapp?.body).toEqual({
      messaging_product: 'whatsapp',
      to: '5493804123456',
      type: 'template',
      template: {
        name: 'recordatorio_turno',
        language: { code: 'es_AR' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Pulido' },
              { type: 'text', text: 'sábado 17/10' },
              { type: 'text', text: 'mañana' },
            ],
          },
        ],
      },
    });

    expect(await marca(id)).toBeInstanceOf(Date);
    // El log solo tiene cantidades.
    expect(context.logger.text).toContain('Recordatorios: enviados=1 fallidos=0 sinCanal=0');
    expect(context.logger.text).not.toMatch(/Juana|juana@|3804123456|5493804123456|Modelo Secreto/);
  });

  it('idempotente: si el cron corre dos veces, no se manda dos veces; marcar no cambia el "actualizado el"', async () => {
    const { context, fetch, turno, correr } = await setup();
    const id = await turno();
    const antes = (await request(context.app).get(`/api/turnos/${id}`)).body.turno.actualizadoEl as string;
    expect((await correr()).body).toEqual({ enviados: 1, fallidos: 0, sinCanal: 0 });
    expect((await correr()).body).toEqual({ enviados: 0, fallidos: 0, sinCanal: 0 });
    expect(fetch).toHaveBeenCalledTimes(2); // email + WhatsApp, una sola vez
    const despues = await request(context.app).get(`/api/turnos/${id}`);
    expect(despues.body.turno.actualizadoEl).toBe(antes);
  });

  it('solo los confirmados con fecha de AGENDA mañana (la confirmada si existe)', async () => {
    const { fetch, turno, repo, correr } = await setup({ whatsapp: undefined });
    await turno({ estado: 'pendiente' });
    await turno({ estado: 'cancelado' });
    await turno({ estado: 'completado' });
    await turno({ fecha: PASADO });
    const movido = await turno({ fecha: PASADO });
    await repo.reprogramar(movido, { confirmada: { fecha: MANANA, franja: 'tarde' } }, NOW);
    const salido = await turno();
    await repo.reprogramar(salido, { confirmada: { fecha: PASADO, franja: 'tarde' } }, NOW);

    expect((await correr()).body).toEqual({ enviados: 1, fallidos: 0, sinCanal: 0 });
    expect(llamadas(fetch).map((c) => c.headers['Idempotency-Key'])).toEqual([`recordatorio-${movido}-${MANANA}`]);
  });

  it('un envío fallido no marca el turno y se reintenta en la próxima corrida', async () => {
    const { context, fetch, turno, correr, marca } = await setup({ whatsapp: undefined }, 500);
    const id = await turno();
    expect((await correr()).body).toEqual({ enviados: 0, fallidos: 1, sinCanal: 0 });
    expect(await marca(id)).toBeNull();
    expect(context.logger.text).toContain('Recordatorio falló (email, status 500)');

    fetch.mockImplementation(() => Promise.reject(new Error('https://api.resend.com con la clave re_SECRETA')));
    expect((await correr()).body).toEqual({ enviados: 0, fallidos: 1, sinCanal: 0 });
    expect(context.logger.text).toContain('Recordatorio falló (email, sin respuesta)');
    expect(context.logger.text).not.toContain('SECRETA');

    fetch.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
    expect((await correr()).body).toEqual({ enviados: 1, fallidos: 0, sinCanal: 0 });
    expect(await marca(id)).toBeInstanceOf(Date);
  });

  it('si un canal anda y el otro falla, cuenta como enviado (no se duplica el que llegó)', async () => {
    const { fetch, turno, correr, marca } = await setup();
    fetch.mockImplementation((url) =>
      Promise.resolve(new Response('{}', { status: (url as string).includes('resend') ? 200 : 400 })),
    );
    const id = await turno();
    expect((await correr()).body).toEqual({ enviados: 1, fallidos: 0, sinCanal: 0 });
    expect(await marca(id)).toBeInstanceOf(Date);
  });

  it('sin canal: sin nada configurado no manda nada y no es error; un turno sin email ni teléfono cuenta en sinCanal', async () => {
    const sinNada = await setup({ email: undefined, whatsapp: undefined });
    const id = await sinNada.turno();
    const response = await sinNada.correr();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enviados: 0, fallidos: 0, sinCanal: 1 });
    expect(sinNada.fetch).not.toHaveBeenCalled();
    expect(await sinNada.marca(id)).toBeNull();
    expect(sinNada.context.logger.text).toContain('Recordatorios desactivados');

    // Solo email configurado: un turno sin email no tiene canal (el teléfono no alcanza).
    const soloEmail = await setup({ whatsapp: undefined });
    await soloEmail.turno({ email: null });
    await soloEmail.turno();
    expect((await soloEmail.correr()).body).toEqual({ enviados: 1, fallidos: 0, sinCanal: 1 });

    // Solo WhatsApp: un teléfono que no se puede interpretar no tiene canal.
    const soloWhatsapp = await setup({ email: undefined });
    await soloWhatsapp.turno({ telefono: '1234 5678 9' });
    expect((await soloWhatsapp.correr()).body).toEqual({ enviados: 0, fallidos: 0, sinCanal: 1 });
  });

  it('reprogramar un turno que ya tuvo recordatorio limpia la marca y recibe el nuevo', async () => {
    const { context, fetch, turno, correr, marca } = await setup({ whatsapp: undefined });
    const { client: admin } = await loginAs(context, 'admin');
    const id = await turno();
    await correr();
    expect(await marca(id)).toBeInstanceOf(Date);

    // Volver a mandar la misma fecha y franja (la pedida) no cambia nada: la marca queda.
    expect((await admin.patch(`/api/admin/bookings/${id}`, { fechaConfirmada: null, franjaConfirmada: null })).status).toBe(200);
    expect(await marca(id)).toBeInstanceOf(Date);

    // Cambiar la franja (mismo día) limpia la marca: el recordatorio nuevo dice "tarde".
    expect((await admin.patch(`/api/admin/bookings/${id}`, { fechaConfirmada: MANANA, franjaConfirmada: 'tarde' })).status).toBe(200);
    expect(await marca(id)).toBeNull();
    expect((await correr()).body).toEqual({ enviados: 1, fallidos: 0, sinCanal: 0 });
    expect(String(llamadas(fetch).at(-1)?.body.text)).toContain('Franja: tarde');
  });

  it('dos corridas a la vez en el mismo proceso comparten la ejecución (no se manda dos veces)', async () => {
    const { fetch, turno, correr } = await setup({ whatsapp: undefined });
    await turno();
    // Según cómo se crucen, la segunda comparte la corrida (1 y 1) o llega después (1 y 0): nunca dos envíos.
    const [a, b] = await Promise.all([correr(), correr()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(Math.max(Number(a.body.enviados), Number(b.body.enviados))).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('recordatorios: zona horaria', () => {
  it('"mañana" es el día siguiente en La Rioja aunque el servidor (UTC) ya esté en otro día', async () => {
    const { context, fetch, turno, correr } = await setup({ whatsapp: undefined });
    const delSabado = await turno({ fecha: MANANA });
    const delDomingo = await turno({ fecha: PASADO });

    // 2026-10-17 02:30 UTC = viernes 16 a las 23:30 en La Rioja: "mañana" es el sábado 17 (en UTC ya sería el 18).
    context.clock.current = new Date('2026-10-17T02:30:00.000Z');
    expect((await correr()).body).toEqual({ enviados: 1, fallidos: 0, sinCanal: 0 });
    expect(llamadas(fetch).map((c) => c.headers['Idempotency-Key'])).toEqual([`recordatorio-${delSabado}-${MANANA}`]);

    // 03:30 UTC = sábado 17 a las 00:30 en La Rioja: ahora "mañana" es el domingo 18.
    context.clock.current = new Date('2026-10-17T03:30:00.000Z');
    expect((await correr()).body).toEqual({ enviados: 1, fallidos: 0, sinCanal: 0 });
    expect(llamadas(fetch).at(-1)?.headers['Idempotency-Key']).toBe(`recordatorio-${delDomingo}-${PASADO}`);
  });
});
