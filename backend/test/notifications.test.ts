import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Booking } from '../src/domain/booking.js';
import { type BookingNotifier, NotifyError } from '../src/domain/notifier.js';
import { createNotifier } from '../src/notifications/index.js';
import { formatBookingMessage } from '../src/notifications/message.js';
import { closeAllContexts, countRows, createTestContext, rawPost, validBooking } from './helpers.js';

afterEach(closeAllContexts);

const BOOKING: Booking = {
  id: 'b1',
  nombre: 'Juan Pérez',
  telefono: '0380 15-4123456',
  email: null,
  vehiculoTipo: 'auto',
  vehiculoModelo: 'VW Gol',
  servicioId: 'lavado-premium',
  fechaPreferida: '2026-10-20',
  franja: 'manana',
  fechaConfirmada: null,
  franjaConfirmada: null,
  comentario: 'x'.repeat(300),
  telefonoWhatsapp: '5493804123456',
  estado: 'pendiente',
  notasInternas: null,
  turnosDelCliente: 1,
  createdAt: '2026-10-16T15:00:00.000Z',
  updatedAt: '2026-10-16T15:00:00.000Z',
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('aviso de turno nuevo', () => {
  it('notifica tras guardar el turno y el honeypot no notifica', async () => {
    const notifyNewBooking = vi.fn<BookingNotifier['notifyNewBooking']>().mockResolvedValue();
    const { app, logger } = await createTestContext({ notifier: { notifyNewBooking } });

    await rawPost(app, '/api/bookings').send(validBooking({ website: 'http://spam.example' })).expect(201);
    await tick();
    expect(notifyNewBooking).not.toHaveBeenCalled();

    await rawPost(app, '/api/bookings').send(validBooking()).expect(201);
    await tick();
    expect(notifyNewBooking).toHaveBeenCalledTimes(1);
    expect(notifyNewBooking.mock.calls[0]?.[0]).toMatchObject({ nombre: 'Juan Pérez', estado: 'pendiente' });
    expect(logger.text).toMatch(/Aviso de turno enviado id=/);
  });

  it('si el notifier falla o se cuelga, el POST igual responde 201 rápido y el log no filtra datos', async () => {
    for (const notifier of [
      { notifyNewBooking: () => Promise.reject(new NotifyError(500)) },
      { notifyNewBooking: () => Promise.reject(new Error('https://api.callmebot.com/?apikey=SECRETA')) },
      { notifyNewBooking: () => new Promise<void>(() => undefined) },
      {
        notifyNewBooking: (): Promise<void> => {
          throw new Error('síncrono');
        },
      },
    ]) {
      const { app, db, logger } = await createTestContext({ notifier });
      const started = Date.now();
      await rawPost(app, '/api/bookings').send(validBooking()).expect(201);
      expect(Date.now() - started).toBeLessThan(1000);
      await tick();
      expect(await countRows(db, 'bookings')).toBe(1);
      expect(logger.text).not.toMatch(/SECRETA|Juan|Corolla/);
    }
  });
});

describe('mensaje', () => {
  it('arma el aviso con servicio, fecha argentina, link de WhatsApp, comentario recortado y panel', () => {
    const message = formatBookingMessage(BOOKING, 'Lavado Premium', 'https://mgdetailing.com.ar');
    expect(message.split('\n').slice(0, 5)).toEqual([
      '🚗 Nuevo turno MgDetailing',
      'Lavado Premium · mar 20/10 · Mañana',
      'Juan Pérez · Auto VW Gol',
      'Tel: 0380 15-4123456',
      'Escribile: https://wa.me/5493804123456',
    ]);
    expect(message).toMatch(/\nComentario: x{199}…\n/);
    expect(message.endsWith('\nPanel: https://mgdetailing.com.ar/admin')).toBe(true);

    const bare = formatBookingMessage({ ...BOOKING, telefonoWhatsapp: null, comentario: null }, 'Lavado Premium');
    expect(bare).not.toMatch(/wa\.me|Comentario|Panel/);
  });

  it('la nota interna y el historial nunca salen en el aviso (mensaje ni ningún proveedor)', async () => {
    const conNota: Booking = { ...BOOKING, notasInternas: 'NOTA-SECRETA rayón\ncobrado', turnosDelCliente: 7 };
    const message = formatBookingMessage(conNota, 'Lavado Premium', 'https://mgdetailing.com.ar');
    expect(message).not.toContain('NOTA-SECRETA');
    expect(message).not.toMatch(/cobrado|rayón|\b7 turnos\b/);

    for (const settings of [
      { provider: 'callmebot', ownerPhone: '5493804781737', apikey: 'k' },
      { provider: 'telegram', botToken: '1:TOKEN', chatId: '42' },
      { provider: 'cloud', ownerPhone: '5493804781737', token: 'T', phoneNumberId: '555', template: 'nt', language: 'es_AR' },
    ] as const) {
      const fetchFake = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
      await createNotifier(settings, undefined, fetchFake)?.notifyNewBooking(conNota, 'Lavado Premium');
      const [target, init] = fetchFake.mock.calls[0] ?? [];
      const enviado = decodeURIComponent(typeof target === 'string' ? target : '') + (typeof init?.body === 'string' ? init.body : '');
      expect(enviado, settings.provider).not.toContain('NOTA-SECRETA');
      expect(enviado, settings.provider).not.toContain('cobrado');
    }
  });
});

describe('proveedores', () => {
  it('CallMeBot arma la URL codificada con phone, text y apikey (fetch falso)', async () => {
    const fetchFake = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok', { status: 200 }));
    const notifier = createNotifier(
      { provider: 'callmebot', ownerPhone: '5493804781737', apikey: '123 456' },
      undefined,
      fetchFake,
    );
    await notifier?.notifyNewBooking({ ...BOOKING, comentario: 'a&b=c' }, 'Lavado Premium');

    const target = fetchFake.mock.calls[0]?.[0];
    expect(typeof target).toBe('string');
    const url = new URL(target as string);
    expect(url.origin + url.pathname).toBe('https://api.callmebot.com/whatsapp.php');
    expect(url.searchParams.get('phone')).toBe('5493804781737');
    expect(url.searchParams.get('apikey')).toBe('123 456');
    expect(url.searchParams.get('text')).toContain('Comentario: a&b=c');
    expect(url.search).toContain('%0A'); // saltos de línea codificados
    expect(url.search).not.toContain('a&b=c');
    expect(fetchFake.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('un status de error del proveedor se convierte en NotifyError', async () => {
    const fetchFake = vi.fn<typeof fetch>().mockResolvedValue(new Response('no', { status: 503 }));
    const notifier = createNotifier({ provider: 'callmebot', ownerPhone: '549380', apikey: 'k' }, undefined, fetchFake);
    await expect(notifier?.notifyNewBooking(BOOKING, 'Lavado Premium')).rejects.toMatchObject({ status: 503 });
  });
});

describe('Telegram y Cloud API (fetch falso)', () => {
  it('Telegram hace POST JSON a sendMessage con chat_id y el texto', async () => {
    const fetchFake = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const notifier = createNotifier({ provider: 'telegram', botToken: '1:TOKEN', chatId: '42' }, undefined, fetchFake);
    await notifier?.notifyNewBooking(BOOKING, 'Lavado Premium');

    const [target, init] = fetchFake.mock.calls[0] ?? [];
    expect(target).toBe('https://api.telegram.org/bot1:TOKEN/sendMessage');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init?.body as string) as { chat_id: string; text: string };
    expect(body.chat_id).toBe('42');
    expect(body.text).toContain('Nuevo turno MgDetailing');
  });

  it('Cloud API manda la plantilla con un parámetro de texto en una sola línea y token Bearer', async () => {
    const fetchFake = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const notifier = createNotifier(
      { provider: 'cloud', ownerPhone: '5493804781737', token: 'T', phoneNumberId: '555', template: 'nuevo_turno', language: 'es_AR' },
      undefined,
      fetchFake,
    );
    await notifier?.notifyNewBooking(BOOKING, 'Lavado Premium');

    const [target, init] = fetchFake.mock.calls[0] ?? [];
    expect(target).toBe('https://graph.facebook.com/v23.0/555/messages');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer T');
    const body = JSON.parse(init?.body as string) as {
      to: string;
      template: { name: string; language: { code: string }; components: { parameters: { text: string }[] }[] };
    };
    expect(body.to).toBe('5493804781737');
    expect(body.template).toMatchObject({ name: 'nuevo_turno', language: { code: 'es_AR' } });
    expect(body.template.components[0]?.parameters[0]?.text).not.toContain('\n');
  });
});
