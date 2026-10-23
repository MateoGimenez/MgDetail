import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Estado, Franja, NewBooking } from '../src/domain/booking.js';
import { addDays } from '../src/lib/dates.js';
import { PostgresBookingRepository } from '../src/repositories/postgres/bookings.js';
import {
  type Client,
  NOW,
  TODAY,
  type TestContext,
  closeAllContexts,
  createClient,
  createTestContext,
  loginAs,
  rawPost,
  validBooking,
} from './helpers.js';

afterEach(closeAllContexts);

/** Los campos de un Turno según los contratos (reportes/2026-10-22_08_agenda.md y 2026-10-23_10_notas-busqueda-historial.md): ni uno más, ni uno menos. */
const CAMPOS_TURNO = [
  'comentario',
  'createdAt',
  'email',
  'estado',
  'fechaConfirmada',
  'fechaPreferida',
  'franja',
  'franjaConfirmada',
  'id',
  'nombre',
  'notasInternas',
  'servicioId',
  'telefono',
  'telefonoWhatsapp',
  'turnosDelCliente',
  'updatedAt',
  'vehiculoModelo',
  'vehiculoTipo',
];

interface TurnoJson {
  id: string;
  nombre: string;
  estado: Estado;
  fechaPreferida: string;
  franja: Franja;
  fechaConfirmada: string | null;
  franjaConfirmada: Franja | null;
  updatedAt: string;
}

interface Ctx {
  context: TestContext;
  admin: Client;
  repo: PostgresBookingRepository;
  /** Crea un turno directo en la base (sin el rango de 60 días del formulario público), en orden de llegada. */
  turno: (nombre: string, fechaPreferida: string, franja?: Franja, estado?: Estado) => Promise<string>;
  agenda: (client: Client, desde: string, hasta: string) => Promise<TurnoJson[]>;
}

