import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config.js';
import type { Booking } from '../src/domain/booking.js';
import {
  type DestinoPush,
  MAX_DISPOSITIVOS_POR_USUARIO,
  PushError,
  type PushRepository,
  type PushSender,
  esEndpointPermitido,
} from '../src/domain/push.js';
import { generarClavesVapid } from '../src/scripts/vapid-cli.js';
import { PushService } from '../src/services/push.js';
import {
  ORIGIN,
  type Client,
  type TestContext,
  MemoryLogger,
  addUser,
  closeAllContexts,
  createClient,
  createTestContext,
  loginAs,
  rawPost,
  validBooking,
} from './helpers.js';

afterEach(closeAllContexts);

const vapid = generarClavesVapid();
const PUSH_CONFIG: NonNullable<AppConfig['push']> = {
  publicKey: vapid.publicKey,
  privateKey: vapid.privateKey,
  subject: 'mailto:dueno@mgdetailing.test',
};

/** Un p256dh (65 bytes) y un auth (16 bytes) con el formato de PushSubscription.toJSON(). */
const P256DH = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
const AUTH = Buffer.alloc(16, 9).toString('base64url');
const ENDPOINT = (n: number | string = 1) => `https://fcm.googleapis.com/fcm/send/dispositivo-${String(n)}`;

const suscripcion = (n: number | string = 1, extra: Record<string, unknown> = {}) => ({
  endpoint: ENDPOINT(n),
  keys: { p256dh: P256DH, auth: AUTH },
  ...extra,
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 60));

type EnvioPush = Parameters<PushSender['send']>;

/** Cliente de envío falso: guarda lo que "mandaría" y responde según el endpoint. */
function fakeSender(respuesta: (destino: EnvioPush[0]) => Promise<void> = () => Promise.resolve()) {
  const send = vi.fn<PushSender['send']>((destino) => respuesta(destino));
  return { sender: { send } satisfies PushSender, send };
}

async function pushContext(options: { sender?: PushSender; sinClaves?: boolean } = {}): Promise<TestContext> {
  const { sender } = options;
  return createTestContext({
    config: { push: options.sinClaves === true ? undefined : PUSH_CONFIG },
    ...(sender && { pushSender: sender }),
  });
}

async function filas(context: TestContext): Promise<{ endpoint: string; perfil_id: string; agente: string | null }[]> {
  const { rows } = await context.db.sql.query(
    'SELECT endpoint, perfil_id::text AS perfil_id, agente FROM mgdetailing.push_suscripciones ORDER BY created_at, id',
  );
  return rows.map((row) => ({
    endpoint: String(row.endpoint),
    perfil_id: String(row.perfil_id),
    agente: typeof row.agente === 'string' ? row.agente : null,
  }));
}

async function suscribir(client: Client, n: number | string = 1) {
  return client.post('/api/admin/push/suscripciones', suscripcion(n));
}