async function setup(now: Date = NOW): Promise<Ctx> {
  const context = await createTestContext({ now });
  const { client: admin } = await loginAs(context, 'admin');
  const repo = new PostgresBookingRepository(context.db.sql);
  const turno = async (nombre: string, fechaPreferida: string, franja: Franja = 'manana', estado?: Estado) => {
    const data: NewBooking = {
      nombre,
      telefono: '3804123456',
      email: null,
      vehiculoTipo: 'auto',
      vehiculoModelo: null,
      servicioId: 'pulido',
      fechaPreferida,
      franja,
      comentario: null,
    };
    const { id } = await repo.create(data, NOW);
    if (estado !== undefined) await repo.updateEstado(id, estado, NOW);
    return id;
  };
  const agenda = async (client: Client, desde: string, hasta: string) => {
    const response = await client.get(`/api/admin/agenda?desde=${desde}&hasta=${hasta}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return (response.body as { turnos: TurnoJson[] }).turnos;
  };
  return { context, admin, repo, turno, agenda };
}

const nombres = (turnos: TurnoJson[]): string[] => turnos.map((t) => t.nombre);

describe('GET /api/admin/agenda', () => {
  it('sin sesión => 401; con sesión la ven los tres roles', async () => {
    const { context } = await setup();
    const anonymous = createClient(context.app);
    const sinSesion = await anonymous.get('/api/admin/agenda?desde=2026-10-12&hasta=2026-10-18');
    expect(sinSesion.status).toBe(401);
    expect(sinSesion.body.error.code).toBe('UNAUTHORIZED');

    for (const rol of ['superadmin', 'empleado'] as const) {
      const { client } = await loginAs(context, rol);
      const response = await client.get('/api/admin/agenda?desde=2026-10-12&hasta=2026-10-18');
      expect(response.status, rol).toBe(200);
      expect(response.body).toEqual({ turnos: [] });
    }
  });

  it('responde { turnos } con exactamente los campos del contrato', async () => {
    const { admin, turno } = await setup();
    const id = await turno('Cliente', '2026-10-20');
    const response = await admin.get('/api/admin/agenda?desde=2026-10-19&hasta=2026-10-25');

    expect(Object.keys(response.body as object)).toEqual(['turnos']);
    const [unico] = (response.body as { turnos: Record<string, unknown>[] }).turnos;
    expect(Object.keys(unico ?? {}).sort()).toEqual(CAMPOS_TURNO);
    expect(unico).toMatchObject({
      id,
      fechaPreferida: '2026-10-20',
      franja: 'manana',
      fechaConfirmada: null,
      franjaConfirmada: null,
      estado: 'pendiente',
    });
  });

  it('ordena por fecha, mañana antes que tarde y después por orden de llegada', async () => {
    const { admin, turno, agenda } = await setup();
    await turno('Mié tarde 1', '2026-10-21', 'tarde');
    await turno('Mar mañana 1', '2026-10-20', 'manana');
    await turno('Mié mañana', '2026-10-21', 'manana');
    await turno('Mar tarde', '2026-10-20', 'tarde');
    await turno('Mar mañana 2', '2026-10-20', 'manana');
    await turno('Lun tarde', '2026-10-19', 'tarde');
    await turno('Mié tarde 2', '2026-10-21', 'tarde');

    expect(nombres(await agenda(admin, '2026-10-19', '2026-10-25'))).toEqual([
      'Lun tarde',
      'Mar mañana 1',
      'Mar mañana 2',
      'Mar tarde',
      'Mié mañana',
      'Mié tarde 1',
      'Mié tarde 2',
    ]);
  });

  it('rango inclusivo; muestra pendientes, confirmados y completados, nunca cancelados', async () => {
    const { admin, turno, agenda } = await setup();
    await turno('Antes', '2026-10-18');
    await turno('Primer día', '2026-10-19', 'manana', 'confirmado');
    await turno('Cancelado', '2026-10-20', 'manana', 'cancelado');
    await turno('Completado', '2026-10-20', 'tarde', 'completado');
    await turno('Pendiente', '2026-10-21');
    await turno('Último día', '2026-10-25', 'tarde');
    await turno('Después', '2026-10-26');

    const turnos = await agenda(admin, '2026-10-19', '2026-10-25');
    expect(nombres(turnos)).toEqual(['Primer día', 'Completado', 'Pendiente', 'Último día']);
    expect(turnos.map((t) => t.estado)).toEqual(['confirmado', 'completado', 'pendiente', 'pendiente']);

    // Un solo día (desde = hasta).
    expect(nombres(await agenda(admin, '2026-10-20', '2026-10-20'))).toEqual(['Completado']);
  });

  it('la fecha confirmada mueve el turno a otro día (y a otra franja) sin pisar la pedida', async () => {
    const { admin, turno, agenda } = await setup();
    const movido = await turno('Movido', '2026-10-20', 'manana');
    await turno('Jueves mañana', '2026-10-22', 'manana'); // llegó después, pero va antes: es de mañana
    await turno('Jueves tarde', '2026-10-22', 'tarde'); // llegó después que "Movido": va después

    const patch = await admin.patch(`/api/admin/bookings/${movido}`, {
      fechaConfirmada: '2026-10-22',
      franjaConfirmada: 'tarde',
    });
    expect(patch.status).toBe(200);

    expect(nombres(await agenda(admin, '2026-10-20', '2026-10-20'))).toEqual([]);
    const jueves = await agenda(admin, '2026-10-22', '2026-10-22');
    expect(nombres(jueves)).toEqual(['Jueves mañana', 'Movido', 'Jueves tarde']);
    expect(jueves[1]).toMatchObject({
      fechaPreferida: '2026-10-20',
      franja: 'manana',
      fechaConfirmada: '2026-10-22',
      franjaConfirmada: 'tarde',
    });

    // Volver a la pedida: vuelve al martes.
    await admin.patch(`/api/admin/bookings/${movido}`, { fechaConfirmada: null, franjaConfirmada: null });
    expect(nombres(await agenda(admin, '2026-10-20', '2026-10-20'))).toEqual(['Movido']);
  });

  it('una fecha confirmada fuera del rango consultado saca al turno aunque la pedida esté adentro', async () => {
    const { admin, turno, agenda } = await setup();
    const id = await turno('Al mes siguiente', '2026-10-30', 'manana');
    await admin.patch(`/api/admin/bookings/${id}`, { fechaConfirmada: '2026-11-02', franjaConfirmada: 'manana' });

    expect(nombres(await agenda(admin, '2026-10-26', '2026-11-01'))).toEqual([]); // semana lun 26 a dom 1
    expect(nombres(await agenda(admin, '2026-11-02', '2026-11-08'))).toEqual(['Al mes siguiente']);
  });

  it('cruza fin de mes y fin de año (semana lunes 28/12 a domingo 3/1)', async () => {
    const { admin, turno, agenda } = await setup();
    await turno('Año nuevo', '2027-01-01', 'manana');
    await turno('Fin de año', '2026-12-31', 'tarde');
    await turno('Domingo', '2027-01-03', 'manana');
    await turno('Lunes siguiente', '2027-01-04', 'manana');
    await turno('Domingo anterior', '2026-12-27', 'tarde');

    expect(nombres(await agenda(admin, '2026-12-28', '2027-01-03'))).toEqual(['Fin de año', 'Año nuevo', 'Domingo']);
    expect(nombres(await agenda(admin, '2026-11-30', '2026-12-31'))).toEqual(['Domingo anterior', 'Fin de año']);
  });

  it('acepta hasta 42 días (seis semanas) y rechaza 43', async () => {
    const { admin, turno, agenda } = await setup();
    await turno('Primero', '2026-10-12');
    await turno('Último', '2026-11-22'); // 2026-10-12 + 41 días

    expect(nombres(await agenda(admin, '2026-10-12', '2026-11-22'))).toEqual(['Primero', 'Último']);
    // El tope es por cantidad de días, también cruzando el año.
    expect(await agenda(admin, '2026-12-01', '2027-01-11')).toEqual([]);

    for (const [desde, hasta] of [
      ['2026-10-12', '2026-11-23'],
      ['2026-12-01', '2027-01-12'],
      ['2026-01-01', '2026-12-31'],
    ] as const) {
      const response = await admin.get(`/api/admin/agenda?desde=${desde}&hasta=${hasta}`);
      expect(response.status, `${desde}..${hasta}`).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(response.body.error.fields as object)).toEqual(['hasta']);
    }
  });

  const invalidas: [query: string, fields: string[]][] = [
    ['', ['desde', 'hasta']],
    ['hasta=2026-10-18', ['desde']],
    ['desde=2026-10-12', ['hasta']],
    ['desde=&hasta=', ['desde', 'hasta']],
    ['desde=2026-10-12&hasta=2026-10-11', ['hasta']],
    ['desde=2026-1-5&hasta=2026-10-18', ['desde']],
    ['desde=2026-10-12&hasta=2026-02-30', ['hasta']],
    ['desde=2026-13-01&hasta=2026-13-07', ['desde', 'hasta']],
    ['desde=2026-10-12T00:00:00Z&hasta=2026-10-18', ['desde']],
    ['desde=hoy&hasta=2026-10-18', ['desde']],
    ['desde=2026-10-12&desde=2026-10-13&hasta=2026-10-18', ['desde']], // parámetro repetido => array
    ["desde=2026-10-12'--&hasta=2026-10-18", ['desde']],
  ];

  it.each(invalidas)('query "%s" => 400 VALIDATION_ERROR con fields %j', async (query, fields) => {
    const { admin } = await setup();
    const response = await admin.get(`/api/admin/agenda?${encodeURI(query)}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(response.body.error.fields as object).sort()).toEqual(fields);
  });

  it('acepta el 29 de febrero de un año bisiesto e ignora parámetros desconocidos', async () => {
    const { admin, turno, agenda } = await setup();
    await turno('Bisiesto', '2028-02-29');
    expect(nombres(await agenda(admin, '2028-02-28', '2028-03-01'))).toEqual(['Bisiesto']);
    const extra = await admin.get('/api/admin/agenda?desde=2028-02-28&hasta=2028-03-01&estado=cancelado');
    expect(extra.status).toBe(200);
  });

  it('no escribe datos personales ni la query en el log', async () => {
    const { context, admin, turno } = await setup();
    await turno('Persona Privada', '2026-10-20');
    await admin.get('/api/admin/agenda?desde=2026-10-19&hasta=2026-10-25');

    const line = context.logger.lines.find((entry) => entry.includes('GET /api/admin/agenda'));
    expect(line).toMatch(/^INFO GET \/api\/admin\/agenda 200 \d+\.\dms$/);
    expect(context.logger.text).not.toContain('Persona Privada');
  });
});