describe('endpoint permitido (anti SSRF)', () => {
  it('acepta solo https de los servicios de push conocidos', () => {
    for (const ok of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
      'https://web.push.apple.com/QGx',
      'https://api.push.apple.com/3/device/abc',
      'https://fcm.googleapis.com:443/fcm/send/abc',
    ]) {
      expect(esEndpointPermitido(ok), ok).toBe(true);
    }
  });

  it('rechaza http, hosts ajenos, parecidos, IPs, credenciales, puertos y formatos raros', () => {
    for (const mal of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://evil.example/fcm.googleapis.com',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evilfcm.googleapis.com/x',
      'https://notify.windows.com/x',
      'https://xnotify.windows.com/x',
      'https://push.apple.com/x',
      'https://169.254.169.254/latest/meta-data',
      'https://127.0.0.1/x',
      'https://localhost/x',
      'https://[::1]/x',
      'https://usuario@fcm.googleapis.com/x',
      'https://usuario:clave@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://fcm.googleapis.com./x',
      'https://fcm.googleapis.com\\@evil.example/x',
      'https://fcm.googleapis.com/x y',
      'ftp://fcm.googleapis.com/x',
      'javascript:alert(1)',
      'fcm.googleapis.com/x',
      '',
      `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
    ]) {
      expect(esEndpointPermitido(mal), mal.slice(0, 60)).toBe(false);
    }
  });

  it('evasiones de la lista permitida: arrobas, #, ?, punycode, IPs en otras notaciones, puertos, escapes y formas raras de "https:"', () => {
    for (const mal of [
      'https://fcm.googleapis.com@evil.example/x',
      'https://fcm.googleapis.com:443@evil.example/x',
      'https://evil.example#@fcm.googleapis.com/x',
      'https://evil.example?@fcm.googleapis.com/x',
      'https://evil.example/@fcm.googleapis.com/',
      'https://evil.example/fcm.googleapis.com',
      'https://fcm.googleapis.com.evil.example',
      'https://FCM.GOOGLEAPIS.COM.EVIL.EXAMPLE/x',
      'https://xn--fcm-googleapis-0gb.com/x',
      'https://xn--fcm.googleapis.com/x',
      'https://fcm.googleapis.com%2eevil.example/x',
      'https://fcm.googleapis.com%00.evil.example/x',
      'https://fcm.googleapis.com:80/x',
      'https://fcm.googleapis.com:8443/x',
      'https://2852039166/x',
      'https://0x7f000001/x',
      'https://0177.0.0.1/x',
      'https://[::ffff:127.0.0.1]/x',
      'https://[::ffff:7f00:1]/x',
      'https://updates.push.services.mozilla.com.evil.example/x',
      'https://evil.example/https://fcm.googleapis.com',
      'https://x.notify.windows.com.evil.example/x',
      'https://windows.com/x',
      'https://evilnotify.windows.com/x',
      'https://evil.push.apple.com.evil.example/x',
      // Sin "//" o con otra capitalización: new URL() los normaliza, pero no pasarían el CHECK de la base.
      'HTTPS://fcm.googleapis.com/x',
      'Https://fcm.googleapis.com/x',
      'https:fcm.googleapis.com/x',
      'https:/fcm.googleapis.com/x',
      ' https://fcm.googleapis.com/x',
      'https://fcm.googleapis.com/x\n',
      'https://fcm.googleapis.com/\tx',
      '//fcm.googleapis.com/x',
    ]) {
      expect(esEndpointPermitido(mal), JSON.stringify(mal)).toBe(false);
    }
  });

  it('el host se compara ya normalizado: mayúsculas en el host y puerto 443 explícito son el mismo servicio', () => {
    for (const ok of [
      'https://FCM.GoogleAPIs.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com:443/wpush/v2/abc',
      'https://DB5P.NOTIFY.WINDOWS.COM/w/?token=abc',
      'https://web.push.apple.com/QGx',
    ]) {
      expect(esEndpointPermitido(ok), ok).toBe(true);
    }
  });
});

describe('GET /api/admin/push/estado', () => {
  it('con claves VAPID: disponible y la clave pública (lo que necesita PushManager.subscribe)', async () => {
    const context = await pushContext();
    const { client } = await loginAs(context, 'empleado');
    const response = await client.get('/api/admin/push/estado');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ disponible: true, clavePublica: vapid.publicKey });
    expect(JSON.stringify(response.body)).not.toContain(vapid.privateKey);
  });

  it('sin claves: no disponible y sin clave pública', async () => {
    const context = await pushContext({ sinClaves: true });
    const { client } = await loginAs(context, 'admin');
    const response = await client.get('/api/admin/push/estado');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ disponible: false, clavePublica: null });
  });

  it('sin sesión => 401 en los tres endpoints, y no toca la base', async () => {
    const context = await pushContext();
    const anonimo = createClient(context.app);
    expect((await anonimo.get('/api/admin/push/estado')).status).toBe(401);
    expect((await anonimo.post('/api/admin/push/suscripciones', suscripcion())).status).toBe(401);
    expect((await anonimo.delete('/api/admin/push/suscripciones').send({ endpoint: ENDPOINT() })).status).toBe(401);
    expect(await filas(context)).toEqual([]);
  });
});

describe('POST /api/admin/push/suscripciones', () => {
  it('guarda el dispositivo de cualquier rol (superadmin, admin y empleado) atado a su usuario', async () => {
    const context = await pushContext();
    const ids: string[] = [];
    for (const [i, rol] of (['superadmin', 'admin', 'empleado'] as const).entries()) {
      const { client, id } = await loginAs(context, rol);
      ids.push(id);
      const response = await client.post('/api/admin/push/suscripciones', suscripcion(i, { agente: `  Chrome en Android ${String(i)} ` }));
      expect(response.status, rol).toBe(201);
      expect(response.body).toEqual({ ok: true });
    }
    const guardadas = await filas(context);
    expect(guardadas.map((f) => f.perfil_id)).toEqual(ids);
    expect(guardadas.map((f) => f.agente)).toEqual(['Chrome en Android 0', 'Chrome en Android 1', 'Chrome en Android 2']);
  });

  it('acepta la forma exacta de PushSubscription.toJSON() (expirationTime: null) y no guarda el agente si no viene', async () => {
    const context = await pushContext();
    const { client } = await loginAs(context, 'empleado');
    const response = await client.post('/api/admin/push/suscripciones', suscripcion(1, { expirationTime: null }));
    expect(response.status).toBe(201);
    expect((await filas(context))[0]?.agente).toBeNull();
  });

  it('sin claves VAPID => 404 y no guarda nada', async () => {
    const context = await pushContext({ sinClaves: true });
    const { client } = await loginAs(context, 'admin');
    const response = await suscribir(client);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await filas(context)).toEqual([]);
  });

  it('rechaza lo inválido con 400 y el campo: host no permitido, http, base64 malo, campos de más', async () => {
    const context = await pushContext();
    const { client } = await loginAs(context, 'admin');
    const casos: [string, unknown, string][] = [
      ['host no permitido', suscripcion('x', { endpoint: 'https://evil.example/push/abc' }), 'endpoint'],
      ['IP interna', suscripcion('x', { endpoint: 'https://169.254.169.254/latest' }), 'endpoint'],
      ['http', suscripcion('x', { endpoint: 'http://fcm.googleapis.com/fcm/send/abc' }), 'endpoint'],
      ['endpoint largo', suscripcion('x', { endpoint: `https://fcm.googleapis.com/${'a'.repeat(2100)}` }), 'endpoint'],
      ['endpoint no es texto', suscripcion('x', { endpoint: 5 }), 'endpoint'],
      ['sin endpoint', { keys: { p256dh: P256DH, auth: AUTH } }, 'endpoint'],
      ['p256dh con caracteres que no son base64url', { endpoint: ENDPOINT(), keys: { p256dh: `${P256DH.slice(0, 80)}+/==`, auth: AUTH } }, 'keys.p256dh'],
      ['p256dh muy corto', { endpoint: ENDPOINT(), keys: { p256dh: 'abc', auth: AUTH } }, 'keys.p256dh'],
      ['auth con espacios', { endpoint: ENDPOINT(), keys: { p256dh: P256DH, auth: 'a b c d e f g h i j k l' } }, 'keys.auth'],
      ['auth demasiado largo', { endpoint: ENDPOINT(), keys: { p256dh: P256DH, auth: 'a'.repeat(33) } }, 'keys.auth'],
      ['sin keys', { endpoint: ENDPOINT() }, 'keys'],
      ['campo de más', suscripcion(1, { perfilId: 'otro' }), 'perfilId'],
      ['campo de más en keys', { endpoint: ENDPOINT(), keys: { p256dh: P256DH, auth: AUTH, extra: 'x' } }, 'keys.extra'],
      ['agente demasiado largo', suscripcion(1, { agente: 'a'.repeat(121) }), 'agente'],
      ['agente vacío', suscripcion(1, { agente: '   ' }), 'agente'],
      ['agente con saltos de línea', suscripcion(1, { agente: 'Chrome\nFalso: x' }), 'agente'],
    ];
    for (const [nombre, body, campo] of casos) {
      const response = await client.post('/api/admin/push/suscripciones', body);
      expect(response.status, nombre).toBe(400);
      expect(response.body.error.code, nombre).toBe('VALIDATION_ERROR');
      expect(response.body.error.fields, nombre).toHaveProperty([campo]);
    }
    expect((await client.post('/api/admin/push/suscripciones', [])).status).toBe(400);
    expect(await filas(context)).toEqual([]);
  });

  it('el mensaje de un endpoint inválido no repite lo que mandó el cliente', async () => {
    const context = await pushContext();
    const { client } = await loginAs(context, 'admin');
    const response = await client.post('/api/admin/push/suscripciones', suscripcion(1, { endpoint: 'https://secreto.evil.example/xyz' }));
    expect(JSON.stringify(response.body)).not.toContain('secreto.evil.example');
  });

  it('el mismo endpoint se reasigna a quien está logueado (mismo aparato, otra persona) sin duplicarse', async () => {
    const context = await pushContext();
    const a = await loginAs(context, 'admin', 'a@mgdetailing.test');
    const b = await loginAs(context, 'empleado', 'b@mgdetailing.test');

    expect((await suscribir(a.client, 1)).status).toBe(201);
    expect((await filas(context)).map((f) => f.perfil_id)).toEqual([a.id]);

    expect((await suscribir(b.client, 1)).status).toBe(201);
    expect((await filas(context)).map((f) => f.perfil_id)).toEqual([b.id]);

    // Y la misma persona repitiendo el alta (el navegador renueva la suscripción) tampoco duplica.
    expect((await suscribir(b.client, 1)).status).toBe(201);
    expect(await filas(context)).toHaveLength(1);
  });

  it(`tope de ${String(MAX_DISPOSITIVOS_POR_USUARIO)} dispositivos por usuario: el más viejo se descarta y los de otros no se tocan`, async () => {
    const context = await pushContext();
    const a = await loginAs(context, 'admin', 'a@mgdetailing.test');
    const b = await loginAs(context, 'empleado', 'b@mgdetailing.test');
    expect((await suscribir(b.client, 'de-b')).status).toBe(201);

    for (let n = 1; n <= MAX_DISPOSITIVOS_POR_USUARIO + 1; n++) {
      expect((await suscribir(a.client, n)).status, String(n)).toBe(201);
    }

    const guardadas = await filas(context);
    const deA = guardadas.filter((f) => f.perfil_id === a.id).map((f) => f.endpoint);
    expect(deA).toHaveLength(MAX_DISPOSITIVOS_POR_USUARIO);
    expect(deA).not.toContain(ENDPOINT(1)); // el primero (el más viejo) se fue
    expect(deA).toContain(ENDPOINT(MAX_DISPOSITIVOS_POR_USUARIO + 1));
    expect(guardadas.filter((f) => f.perfil_id === b.id)).toHaveLength(1);
  });

  it('exige Content-Type JSON y un Origin permitido (CSRF)', async () => {
    const context = await pushContext();
    const { client } = await loginAs(context, 'admin');
    const sinJson = await client.agent.post('/api/admin/push/suscripciones').set('Origin', ORIGIN).send('endpoint=x');
    expect(sinJson.status).toBe(415);
    const ajeno = await client.agent
      .post('/api/admin/push/suscripciones')
      .set('Origin', 'https://evil.example')
      .set('Content-Type', 'application/json')
      .send(suscripcion());
    expect(ajeno.status).toBe(403);
    expect(await filas(context)).toEqual([]);
  });

  it('no escribe el endpoint ni las claves en el log', async () => {
    const context = await pushContext();
    const { client } = await loginAs(context, 'admin');
    await suscribir(client, 'secreto-123');
    await client.post('/api/admin/push/suscripciones', suscripcion(1, { endpoint: 'https://evil.example/secreto-456' }));
    expect(context.logger.text).toMatch(/Dispositivo push registrado por=/);
    expect(context.logger.text).not.toMatch(/secreto-123|secreto-456|fcm\.googleapis|evil\.example/);
    expect(context.logger.text).not.toContain(P256DH);
    expect(context.logger.text).not.toContain(AUTH);
  });
});

describe('DELETE /api/admin/push/suscripciones', () => {
  it('borra el dispositivo y es idempotente (204 también si no existía)', async () => {
    const context = await pushContext();
    const { client } = await loginAs(context, 'empleado');
    await suscribir(client, 1);
    await suscribir(client, 2);

    const primera = await client.delete('/api/admin/push/suscripciones').send({ endpoint: ENDPOINT(1) });
    expect(primera.status).toBe(204);
    expect((await filas(context)).map((f) => f.endpoint)).toEqual([ENDPOINT(2)]);

    expect((await client.delete('/api/admin/push/suscripciones').send({ endpoint: ENDPOINT(1) })).status).toBe(204);
    expect((await client.delete('/api/admin/push/suscripciones').send({ endpoint: 'https://otra.cosa/x' })).status).toBe(204);
    expect(await filas(context)).toHaveLength(1);
  });

  it('también anda con el push apagado (cerrar sesión no puede fallar por eso)', async () => {
    const context = await pushContext({ sinClaves: true });
    const { client } = await loginAs(context, 'admin');
    expect((await client.delete('/api/admin/push/suscripciones').send({ endpoint: ENDPOINT() })).status).toBe(204);
  });

  it('valida el body: falta el endpoint o hay campos de más => 400', async () => {
    const context = await pushContext();
    const { client } = await loginAs(context, 'admin');
    const sin = await client.delete('/api/admin/push/suscripciones').send({});
    expect(sin.status).toBe(400);
    expect(sin.body.error.fields).toHaveProperty('endpoint');
    expect((await client.delete('/api/admin/push/suscripciones').send({ endpoint: ENDPOINT(), x: 1 })).status).toBe(400);
  });
});