describe('PATCH /api/admin/bookings/:id con fecha y franja confirmadas', () => {
  it('admin reprograma: guarda la confirmada, conserva la pedida y el estado, y actualiza updatedAt', async () => {
    const { context, admin, turno } = await setup();
    const id = await turno('Cliente', '2026-10-20', 'manana');
    context.clock.current = new Date(NOW.getTime() + 60_000);

    const response = await admin.patch(`/api/admin/bookings/${id}`, {
      fechaConfirmada: '2026-10-24',
      franjaConfirmada: 'tarde',
    });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object)).toEqual(['booking']);
    expect(Object.keys(response.body.booking as object).sort()).toEqual(CAMPOS_TURNO);
    expect(response.body.booking).toMatchObject({
      id,
      estado: 'pendiente',
      fechaPreferida: '2026-10-20',
      franja: 'manana',
      fechaConfirmada: '2026-10-24',
      franjaConfirmada: 'tarde',
      updatedAt: '2026-10-16T15:01:00.000Z',
    });

    // Lo mismo sale en el listado de siempre.
    const list = await admin.get('/api/admin/bookings');
    expect(list.body.bookings[0]).toMatchObject({ fechaConfirmada: '2026-10-24', franjaConfirmada: 'tarde' });

    // En el log: id, quién y la fecha; nunca el nombre del cliente.
    expect(context.logger.text).toMatch(new RegExp(`Turno reprogramado id=${id} por=\\S+ fecha=2026-10-24 tarde`));
    expect(context.logger.text).not.toContain('Cliente');
  });

  it('confirmar para otra fecha en el mismo pedido; y null en las dos vuelve a la pedida', async () => {
    const { admin, turno } = await setup();
    const id = await turno('Cliente', '2026-10-20', 'manana');

    const confirmado = await admin.patch(`/api/admin/bookings/${id}`, {
      estado: 'confirmado',
      fechaConfirmada: '2026-10-21',
      franjaConfirmada: 'manana',
    });
    expect(confirmado.status).toBe(200);
    expect(confirmado.body.booking).toMatchObject({
      estado: 'confirmado',
      fechaConfirmada: '2026-10-21',
      franjaConfirmada: 'manana',
    });

    const vuelta = await admin.patch(`/api/admin/bookings/${id}`, { fechaConfirmada: null, franjaConfirmada: null });
    expect(vuelta.status).toBe(200);
    expect(vuelta.body.booking).toMatchObject({
      estado: 'confirmado',
      fechaPreferida: '2026-10-20',
      franja: 'manana',
      fechaConfirmada: null,
      franjaConfirmada: null,
    });
  });

  it('confirmar sin fecha deja las confirmadas en null; cambiar solo el estado no toca una fecha ya confirmada', async () => {
    const { admin, turno } = await setup();
    const a = await turno('A', '2026-10-20');
    const b = await turno('B', '2026-10-20');

    const sinFecha = await admin.patch(`/api/admin/bookings/${a}`, { estado: 'confirmado' });
    expect(sinFecha.body.booking).toMatchObject({ estado: 'confirmado', fechaConfirmada: null, franjaConfirmada: null });

    await admin.patch(`/api/admin/bookings/${b}`, { fechaConfirmada: '2026-10-23', franjaConfirmada: 'tarde' });
    const completado = await admin.patch(`/api/admin/bookings/${b}`, { estado: 'completado' });
    expect(completado.body.booking).toMatchObject({
      estado: 'completado',
      fechaConfirmada: '2026-10-23',
      franjaConfirmada: 'tarde',
    });
  });

  it('superadmin también reprograma; empleado recibe 403 (con o sin estado, y también al volver a la pedida)', async () => {
    const { context, turno } = await setup();
    const id = await turno('Cliente', '2026-10-20');
    const { client: superadmin } = await loginAs(context, 'superadmin');
    const { client: empleado } = await loginAs(context, 'empleado');
    const url = `/api/admin/bookings/${id}`;

    for (const body of [
      { fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde' },
      { estado: 'completado', fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde' },
      { fechaConfirmada: null, franjaConfirmada: null },
    ]) {
      const response = await empleado.patch(url, body);
      expect(response.status, JSON.stringify(body)).toBe(403);
      expect(response.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'Con tu rol no podés cambiar la fecha de un turno.' },
      });
    }

    // El empleado sigue pudiendo lo de siempre, y lo de siempre sigue prohibido.
    expect((await empleado.patch(url, { estado: 'confirmado' })).status).toBe(403);
    const ok = await superadmin.patch(url, { fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde' });
    expect(ok.status).toBe(200);
    expect(ok.body.booking).toMatchObject({ fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde' });
    const completado = await empleado.patch(url, { estado: 'completado' });
    expect(completado.body.booking).toMatchObject({ estado: 'completado', fechaConfirmada: '2026-10-22' });
  });

  const malFormados: [body: Record<string, unknown>, field: string][] = [
    [{ fechaConfirmada: '2026-10-22' }, 'franjaConfirmada'],
    [{ franjaConfirmada: 'tarde' }, 'fechaConfirmada'],
    [{ estado: 'confirmado', fechaConfirmada: '2026-10-22' }, 'franjaConfirmada'],
    [{ fechaConfirmada: null, franjaConfirmada: 'tarde' }, 'fechaConfirmada'],
    [{ fechaConfirmada: '2026-10-22', franjaConfirmada: null }, 'franjaConfirmada'],
    [{ fechaConfirmada: null }, 'franjaConfirmada'],
    [{ fechaConfirmada: '2026-02-30', franjaConfirmada: 'tarde' }, 'fechaConfirmada'],
    [{ fechaConfirmada: '22/10/2026', franjaConfirmada: 'tarde' }, 'fechaConfirmada'],
    [{ fechaConfirmada: '2026-10-22T10:00:00Z', franjaConfirmada: 'tarde' }, 'fechaConfirmada'],
    [{ fechaConfirmada: 20261022, franjaConfirmada: 'tarde' }, 'fechaConfirmada'],
    [{ fechaConfirmada: '2026-10-22', franjaConfirmada: 'noche' }, 'franjaConfirmada'],
    [{ fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde', fechaPreferida: '2026-10-22' }, 'fechaPreferida'],
    [{ fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde', franja: 'tarde' }, 'franja'],
    [{}, 'estado'],
  ];

  it.each(malFormados)('body %j => 400 con fields.%s y sin cambios', async (body, field) => {
    const { admin, turno } = await setup();
    const id = await turno('Cliente', '2026-10-20');
    const response = await admin.patch(`/api/admin/bookings/${id}`, body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(response.body.error.fields as object)).toEqual([field]);
    const list = await admin.get('/api/admin/bookings');
    expect(list.body.bookings[0]).toMatchObject({ fechaConfirmada: null, franjaConfirmada: null, fechaPreferida: '2026-10-20' });
  });

  it('rango: de hoy a hoy + 120 días (La Rioja), ambos inclusive', async () => {
    const { admin, turno } = await setup();
    const id = await turno('Cliente', '2026-10-20');
    const url = `/api/admin/bookings/${id}`;
    expect(addDays(TODAY, 120)).toBe('2027-02-13');

    for (const fecha of [TODAY, '2027-02-13']) {
      const ok = await admin.patch(url, { fechaConfirmada: fecha, franjaConfirmada: 'manana' });
      expect(ok.status, fecha).toBe(200);
    }
    for (const fecha of ['2026-10-15', '2027-02-14', '2020-01-01', '2099-12-31']) {
      const response = await admin.patch(url, { fechaConfirmada: fecha, franjaConfirmada: 'manana' });
      expect(response.status, fecha).toBe(400);
      expect(Object.keys(response.body.error.fields as object)).toEqual(['fechaConfirmada']);
    }
    // Volver a la pedida no depende del rango (aunque la pedida ya haya pasado).
    expect((await admin.patch(url, { fechaConfirmada: null, franjaConfirmada: null })).status).toBe(200);
  });

  it('"hoy" es el de La Rioja: a las 22:30 locales del 16 (ya 17 en UTC) el 16 todavía se puede elegir', async () => {
    const tarde = await setup(new Date('2026-10-17T01:30:00.000Z'));
    const id = await tarde.turno('Cliente', '2026-10-20');
    const ok = await tarde.admin.patch(`/api/admin/bookings/${id}`, { fechaConfirmada: '2026-10-16', franjaConfirmada: 'tarde' });
    expect(ok.status).toBe(200);
    // hoy + 120 sigue contando desde el 16.
    const tope = await tarde.admin.patch(`/api/admin/bookings/${id}`, { fechaConfirmada: '2027-02-14', franjaConfirmada: 'tarde' });
    expect(tope.status).toBe(400);

    const medianoche = await setup(new Date('2026-10-17T03:00:00.000Z')); // 00:00 del 17 en La Rioja
    const otro = await medianoche.turno('Cliente', '2026-10-20');
    const pasada = await medianoche.admin.patch(`/api/admin/bookings/${otro}`, {
      fechaConfirmada: '2026-10-16',
      franjaConfirmada: 'tarde',
    });
    expect(pasada.status).toBe(400);
    expect(Object.keys(pasada.body.error.fields as object)).toEqual(['fechaConfirmada']);
    const nuevoTope = await medianoche.admin.patch(`/api/admin/bookings/${otro}`, {
      fechaConfirmada: '2027-02-14',
      franjaConfirmada: 'tarde',
    });
    expect(nuevoTope.status).toBe(200);
  });

  it('un turno viejo conserva su fecha confirmada aunque ya haya pasado', async () => {
    const { admin, repo, turno, agenda } = await setup();
    // Pedido y confirmado hace semanas (directo en la base: la API ya no deja elegir esa fecha).
    const id = await turno('Cliente', '2026-09-28');
    await repo.reprogramar(id, { confirmada: { fecha: '2026-10-01', franja: 'tarde' } }, NOW);

    const estado = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'confirmado' });
    expect(estado.body.booking).toMatchObject({ estado: 'confirmado', fechaConfirmada: '2026-10-01', franjaConfirmada: 'tarde' });
    expect(nombres(await agenda(admin, '2026-09-28', '2026-10-04'))).toEqual(['Cliente']);
    // Pero no se puede volver a elegir una fecha pasada.
    const pasada = await admin.patch(`/api/admin/bookings/${id}`, { fechaConfirmada: '2026-10-01', franjaConfirmada: 'tarde' });
    expect(pasada.status).toBe(400);
  });

  it('turno cancelado o completado => 400 (sin fields) y no cambia; tampoco se puede cerrar y reprogramar a la vez', async () => {
    const { admin, turno } = await setup();
    const cancelado = await turno('Cancelado', '2026-10-20', 'manana', 'cancelado');
    const completado = await turno('Completado', '2026-10-20', 'manana', 'completado');
    const pendiente = await turno('Pendiente', '2026-10-20', 'manana');

    const casos: [string, Record<string, unknown>][] = [
      [cancelado, { fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde' }],
      [cancelado, { fechaConfirmada: null, franjaConfirmada: null }],
      [cancelado, { estado: 'confirmado', fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde' }],
      [completado, { fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde' }],
      [pendiente, { estado: 'cancelado', fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde' }],
      [pendiente, { estado: 'completado', fechaConfirmada: null, franjaConfirmada: null }],
    ];
    for (const [id, body] of casos) {
      const response = await admin.patch(`/api/admin/bookings/${id}`, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'No se puede cambiar la fecha de un turno cancelado o completado.' },
      });
    }

    const list = (await admin.get('/api/admin/bookings')).body as { bookings: TurnoJson[] };
    expect(list.bookings.map((b) => [b.nombre, b.estado, b.fechaConfirmada])).toEqual([
      ['Pendiente', 'pendiente', null],
      ['Completado', 'completado', null],
      ['Cancelado', 'cancelado', null],
    ]);

    // Reabrir un cancelado sigue siendo posible como hasta ahora (solo el estado), y después se reprograma.
    expect((await admin.patch(`/api/admin/bookings/${cancelado}`, { estado: 'pendiente' })).status).toBe(200);
    expect(
      (await admin.patch(`/api/admin/bookings/${cancelado}`, { fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde' }))
        .status,
    ).toBe(200);
  });

  it('id inexistente o mal formado => 404 también al reprogramar', async () => {
    const { admin } = await setup();
    const body = { fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde' };
    for (const id of [randomUUID(), 'no-es-un-uuid']) {
      const response = await admin.patch(`/api/admin/bookings/${id}`, body);
      expect(response.status, id).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No encontramos ese turno.' } });
    }
  });
});

describe('agenda de punta a punta (API + Postgres, como mgdetailing_app)', () => {
  it('pedido → agenda en la fecha pedida → confirmado para otra → empleado no reprograma → cancelado sale de la agenda', async () => {
    const { context, admin, agenda } = await setup();
    const { client: empleado } = await loginAs(context, 'empleado');
    const semana = ['2026-10-19', '2026-10-25'] as const; // pidió el martes 20
    const siguiente = ['2026-10-26', '2026-11-01'] as const; // lo confirman para el jueves 29

    // 1. El cliente pide turno por el formulario público.
    const creado = await rawPost(context.app, '/api/bookings').send(validBooking({ fechaPreferida: '2026-10-20', franja: 'manana' }));
    expect(creado.status, JSON.stringify(creado.body)).toBe(201);
    const id = (creado.body as { booking: { id: string } }).booking.id;

    // 2. Aparece en su fecha pedida, pendiente y sin confirmada; lo ve también el empleado.
    expect(await agenda(admin, ...semana)).toMatchObject([
      { id, estado: 'pendiente', fechaPreferida: '2026-10-20', fechaConfirmada: null, franjaConfirmada: null },
    ]);
    expect((await agenda(empleado, ...semana)).map((t) => t.id)).toEqual([id]);
    expect(await agenda(admin, ...siguiente)).toEqual([]);

    // 3. El admin lo confirma para otro día y otra franja, en un solo pedido.
    const confirmado = await admin.patch(`/api/admin/bookings/${id}`, {
      estado: 'confirmado',
      fechaConfirmada: '2026-10-29',
      franjaConfirmada: 'tarde',
    });
    expect(confirmado.status, JSON.stringify(confirmado.body)).toBe(200);
    expect(Object.keys(confirmado.body.booking as object).sort()).toEqual(CAMPOS_TURNO);

    // 4. Está en la semana nueva y ya no en la vieja; lo pedido no se pisó.
    expect(await agenda(admin, ...semana)).toEqual([]);
    expect(await agenda(admin, ...siguiente)).toMatchObject([
      { id, estado: 'confirmado', fechaPreferida: '2026-10-20', franja: 'manana', fechaConfirmada: '2026-10-29', franjaConfirmada: 'tarde' },
    ]);

    // 5. El empleado no puede reprogramarlo (ni volverlo a lo pedido), y no cambia nada.
    for (const body of [
      { fechaConfirmada: '2026-10-30', franjaConfirmada: 'manana' },
      { fechaConfirmada: null, franjaConfirmada: null },
    ]) {
      const intento = await empleado.patch(`/api/admin/bookings/${id}`, body);
      expect(intento.status).toBe(403);
      expect((intento.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
    }
    expect(await agenda(admin, ...siguiente)).toMatchObject([{ id, fechaConfirmada: '2026-10-29' }]);

    // 6. Se cancela: sale de la agenda (de las dos semanas) y ya no se puede reprogramar.
    expect((await admin.patch(`/api/admin/bookings/${id}`, { estado: 'cancelado' })).status).toBe(200);
    expect(await agenda(admin, ...siguiente)).toEqual([]);
    expect(await agenda(admin, ...semana)).toEqual([]);
    const tarde = await admin.patch(`/api/admin/bookings/${id}`, { fechaConfirmada: '2026-10-30', franjaConfirmada: 'manana' });
    expect(tarde.status).toBe(400);
    expect(tarde.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'No se puede cambiar la fecha de un turno cancelado o completado.' },
    });

    // En el listado de siempre sigue estando, cancelado y con la fecha que se le había confirmado.
    const lista = (await admin.get('/api/admin/bookings')).body as { bookings: TurnoJson[] };
    expect(lista.bookings).toMatchObject([{ id, estado: 'cancelado', fechaConfirmada: '2026-10-29', franjaConfirmada: 'tarde' }]);
  });
});