describe('base de datos: push_suscripciones', () => {
  it('al borrar el perfil se van sus dispositivos (cascade)', async () => {
    const context = await pushContext();
    const a = await loginAs(context, 'admin', 'a@mgdetailing.test');
    const b = await loginAs(context, 'empleado', 'b@mgdetailing.test');
    await suscribir(a.client, 1);
    await suscribir(b.client, 2);

    // Como Supabase al borrar el usuario de Auth: el perfil se va en cascada y, con él, sus dispositivos.
    await context.db.authSql.query('DELETE FROM auth.users WHERE id = $1::uuid', [a.id]);
    expect((await filas(context)).map((f) => f.perfil_id)).toEqual([b.id]);
  });

  it('anon, authenticated y service_role no tienen acceso a la tabla (secretos de capacidad)', async () => {
    const context = await pushContext();
    const { client } = await loginAs(context, 'admin');
    await suscribir(client);
    for (const rol of ['anon', 'authenticated', 'service_role']) {
      await expect(
        context.db.pg.transaction(async (tx) => {
          await tx.exec(`SET LOCAL ROLE ${rol}`);
          await tx.query('SELECT endpoint FROM mgdetailing.push_suscripciones');
        }),
        rol,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('la base también rechaza endpoints http o claves mal formadas aunque la API fallara', async () => {
    const context = await pushContext();
    const { id } = await loginAs(context, 'admin');
    const insertar = (endpoint: string, p256dh: string, auth: string) =>
      context.db.appSql.query(
        'INSERT INTO mgdetailing.push_suscripciones (perfil_id, endpoint, p256dh, auth) VALUES ($1::uuid, $2, $3, $4)',
        [id, endpoint, p256dh, auth],
      );
    await expect(insertar('http://fcm.googleapis.com/x', P256DH, AUTH)).rejects.toThrow(/push_suscripciones_endpoint_https/);
    await expect(insertar(ENDPOINT(), 'no es base64url!', AUTH)).rejects.toThrow(/push_suscripciones_p256dh_formato/);
    await expect(insertar(ENDPOINT(), P256DH, 'x')).rejects.toThrow(/push_suscripciones_auth_formato/);
    await insertar(ENDPOINT(), P256DH, AUTH);
    await expect(insertar(ENDPOINT(), P256DH, AUTH)).rejects.toThrow(/push_suscripciones_endpoint_unico/);
  });

  it('mgdetailing_app solo puede actualizar ultimo_aviso_at (no reasignar un dispositivo de un UPDATE directo)', async () => {
    const context = await pushContext();
    const { client, id } = await loginAs(context, 'admin');
    await suscribir(client);
    await context.db.appSql.query('UPDATE mgdetailing.push_suscripciones SET ultimo_aviso_at = now()');
    await expect(
      context.db.appSql.query('UPDATE mgdetailing.push_suscripciones SET perfil_id = $1::uuid', [id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      context.db.appSql.query("UPDATE mgdetailing.push_suscripciones SET endpoint = 'https://fcm.googleapis.com/otro'"),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('envío al crear un turno público', () => {
  /** Alta pública y espera a que termine el envío (fire-and-forget). */
  async function crearTurno(context: TestContext, extra: Record<string, unknown> = {}) {
    const response = await rawPost(context.app, '/api/bookings').send(validBooking(extra));
    await tick();
    return response;
  }

  it('manda a los dispositivos de usuarios ACTIVOS, con el payload exacto y sin datos personales', async () => {
    const { sender, send } = fakeSender();
    const context = await pushContext({ sender });
    const admin = await loginAs(context, 'admin', 'a@mgdetailing.test');
    const empleado = await loginAs(context, 'empleado', 'b@mgdetailing.test');
    const inactivo = await loginAs(context, 'empleado', 'c@mgdetailing.test');
    await suscribir(admin.client, 'admin');
    await suscribir(empleado.client, 'empleado');
    await suscribir(inactivo.client, 'inactivo');
    await context.db.sql.query('UPDATE mgdetailing.perfiles SET activo = false WHERE id = $1::uuid', [inactivo.id]);

    // Ya hay un pendiente: con el nuevo son 2.
    await rawPost(context.app, '/api/bookings').send(validBooking({ fechaPreferida: '2026-10-21', franja: 'tarde' })).expect(201);
    await tick();
    send.mockClear();

    const response = await crearTurno(context, { servicioId: 'pulido', fechaPreferida: '2026-10-29', franja: 'manana' });
    expect(response.status).toBe(201);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([destino]) => destino.endpoint).sort()).toEqual([ENDPOINT('admin'), ENDPOINT('empleado')]);
    const [destino, payload] = send.mock.calls[0] ?? [];
    expect(destino).toMatchObject({ p256dh: P256DH, auth: AUTH });

    const dicho = JSON.parse(String(payload)) as Record<string, unknown>;
    const servicio = await context.db.sql.query("SELECT nombre FROM mgdetailing.servicios WHERE id = 'pulido'");
    expect(dicho).toEqual({
      titulo: 'Turno nuevo',
      cuerpo: `${String(servicio.rows[0]?.nombre)} · jue 29/10 · Mañana`,
      pendientes: 2,
      url: '/admin',
    });
    // Nada del cliente en el aviso, en ningún lado.
    expect(String(payload)).not.toMatch(/Juan|Pérez|380|412|example\.com|Corolla|rayones/i);
    expect(Object.keys(dicho).sort()).toEqual(['cuerpo', 'pendientes', 'titulo', 'url']);

    const marcas = await context.db.sql.query(
      'SELECT count(*)::int AS n FROM mgdetailing.push_suscripciones WHERE ultimo_aviso_at IS NOT NULL',
    );
    expect(marcas.rows[0]?.n).toBe(2);
    expect(context.logger.text).toMatch(/Aviso push: enviados=2 caducados=0 fallidos=0/);
  });

  it('el aviso llega aunque el usuario no haya cambiado nada más: pendientes cuenta solo los pendientes', async () => {
    const { sender, send } = fakeSender();
    const context = await pushContext({ sender });
    const { client } = await loginAs(context, 'admin');
    await suscribir(client);

    await crearTurno(context, { fechaPreferida: '2026-10-20' });
    await crearTurno(context, { fechaPreferida: '2026-10-21' });
    await context.db.sql.query("UPDATE mgdetailing.bookings SET estado = 'confirmado' WHERE fecha_preferida = '2026-10-20'");
    await crearTurno(context, { fechaPreferida: '2026-10-22' });

    const ultimos = send.mock.calls.map(([, payload]) => (JSON.parse(payload) as { pendientes: number }).pendientes);
    expect(ultimos).toEqual([1, 2, 2]);
  });

  it('un 404 o 410 del servicio de push borra esa suscripción; otros errores solo se cuentan', async () => {
    const { sender, send } = fakeSender((destino) => {
      if (destino.endpoint === ENDPOINT('vencido')) return Promise.reject(new PushError(410));
      if (destino.endpoint === ENDPOINT('inexistente')) return Promise.reject(new PushError(404));
      if (destino.endpoint === ENDPOINT('roto')) return Promise.reject(new PushError(500));
      if (destino.endpoint === ENDPOINT('sin-red')) return Promise.reject(new PushError(0));
      return Promise.resolve();
    });
    const context = await pushContext({ sender });
    const { client } = await loginAs(context, 'admin');
    for (const nombre of ['bueno', 'vencido', 'inexistente', 'roto', 'sin-red']) await suscribir(client, nombre);

    const response = await crearTurno(context);
    expect(response.status).toBe(201);
    expect(send).toHaveBeenCalledTimes(5);
    expect((await filas(context)).map((f) => f.endpoint).sort()).toEqual([ENDPOINT('bueno'), ENDPOINT('roto'), ENDPOINT('sin-red')]);
    expect(context.logger.text).toMatch(/Aviso push: enviados=1 caducados=2 fallidos=2/);
  });

  it('si un envío falla, se cuelga o explota de forma síncrona, el alta responde 201 rápido y los otros envíos salen', async () => {
    const { sender, send } = fakeSender((destino) => {
      if (destino.endpoint === ENDPOINT('colgado')) return new Promise<void>(() => undefined);
      if (destino.endpoint === ENDPOINT('explota')) throw new Error(`falla con ${destino.endpoint} y ${destino.auth}`);
      if (destino.endpoint === ENDPOINT('rechaza')) return Promise.reject(new Error('https://fcm.googleapis.com/secreto'));
      return Promise.resolve();
    });
    const context = await pushContext({ sender });
    const { client } = await loginAs(context, 'admin');
    for (const nombre of ['colgado', 'explota', 'rechaza', 'bueno-1', 'bueno-2']) await suscribir(client, nombre);

    const inicio = Date.now();
    const response = await rawPost(context.app, '/api/bookings').send(validBooking());
    expect(response.status).toBe(201);
    expect(Date.now() - inicio).toBeLessThan(1000);
    await tick();

    expect(send).toHaveBeenCalledTimes(5);
    expect((await filas(context)).map((f) => f.endpoint)).toHaveLength(5); // nada se borró por un error que no es 404/410
    const { rows } = await context.db.sql.query('SELECT count(*)::int AS n FROM mgdetailing.bookings');
    expect(rows[0]?.n).toBe(1);
    expect(context.logger.text).not.toMatch(/secreto|fcm\.googleapis|dispositivo-/);
    expect(context.logger.text).not.toContain(AUTH);
  });

  it('un envío que se pasa del tope se corta sin demorar a los demás ni la respuesta', async () => {
    const logger = new MemoryLogger();
    const guardados: DestinoPush[] = [
      { id: '11111111-1111-4111-8111-111111111111', endpoint: ENDPOINT('lento'), p256dh: P256DH, auth: AUTH },
      { id: '22222222-2222-4222-8222-222222222222', endpoint: ENDPOINT('rapido'), p256dh: P256DH, auth: AUTH },
    ];
    const marcados: string[] = [];
    const repo: PushRepository = {
      guardar: () => Promise.resolve(),
      borrarPorEndpoint: () => Promise.resolve(false),
      destinosActivos: () => Promise.resolve(guardados),
      borrarPorIds: () => Promise.resolve(0),
      marcarAvisados: (ids) => {
        marcados.push(...ids);
        return Promise.resolve();
      },
      contarPendientes: () => Promise.resolve(1),
    };
    const { sender } = fakeSender((destino) => (destino.endpoint === ENDPOINT('lento') ? new Promise<void>(() => undefined) : Promise.resolve()));
    const service = new PushService({ repo, config: PUSH_CONFIG, sender, logger, now: () => new Date(), timeoutMs: 40 });

    const inicio = Date.now();
    await service.avisarTurnoNuevo({ fechaPreferida: '2026-10-29', franja: 'manana' } as Booking, 'Pulido');
    expect(Date.now() - inicio).toBeLessThan(1000);
    expect(marcados).toEqual(['22222222-2222-4222-8222-222222222222']);
    expect(logger.text).toMatch(/enviados=1 caducados=0 fallidos=1/);
  });

  it('si falla la lectura de dispositivos, el alta igual responde 201 y el log no filtra el error', async () => {
    const { sender, send } = fakeSender();
    const context = await pushContext({ sender });
    await context.db.sql.query('ALTER TABLE mgdetailing.push_suscripciones RENAME TO push_rota');
    const response = await crearTurno(context);
    expect(response.status).toBe(201);
    expect(send).not.toHaveBeenCalled();
    expect(context.logger.text).toMatch(/Aviso push falló \(error al leer los dispositivos\)/);
    expect(context.logger.text).not.toMatch(/push_suscripciones|relation/);
  });

  it('sin claves VAPID no envía (aunque haya dispositivos guardados)', async () => {
    const { sender, send } = fakeSender();
    const context = await pushContext({ sender, sinClaves: true });
    const { id } = await loginAs(context, 'admin');
    await context.db.sql.query(
      'INSERT INTO mgdetailing.push_suscripciones (perfil_id, endpoint, p256dh, auth) VALUES ($1::uuid, $2, $3, $4)',
      [id, ENDPOINT(), P256DH, AUTH],
    );
    expect((await crearTurno(context)).status).toBe(201);
    expect(send).not.toHaveBeenCalled();
    expect(context.logger.text).not.toMatch(/Aviso push/);
  });

  it('sin dispositivos suscriptos no envía nada ni cuenta pendientes', async () => {
    const { sender, send } = fakeSender();
    const context = await pushContext({ sender });
    await addUser(context, { rol: 'admin' });
    expect((await crearTurno(context)).status).toBe(201);
    expect(send).not.toHaveBeenCalled();
  });

  it('el honeypot no dispara avisos (y responde igual que un alta real)', async () => {
    const { sender, send } = fakeSender();
    const context = await pushContext({ sender });
    const { client } = await loginAs(context, 'admin');
    await suscribir(client);
    const response = await crearTurno(context, { website: 'http://spam.example' });
    expect(response.status).toBe(201);
    expect(send).not.toHaveBeenCalled();
  });

  it('un turno rechazado (franja llena, validación) no dispara avisos', async () => {
    const { sender, send } = fakeSender();
    const context = await pushContext({ sender });
    const { client } = await loginAs(context, 'admin');
    await suscribir(client);
    expect((await crearTurno(context, { nombre: '' })).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('un endpoint guardado que ya no pasa la lista permitida no recibe pedidos y se borra', async () => {
    const { sender, send } = fakeSender();
    const context = await pushContext({ sender });
    const { id } = await loginAs(context, 'admin');
    // Saltando la API (el CHECK de la base solo exige https): como si la lista se hubiera achicado.
    await context.db.sql.query(
      'INSERT INTO mgdetailing.push_suscripciones (perfil_id, endpoint, p256dh, auth) VALUES ($1::uuid, $2, $3, $4)',
      [id, 'https://interno.example/push/abc', P256DH, AUTH],
    );
    await crearTurno(context);
    expect(send).not.toHaveBeenCalled();
    expect(await filas(context)).toEqual([]);
  });
});

describe('envío real (web-push) sin red', () => {
  it('el cliente de producción convierte el error del servicio de push en PushError(status) sin filtrar el endpoint', async () => {
    const { createWebPushSender } = await import('../src/notifications/push.js');
    const webpush = (await import('web-push')).default;
    const spy = vi
      .spyOn(webpush, 'sendNotification')
      .mockRejectedValue(Object.assign(new Error('https://fcm.googleapis.com/secreto'), { statusCode: 410 }));
    const sender = createWebPushSender(PUSH_CONFIG, 5000);

    const error = await sender.send({ endpoint: ENDPOINT(), p256dh: P256DH, auth: AUTH }, '{}').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PushError);
    expect((error as PushError).status).toBe(410);
    expect((error as PushError).message).not.toContain('secreto');

    expect(spy).toHaveBeenCalledWith(
      { endpoint: ENDPOINT(), keys: { p256dh: P256DH, auth: AUTH } },
      '{}',
      expect.objectContaining({
        timeout: 5000,
        vapidDetails: { subject: PUSH_CONFIG.subject, publicKey: PUSH_CONFIG.publicKey, privateKey: PUSH_CONFIG.privateKey },
      }),
    );

    spy.mockRejectedValue(new Error('sin respuesta'));
    expect(((await sender.send({ endpoint: ENDPOINT(), p256dh: P256DH, auth: AUTH }, '{}').catch((e: unknown) => e)) as PushError).status).toBe(0);
  });
});


describe('lo que arma el panel contra el backend', () => {
  it('el cuerpo real de PushSubscription.toJSON() (con claves de tamaño real) pasa, con y sin agente, y los nombres cortos del panel también', async () => {
    const context = await pushContext();
    const { client } = await loginAs(context, 'empleado');
    // Tamaños reales: p256dh = 65 bytes (87 caracteres) y auth = 16 bytes (22 caracteres), sin relleno.
    const toJSON = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/' + 'dQw4w9WgXcQ:APA91b'.padEnd(140, 'x'),
      expirationTime: null,
      keys: { p256dh: P256DH, auth: AUTH },
    };
    expect(P256DH).toHaveLength(87);
    expect(AUTH).toHaveLength(22);
    expect((await client.post('/api/admin/push/suscripciones', toJSON)).status).toBe(201);
    for (const [n, agente] of ['Chrome · Android', 'Safari · iPhone', 'Edge · Windows', 'Navegador'].entries()) {
      const response = await client.post('/api/admin/push/suscripciones', { ...toJSON, endpoint: ENDPOINT(n), agente });
      expect(response.status, agente).toBe(201);
    }
    expect((await filas(context)).map((f) => f.agente)).toEqual([null, 'Chrome · Android', 'Safari · iPhone', 'Edge · Windows', 'Navegador']);
  });

  it('las formas raras de "https:" dan 400 con el campo (no un 500 de la base)', async () => {
    const context = await pushContext();
    const { client } = await loginAs(context, 'admin');
    for (const endpoint of ['HTTPS://fcm.googleapis.com/x', 'https:fcm.googleapis.com/x', 'https:/fcm.googleapis.com/x']) {
      const response = await client.post('/api/admin/push/suscripciones', suscripcion(1, { endpoint }));
      expect(response.status, endpoint).toBe(400);
      expect(response.body.error.fields, endpoint).toHaveProperty('endpoint');
    }
    expect(await filas(context)).toEqual([]);
  });

  it('el DELETE con el body del panel ({ endpoint } y nada más) alcanza, aunque el endpoint ya no pase la lista', async () => {
    const context = await pushContext();
    const { client, id } = await loginAs(context, 'admin');
    await context.db.sql.query(
      'INSERT INTO mgdetailing.push_suscripciones (perfil_id, endpoint, p256dh, auth) VALUES ($1::uuid, $2, $3, $4)',
      [id, 'https://viejo.example/push/abc', P256DH, AUTH],
    );
    expect((await client.delete('/api/admin/push/suscripciones').send({ endpoint: 'https://viejo.example/push/abc' })).status).toBe(204);
    expect(await filas(context)).toEqual([]);
  });
});

describe('flujo completo de los avisos (API + base de datos)', () => {
  it('suscribirse (empleado y admin) → turno público → un envío por dispositivo con el payload exacto → 410 borra → desactivado no recibe → DELETE y cerrar sesión: ya no recibe', async () => {
    const { sender, send } = fakeSender((destino) =>
      destino.endpoint === ENDPOINT('vencido') ? Promise.reject(new PushError(410)) : Promise.resolve(),
    );
    const context = await pushContext({ sender });
    const admin = await loginAs(context, 'admin', 'admin@mgdetailing.test');
    const empleado = await loginAs(context, 'empleado', 'empleado@mgdetailing.test');
    const baja = await loginAs(context, 'empleado', 'baja@mgdetailing.test');
    const alta = async () => {
      send.mockClear();
      expect((await rawPost(context.app, '/api/bookings').send(validBooking({ fechaPreferida: '2026-10-29', franja: 'tarde' }))).status).toBe(201);
      await tick();
      return send.mock.calls.map(([destino]) => destino.endpoint).sort();
    };

    // 1. Se suscriben tres: el admin, el empleado y un empleado con un dispositivo ya vencido.
    expect((await suscribir(admin.client, 'admin')).status).toBe(201);
    expect((await suscribir(empleado.client, 'empleado')).status).toBe(201);
    expect((await suscribir(baja.client, 'vencido')).status).toBe(201);
    expect((await suscribir(baja.client, 'baja')).status).toBe(201);

    // 2. Un turno público: un envío por suscripción, con el payload exacto (y nada del cliente).
    const enviados = await alta();
    expect(enviados).toEqual([ENDPOINT('admin'), ENDPOINT('baja'), ENDPOINT('empleado'), ENDPOINT('vencido')]);
    const servicio = await context.db.sql.query("SELECT nombre FROM mgdetailing.servicios WHERE id = 'pulido'");
    for (const [destino, payload] of send.mock.calls) {
      expect(destino).toMatchObject({ p256dh: P256DH, auth: AUTH });
      expect(JSON.parse(payload)).toEqual({
        titulo: 'Turno nuevo',
        cuerpo: `${String(servicio.rows[0]?.nombre)} · jue 29/10 · Tarde`,
        pendientes: 1,
        url: '/admin',
      });
    }

    // 3. El 410 borró la suscripción vencida; las demás siguen.
    expect((await filas(context)).map((f) => f.endpoint).sort()).toEqual([ENDPOINT('admin'), ENDPOINT('baja'), ENDPOINT('empleado')]);

    // 4. Se desactiva a un usuario: deja de recibir (pero su fila queda, por si lo reactivan).
    await context.db.sql.query('UPDATE mgdetailing.perfiles SET activo = false WHERE id = $1::uuid', [baja.id]);
    expect(await alta()).toEqual([ENDPOINT('admin'), ENDPOINT('empleado')]);

    // 5. El empleado cierra sesión como lo hace el panel: DELETE de su dispositivo y después el logout.
    expect((await empleado.client.delete('/api/admin/push/suscripciones').send({ endpoint: ENDPOINT('empleado') })).status).toBe(204);
    expect((await empleado.client.post('/api/auth/logout')).status).toBe(204);
    expect(await alta()).toEqual([ENDPOINT('admin')]);

    // 6. El admin se da de baja del dispositivo: nadie recibe y no hay envíos.
    expect((await admin.client.delete('/api/admin/push/suscripciones').send({ endpoint: ENDPOINT('admin') })).status).toBe(204);
    expect(await alta()).toEqual([]);

    // Ni el log ni las respuestas tuvieron endpoints ni claves.
    expect(context.logger.text).not.toContain('fcm.googleapis.com');
    expect(context.logger.text).not.toContain(P256DH);
    expect(context.logger.text).not.toContain(vapid.privateKey);
  });
});
