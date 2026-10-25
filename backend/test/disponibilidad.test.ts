import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMITS } from '../src/config.js';
import { calcularCupos, diaDeLaSemana, disponibilidadPublica } from '../src/domain/disponibilidad.js';
import { addDays } from '../src/lib/dates.js';
import { PostgresBookingRepository } from '../src/repositories/postgres/bookings.js';
import {
  type Client,
  NOW,
  TODAY,
  TODAY_PLUS_60,
  TODAY_PLUS_61,
  type TestContext,
  closeAllContexts,
  countRows,
  createClient,
  createTestContext,
  loginAs,
  rawPost,
  validBooking,
} from './helpers.js';

afterEach(closeAllContexts);

/*
 * Contrato: reportes/2026-10-23_11_disponibilidad-seguimiento-recordatorios.md. "Hoy" es el viernes 2026-10-16 (La
 * Rioja). 2026-10-18 es domingo; 2026-10-20, martes; 2026-11-23 (lunes), feriado sembrado.
 */
const DOMINGO = '2026-10-18';
const MARTES = '2026-10-20';
const MIERCOLES = '2026-10-21';
const FERIADO = '2026-11-23';

const DIA_CERRADO = {
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Ese día no tomamos turnos. Elegí otro.',
    fields: { fechaPreferida: 'Ese día no tomamos turnos. Elegí otro.' },
  },
};
const FRANJA_LLENA = {
  error: {
    code: 'FRANJA_LLENA',
    message: 'Esa franja se llenó. Elegí otra.',
    fields: { franja: 'Esa franja se llenó. Elegí otra.' },
  },
};

interface DiaPublico {
  fecha: string;
  abierto: boolean;
  manana: boolean;
  tarde: boolean;
}

interface Ctx {
  context: TestContext;
  admin: Client;
  publico: (query?: string) => Promise<DiaPublico[]>;
  dia: (fecha: string) => Promise<DiaPublico | undefined>;
  pedir: (fecha: string, franja?: 'manana' | 'tarde') => Promise<request.Response>;
}

/** La base tal como la deja la migración (disponibilidad 'fabrica'), con un admin logueado. */
async function setup(options: { config?: Parameters<typeof createTestContext>[0] } = {}): Promise<Ctx> {
  const context = await createTestContext({ disponibilidad: 'fabrica', ...options.config });
  const { client: admin } = await loginAs(context, 'admin');
  const publico = async (query = '') => {
    const response = await request(context.app).get(`/api/disponibilidad${query}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return (response.body as { dias: DiaPublico[] }).dias;
  };
  const dia = async (fecha: string) => (await publico(`?desde=${fecha}&hasta=${fecha}`))[0];
  const pedir = (fecha: string, franja: 'manana' | 'tarde' = 'manana') =>
    rawPost(context.app, '/api/bookings').send(validBooking({ fechaPreferida: fecha, franja }));
  return { context, admin, publico, dia, pedir };
}

describe('dominio: calcularCupos', () => {
  it('día de la semana con la convención 0 = domingo; el especial gana; cerrado = cupos en 0', () => {
    expect(diaDeLaSemana(DOMINGO)).toBe(0);
    expect(diaDeLaSemana(MARTES)).toBe(2);
    const horario = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, abierto: dia !== 0, cupoManana: 2, cupoTarde: 3 }));
    const cupos = calcularCupos(
      DOMINGO,
      MARTES,
      horario,
      [{ fecha: '2026-10-19', abierto: false, cupoManana: null, cupoTarde: null, motivo: 'Feriado: x' }],
      [{ fecha: MARTES, franja: 'tarde', ocupados: 3 }],
    );
    expect(cupos).toEqual([
      { fecha: DOMINGO, abierto: false, cupoManana: 0, cupoTarde: 0, ocupadosManana: 0, ocupadosTarde: 0 },
      { fecha: '2026-10-19', abierto: false, cupoManana: 0, cupoTarde: 0, ocupadosManana: 0, ocupadosTarde: 0 },
      { fecha: MARTES, abierto: true, cupoManana: 2, cupoTarde: 3, ocupadosManana: 0, ocupadosTarde: 3 },
    ]);
    expect(cupos.map(disponibilidadPublica)[2]).toEqual({ fecha: MARTES, abierto: true, manana: true, tarde: false });
  });
});

describe('GET /api/disponibilidad (público)', () => {
  it('sin parámetros: de hoy a hoy + 60, con exactamente los campos del contrato y sin cantidades', async () => {
    const { publico } = await setup();
    const dias = await publico();
    expect(dias).toHaveLength(61);
    expect(dias[0]?.fecha).toBe(TODAY);
    expect(dias.at(-1)?.fecha).toBe(TODAY_PLUS_60);
    for (const dia of dias) expect(Object.keys(dia).sort()).toEqual(['abierto', 'fecha', 'manana', 'tarde']);

    const porFecha = new Map(dias.map((dia) => [dia.fecha, dia]));
    // Domingo cerrado por defecto; martes abierto con lugar; feriado sembrado cerrado.
    expect(porFecha.get(DOMINGO)).toEqual({ fecha: DOMINGO, abierto: false, manana: false, tarde: false });
    expect(porFecha.get(MARTES)).toEqual({ fecha: MARTES, abierto: true, manana: true, tarde: true });
    expect(porFecha.get(FERIADO)).toEqual({ fecha: FERIADO, abierto: false, manana: false, tarde: false });
    expect(porFecha.get('2026-12-08')?.abierto).toBe(false);
  });

  it('rango y formato: dentro de hoy..hoy+60, hasta >= desde; si no, 400 en el campo', async () => {
    const { context, publico } = await setup();
    expect((await publico(`?desde=${MARTES}&hasta=2026-10-22`)).map((d) => d.fecha)).toEqual([
      MARTES,
      MIERCOLES,
      '2026-10-22',
    ]);
    // Solo uno: el otro toma su valor por defecto. Vacío = no enviado. Los desconocidos se ignoran.
    expect(await publico(`?desde=${TODAY_PLUS_60}`)).toHaveLength(1);
    expect(await publico(`?hasta=${TODAY}&otro=1`)).toHaveLength(1);
    expect(await publico('?desde=&hasta=')).toHaveLength(61);

    const casos: [string, string][] = [
      [`?desde=${addDays(TODAY, -1)}`, 'desde'],
      [`?hasta=${TODAY_PLUS_61}`, 'hasta'],
      ['?desde=2026-13-01', 'desde'],
      ['?desde=20-10-2026', 'desde'],
      ['?hasta=2026-02-30', 'hasta'],
      [`?desde=${MIERCOLES}&hasta=${MARTES}`, 'hasta'],
      [`?desde=${MARTES}&desde=${MIERCOLES}`, 'desde'], // repetido
    ];
    for (const [query, campo] of casos) {
      const response = await request(context.app).get(`/api/disponibilidad${query}`);
      expect(response.status, query).toBe(400);
      expect(response.body.error.code, query).toBe('VALIDATION_ERROR');
      expect(Object.keys(response.body.error.fields as object), query).toEqual([campo]);
    }
  });
});

describe('POST /api/bookings con disponibilidad', () => {
  it('domingo (cerrado por defecto) y feriado sembrado => 400 en fechaPreferida, sin guardar nada', async () => {
    const { context, pedir } = await setup();
    for (const fecha of [DOMINGO, FERIADO]) {
      const response = await pedir(fecha);
      expect(response.status, fecha).toBe(400);
      expect(response.body).toEqual(DIA_CERRADO);
    }
    expect(await countRows(context.db, 'bookings')).toBe(0);
  });

  it('la franja se llena a los 2 turnos (409 FRANJA_LLENA) y la otra franja sigue con lugar', async () => {
    const { context, pedir, dia } = await setup();
    expect((await pedir(MARTES)).status).toBe(201);
    expect(await dia(MARTES)).toEqual({ fecha: MARTES, abierto: true, manana: true, tarde: true });
    expect((await pedir(MARTES)).status).toBe(201);
    expect(await dia(MARTES)).toEqual({ fecha: MARTES, abierto: true, manana: false, tarde: true });

    const lleno = await pedir(MARTES);
    expect(lleno.status).toBe(409);
    expect(lleno.body).toEqual(FRANJA_LLENA);
    expect((await pedir(MARTES, 'tarde')).status).toBe(201);
    expect(await countRows(context.db, 'bookings')).toBe(3);
  });

  it('cupo 0 en el horario semanal cierra esa franja (409) aunque el día esté abierto', async () => {
    const { admin, pedir, dia } = await setup();
    const actual = (await admin.get('/api/admin/disponibilidad')).body.horarioSemanal as Record<string, unknown>[];
    const dias = actual.map((d) => (d.dia === 2 ? { ...d, cupoTarde: 0 } : d));
    const put = await admin.put('/api/admin/disponibilidad/horario-semanal', { dias });
    expect(put.status, JSON.stringify(put.body)).toBe(200);

    expect(await dia(MARTES)).toEqual({ fecha: MARTES, abierto: true, manana: true, tarde: false });
    const response = await pedir(MARTES, 'tarde');
    expect(response.status).toBe(409);
    expect(response.body).toEqual(FRANJA_LLENA);
    expect((await pedir(MARTES, 'manana')).status).toBe(201);
  });

  it('un día especial abierto pisa al domingo cerrado, con sus propios cupos', async () => {
    const { admin, pedir, dia } = await setup();
    const put = await admin.put(`/api/admin/disponibilidad/dias-especiales/${DOMINGO}`, {
      abierto: true,
      cupoManana: 1,
      cupoTarde: 0,
      motivo: '  Domingo de apertura  ',
    });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body).toEqual({
      dia: { fecha: DOMINGO, abierto: true, cupoManana: 1, cupoTarde: 0, motivo: 'Domingo de apertura' },
    });

    expect(await dia(DOMINGO)).toEqual({ fecha: DOMINGO, abierto: true, manana: true, tarde: false });
    expect((await pedir(DOMINGO, 'tarde')).body).toEqual(FRANJA_LLENA);
    expect((await pedir(DOMINGO, 'manana')).status).toBe(201);
    expect((await pedir(DOMINGO, 'manana')).status).toBe(409);
    expect(await dia(DOMINGO)).toEqual({ fecha: DOMINGO, abierto: true, manana: false, tarde: false });
  });

  it('un feriado que se abre o se quita vuelve a tomar turnos; un día especial cerrado cierra un martes', async () => {
    const { admin, pedir, dia } = await setup();
    expect((await admin.delete(`/api/admin/disponibilidad/dias-especiales/${FERIADO}`)).status).toBe(204);
    expect(await dia(FERIADO)).toEqual({ fecha: FERIADO, abierto: true, manana: true, tarde: true }); // lunes
    expect((await pedir(FERIADO)).status).toBe(201);

    const cerrar = await admin.put(`/api/admin/disponibilidad/dias-especiales/${MARTES}`, {
      abierto: false,
      cupoManana: 3, // con el día cerrado, los cupos se ignoran
      motivo: 'Vacaciones',
    });
    expect(cerrar.body).toEqual({
      dia: { fecha: MARTES, abierto: false, cupoManana: null, cupoTarde: null, motivo: 'Vacaciones' },
    });
    expect((await pedir(MARTES)).body).toEqual(DIA_CERRADO);
  });

  it('el último lugar con dos altas simultáneas: entra una sola (bloqueo por fecha en la transacción)', async () => {
    const { context, pedir } = await setup();
    expect((await pedir(MARTES)).status).toBe(201);
    const [a, b] = await Promise.all([pedir(MARTES), pedir(MARTES)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await countRows(context.db, 'bookings')).toBe(2);
  });

  it('el alta toma el advisory lock de la fecha antes de contar los cupos', async () => {
    // PGlite tiene una sola conexión (serializa las transacciones), así que la carrera real solo se ve en Postgres:
    // acá se verifica que la primera sentencia de la transacción del alta sea el lock de la fecha.
    const context = await createTestContext({ disponibilidad: 'fabrica' });
    const textos: string[] = [];
    const repo = new PostgresBookingRepository({
      query: (text, params) => {
        textos.push(text);
        return context.db.appSql.query(text, params);
      },
      transaction: (fn) =>
        context.db.appSql.transaction((tx) =>
          fn({
            query: (text, params) => {
              textos.push(text);
              return tx.query(text, params);
            },
            transaction: (inner) => inner(tx),
          }),
        ),
    });
    const datos = {
      nombre: 'Ana',
      telefono: '3804123456',
      email: null,
      vehiculoTipo: 'auto' as const,
      vehiculoModelo: null,
      servicioId: 'pulido',
      fechaPreferida: MARTES,
      franja: 'manana' as const,
      comentario: null,
    };
    await repo.reservar(datos, NOW);
    expect(textos[0]).toMatch(/pg_advisory_xact_lock\(7340003/);
    expect(textos.at(-1)).toMatch(/INSERT INTO mgdetailing\.bookings/);
    await repo.reservar(datos, NOW);
    await expect(repo.reservar(datos, NOW)).rejects.toThrow(/no tiene lugar/);
  });

  it('un turno cancelado no ocupa cupo; uno reprogramado libera su franja y ocupa la nueva', async () => {
    const { admin, pedir, dia, context } = await setup();
    const primero = (await pedir(MARTES)).body.booking.id as string;
    const segundo = (await pedir(MARTES)).body.booking.id as string;
    expect((await pedir(MARTES)).status).toBe(409);

    // Cancelar libera.
    expect((await admin.patch(`/api/admin/bookings/${primero}`, { estado: 'cancelado' })).status).toBe(200);
    expect(await dia(MARTES)).toMatchObject({ manana: true });
    const tercero = (await pedir(MARTES)).body.booking.id as string;
    expect(await dia(MARTES)).toMatchObject({ manana: false });

    // Reprogramar el segundo al miércoles a la tarde: libera el martes a la mañana y ocupa el miércoles.
    const reprogramado = await admin.patch(`/api/admin/bookings/${segundo}`, {
      fechaConfirmada: MIERCOLES,
      franjaConfirmada: 'tarde',
    });
    expect(reprogramado.status).toBe(200);
    expect(await dia(MARTES)).toMatchObject({ manana: true });
    expect((await pedir(MIERCOLES, 'tarde')).status).toBe(201);
    expect(await dia(MIERCOLES)).toMatchObject({ manana: true, tarde: false });

    // El panel manda: puede reprogramar a una franja llena o a un día cerrado (no se bloquea por cupo).
    expect((await admin.patch(`/api/admin/bookings/${tercero}`, { fechaConfirmada: MIERCOLES, franjaConfirmada: 'tarde' })).status).toBe(200);
    expect((await admin.patch(`/api/admin/bookings/${tercero}`, { fechaConfirmada: DOMINGO, franjaConfirmada: 'manana', estado: 'confirmado' })).status).toBe(200);

    const agenda = await admin.get(`/api/admin/agenda?desde=${DOMINGO}&hasta=${MIERCOLES}`);
    expect(agenda.body.cupos).toEqual([
      { fecha: DOMINGO, abierto: false, cupoManana: 0, cupoTarde: 0, ocupadosManana: 1, ocupadosTarde: 0 },
      { fecha: '2026-10-19', abierto: true, cupoManana: 2, cupoTarde: 2, ocupadosManana: 0, ocupadosTarde: 0 },
      { fecha: MARTES, abierto: true, cupoManana: 2, cupoTarde: 2, ocupadosManana: 0, ocupadosTarde: 0 },
      { fecha: MIERCOLES, abierto: true, cupoManana: 2, cupoTarde: 2, ocupadosManana: 0, ocupadosTarde: 2 },
    ]);
    expect(await countRows(context.db, 'bookings')).toBe(4);
  });

  it('el honeypot responde igual que un pedido real ante un día cerrado o una franja llena, sin guardar', async () => {
    const { context, pedir } = await setup();
    const bot = (fecha: string) =>
      rawPost(context.app, '/api/bookings').send(validBooking({ fechaPreferida: fecha, website: 'http://spam.example' }));
    expect((await bot(DOMINGO)).body).toEqual(DIA_CERRADO);
    await pedir(MARTES);
    await pedir(MARTES);
    expect((await bot(MARTES)).body).toEqual(FRANJA_LLENA);
    const ok = await bot(MIERCOLES);
    expect(ok.status).toBe(201);
    expect(ok.body.booking.seguimientoUrl).toBe(`/turno/${String(ok.body.booking.id)}`);
    expect(await countRows(context.db, 'bookings')).toBe(2);
  });
});

describe('panel: /api/admin/disponibilidad', () => {
  it('GET: horario de lunes a domingo y días especiales de hoy en adelante (feriados sembrados), todos los roles', async () => {
    const { context } = await setup();
    const { client: empleado } = await loginAs(context, 'empleado');
    const anon = await createClient(context.app).get('/api/admin/disponibilidad');
    expect(anon.status).toBe(401);

    const response = await empleado.get('/api/admin/disponibilidad');
    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object)).toEqual(['horarioSemanal', 'diasEspeciales']);
    expect(response.body.horarioSemanal).toEqual([
      ...[1, 2, 3, 4, 5, 6].map((dia) => ({ dia, abierto: true, cupoManana: 2, cupoTarde: 2 })),
      { dia: 0, abierto: false, cupoManana: 2, cupoTarde: 2 },
    ]);
    const especiales = response.body.diasEspeciales as Record<string, unknown>[];
    // La lista exacta del contrato: inamovibles de lo que queda de 2026 y de 2027, más el 23/11/2026.
    expect(especiales.map((d) => d.fecha)).toEqual([
      '2026-11-23',
      '2026-12-08',
      '2026-12-25',
      '2027-01-01',
      '2027-02-08',
      '2027-02-09',
      '2027-03-24',
      '2027-03-26',
      '2027-04-02',
      '2027-05-01',
      '2027-05-25',
      '2027-06-20',
      '2027-07-09',
      '2027-12-08',
      '2027-12-25',
    ]);
    for (const dia of especiales) {
      expect(Object.keys(dia).sort()).toEqual(['abierto', 'cupoManana', 'cupoTarde', 'fecha', 'motivo']);
      expect(dia).toMatchObject({ abierto: false, cupoManana: null, cupoTarde: null });
      expect(String(dia.motivo)).toMatch(/^Feriado: /);
    }
    expect(especiales[0]?.motivo).toMatch(/a confirmar/);

    // Un día especial pasado no aparece ("hoy" = 2026-12-09 en La Rioja).
    const tarde = await createTestContext({ disponibilidad: 'fabrica', now: new Date('2026-12-09T15:00:00.000Z') });
    const { client: otro } = await loginAs(tarde, 'empleado');
    const despues = await otro.get('/api/admin/disponibilidad');
    expect((despues.body.diasEspeciales as { fecha: string }[])[0]?.fecha).toBe('2026-12-25');
  });

  it('empleado: solo lectura (403 en PUT y DELETE); admin y superadmin editan', async () => {
    const { context, admin } = await setup();
    const { client: empleado } = await loginAs(context, 'empleado');
    const { client: superadmin } = await loginAs(context, 'superadmin');
    const prohibido = { error: { code: 'FORBIDDEN', message: 'Con tu rol solo podés ver la disponibilidad.' } };
    const dias = (await admin.get('/api/admin/disponibilidad')).body.horarioSemanal as unknown[];

    expect((await empleado.put('/api/admin/disponibilidad/horario-semanal', { dias })).body).toEqual(prohibido);
    expect((await empleado.put(`/api/admin/disponibilidad/dias-especiales/${MARTES}`, { abierto: false })).body).toEqual(prohibido);
    expect((await empleado.delete(`/api/admin/disponibilidad/dias-especiales/${FERIADO}`)).body).toEqual(prohibido);

    const put = await superadmin.put('/api/admin/disponibilidad/horario-semanal', {
      dias: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, abierto: true, cupoManana: dia, cupoTarde: 20 })),
    });
    expect(put.status).toBe(200);
    expect(put.body.horarioSemanal[6]).toEqual({ dia: 0, abierto: true, cupoManana: 0, cupoTarde: 20 });
    expect(context.logger.text).toMatch(/Horario semanal actualizado por=/);
  });

  it('validaciones del horario semanal y de los días especiales', async () => {
    const { admin, context } = await setup();
    const siete = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, abierto: true, cupoManana: 2, cupoTarde: 2 }));
    const malos: [unknown, string][] = [
      [{ dias: siete.slice(0, 6) }, 'dias'],
      [{ dias: [...siete.slice(0, 6), { ...siete[0], dia: 1 }] }, 'dias'],
      [{ dias: siete.map((d) => (d.dia === 3 ? { ...d, cupoManana: 21 } : d)) }, 'dias.3.cupoManana'],
      [{ dias: siete.map((d) => (d.dia === 3 ? { ...d, cupoTarde: 1.5 } : d)) }, 'dias.3.cupoTarde'],
      [{ dias: siete.map((d) => (d.dia === 4 ? { ...d, dia: 7 } : d)) }, 'dias.4.dia'],
      [{ dias: siete.map((d) => (d.dia === 5 ? { ...d, extra: 1 } : d)) }, 'dias.5.extra'],
      [{ dias: siete, otro: true }, 'otro'],
      [{}, 'dias'],
    ];
    for (const [body, campo] of malos) {
      const response = await admin.put('/api/admin/disponibilidad/horario-semanal', body);
      expect(response.status, campo).toBe(400);
      expect(Object.keys(response.body.error.fields as object), campo).toContain(campo);
    }

    const especial = (fecha: string, body: unknown) =>
      admin.put(`/api/admin/disponibilidad/dias-especiales/${fecha}`, body);
    const casos: [string, unknown, string][] = [
      [MARTES, { abierto: true, cupoTarde: 1 }, 'cupoManana'],
      [MARTES, { abierto: true, cupoManana: 1, cupoTarde: null }, 'cupoTarde'],
      [MARTES, { abierto: 'si' }, 'abierto'],
      [MARTES, { abierto: false, motivo: 'x'.repeat(81) }, 'motivo'],
      [MARTES, { abierto: false, motivo: 'linea\nnueva' }, 'motivo'],
      [MARTES, { abierto: false, desconocido: 1 }, 'desconocido'],
      ['2026-02-30', { abierto: false }, 'fecha'],
      ['ayer', { abierto: false }, 'fecha'],
      [addDays(TODAY, -1), { abierto: false }, 'fecha'],
      [addDays(TODAY, 731), { abierto: false }, 'fecha'],
    ];
    for (const [fecha, body, campo] of casos) {
      const response = await especial(fecha, body);
      expect(response.status, `${fecha} ${campo}`).toBe(400);
      expect(Object.keys(response.body.error.fields as object), `${fecha} ${campo}`).toContain(campo);
    }

    // Motivo vacío => null; 80 caracteres se aceptan; reemplazar un día especial existente.
    expect((await especial(MARTES, { abierto: false, motivo: '   ' })).body.dia.motivo).toBeNull();
    expect((await especial(MARTES, { abierto: true, cupoManana: 5, cupoTarde: 6, motivo: 'm'.repeat(80) })).body.dia).toEqual({
      fecha: MARTES,
      abierto: true,
      cupoManana: 5,
      cupoTarde: 6,
      motivo: 'm'.repeat(80),
    });

    // DELETE: 204 y después 404; una fecha inválida también 404.
    expect((await admin.delete(`/api/admin/disponibilidad/dias-especiales/${MARTES}`)).status).toBe(204);
    expect((await admin.delete(`/api/admin/disponibilidad/dias-especiales/${MARTES}`)).status).toBe(404);
    expect((await admin.delete('/api/admin/disponibilidad/dias-especiales/nada')).status).toBe(404);
    expect(context.logger.text).not.toMatch(/mmmm/);
  });
});

describe('seguimiento: GET /api/turnos/:id (público)', () => {
  it('devuelve solo los campos del contrato (fecha y franja de agenda), sin datos personales', async () => {
    const { context, admin, pedir } = await setup();
    const alta = await pedir(MARTES);
    const id = alta.body.booking.id as string;
    expect(alta.body.booking.seguimientoUrl).toBe(`/turno/${id}`);

    const response = await request(context.app).get(`/api/turnos/${id}`);
    expect(response.status).toBe(200);
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      turno: {
        id,
        servicioNombre: 'Pulido',
        fecha: MARTES,
        franja: 'manana',
        estado: 'pendiente',
        actualizadoEl: NOW.toISOString(),
      },
    });
    await admin.patch(`/api/admin/bookings/${id}`, { notasInternas: 'NOTA-SECRETA' });
    context.clock.current = new Date('2026-10-16T15:05:00.000Z');
    const patch = await admin.patch(`/api/admin/bookings/${id}`, {
      estado: 'confirmado',
      fechaConfirmada: MIERCOLES,
      franjaConfirmada: 'tarde',
    });
    expect(patch.status).toBe(200);
    const despues = await request(context.app).get(`/api/turnos/${id}`);
    expect(despues.body.turno).toEqual({
      id,
      servicioNombre: 'Pulido',
      fecha: MIERCOLES,
      franja: 'tarde',
      estado: 'confirmado',
      actualizadoEl: '2026-10-16T15:05:00.000Z',
    });
    const texto = JSON.stringify(despues.body);
    for (const privado of ['Juan', 'Pérez', '412-3456', '5493804123456', 'juan@example.com', 'Corolla', 'rayones', 'NOTA-SECRETA', 'auto']) {
      expect(texto, privado).not.toContain(privado);
    }
  });

  it('un id inexistente y uno con formato inválido dan el mismo 404', async () => {
    const { context } = await setup();
    const esperado = { error: { code: 'NOT_FOUND', message: 'No encontramos ese turno.' } };
    for (const id of [randomUUID(), 'abc', "1' OR '1'='1", '00000000-0000-0000-0000-000000000000', 'x'.repeat(300)]) {
      const response = await request(context.app).get(`/api/turnos/${encodeURIComponent(id)}`);
      expect(response.status, id).toBe(404);
      expect(response.body, id).toEqual(esperado);
    }
  });

  it('tiene su propio límite por IP (cuentan también los 404)', async () => {
    const context = await createTestContext({
      config: { rateLimits: { ...DEFAULT_RATE_LIMITS, seguimiento: { windowMs: 60_000, limit: 2 } } },
    });
    const id = randomUUID();
    expect((await request(context.app).get(`/api/turnos/${id}`)).status).toBe(404);
    expect((await request(context.app).get(`/api/turnos/${id}`)).status).toBe(404);
    const bloqueado = await request(context.app).get(`/api/turnos/${id}`);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error.code).toBe('RATE_LIMITED');
    // El resto de la API no comparte ese cupo.
    expect((await request(context.app).get('/api/disponibilidad')).status).toBe(200);
  });
});

describe('base de datos: migración disponibilidad_seguimiento', () => {
  it('siembra el horario y los feriados; CHECK de cupos; mgdetailing_app con el GRANT mínimo', async () => {
    const { context } = await setup();
    const { pg } = context.db;
    const insertar = (sql: string) =>
      // eslint-disable-next-line no-restricted-syntax -- SQL literal del propio test
      pg.exec(sql);
    await expect(insertar("INSERT INTO mgdetailing.dias_especiales (fecha, abierto) VALUES ('2027-08-01', true)")).rejects.toThrow(/dias_especiales_cupos/);
    await expect(insertar("INSERT INTO mgdetailing.dias_especiales (fecha, abierto, cupo_manana, cupo_tarde) VALUES ('2027-08-01', false, 1, 1)")).rejects.toThrow(/dias_especiales_cupos/);
    await expect(insertar("INSERT INTO mgdetailing.dias_especiales (fecha, abierto, cupo_manana, cupo_tarde) VALUES ('2027-08-01', true, 21, 1)")).rejects.toThrow(/cupo_manana_valido/);
    await expect(insertar("INSERT INTO mgdetailing.dias_especiales (fecha, abierto, motivo) VALUES ('2027-08-01', false, '')")).rejects.toThrow(/motivo_largo/);
    await expect(insertar('UPDATE mgdetailing.horario_semanal SET cupo_tarde = -1 WHERE dia = 1')).rejects.toThrow(/cupo_tarde_valido/);
    await expect(insertar('INSERT INTO mgdetailing.horario_semanal (dia, abierto, cupo_manana, cupo_tarde) VALUES (7, true, 1, 1)')).rejects.toThrow(/dia_valido/);

    await pg.exec('SET ROLE mgdetailing_app');
    for (const statement of [
      'INSERT INTO mgdetailing.horario_semanal (dia, abierto, cupo_manana, cupo_tarde) VALUES (3, true, 1, 1)',
      'DELETE FROM mgdetailing.horario_semanal',
      'UPDATE mgdetailing.horario_semanal SET dia = 5 WHERE dia = 4',
      'UPDATE mgdetailing.dias_especiales SET fecha = fecha + 1',
      'UPDATE mgdetailing.dias_especiales SET created_at = now()',
      "UPDATE mgdetailing.bookings SET email = 'x@y.z'",
      'TRUNCATE mgdetailing.dias_especiales',
    ]) {
      // eslint-disable-next-line no-restricted-syntax -- SQL literal del propio test
      await expect(pg.exec(statement), statement).rejects.toThrow(/permission denied/);
    }
    await pg.exec('UPDATE mgdetailing.horario_semanal SET cupo_manana = 3 WHERE dia = 1');
    await pg.exec("INSERT INTO mgdetailing.dias_especiales (fecha, abierto, motivo) VALUES ('2027-08-01', false, 'x')");
    await pg.exec("DELETE FROM mgdetailing.dias_especiales WHERE fecha = '2027-08-01'");
    await pg.exec('UPDATE mgdetailing.bookings SET recordatorio_enviado_at = now()');
    await pg.exec('RESET ROLE');

    for (const rol of ['anon', 'authenticated', 'service_role']) {
      const { rows } = await pg.query<{ ok: boolean }>(
        `SELECT has_table_privilege($1, 'mgdetailing.horario_semanal', 'SELECT') OR
                has_table_privilege($1, 'mgdetailing.dias_especiales', 'SELECT') AS ok`,
        [rol],
      );
      expect(rows[0]?.ok, rol).toBe(false);
    }
  });
});

describe('casos borde (verificación del objetivo 4)', () => {
  it('zona horaria: con el servidor en UTC, el rango público sigue el día de La Rioja', async () => {
    // 2026-10-17 02:30 UTC = 2026-10-16 23:30 en La Rioja: todavía es "hoy" el 16.
    const { context, publico } = await setup({ config: { now: new Date('2026-10-17T02:30:00.000Z') } });
    const antes = await publico();
    expect(antes[0]?.fecha).toBe(TODAY);
    expect(antes.at(-1)?.fecha).toBe(TODAY_PLUS_60);
    expect(antes).toHaveLength(61);

    // 03:00 UTC = medianoche en La Rioja: el rango corre un día.
    context.clock.current = new Date('2026-10-17T03:00:00.000Z');
    const despues = await publico();
    expect(despues[0]?.fecha).toBe('2026-10-17');
    expect(despues.at(-1)?.fecha).toBe(TODAY_PLUS_61);
    expect((await request(context.app).get(`/api/disponibilidad?desde=${TODAY}`)).status).toBe(400);
  });

  it('feriado sembrado: cerrado de fábrica; el dueño lo abre con sus cupos y un cupo 0 cierra esa franja', async () => {
    const { admin, pedir, dia } = await setup();
    expect(await dia(FERIADO)).toEqual({ fecha: FERIADO, abierto: false, manana: false, tarde: false });
    expect((await pedir(FERIADO)).body).toEqual(DIA_CERRADO);

    const abrir = await admin.put(`/api/admin/disponibilidad/dias-especiales/${FERIADO}`, {
      abierto: true,
      cupoManana: 1,
      cupoTarde: 0,
      motivo: 'Feriado: Día de la Soberanía Nacional (abrimos igual)',
    });
    expect(abrir.status).toBe(200);
    expect(abrir.body.dia).toEqual({
      fecha: FERIADO,
      abierto: true,
      cupoManana: 1,
      cupoTarde: 0,
      motivo: 'Feriado: Día de la Soberanía Nacional (abrimos igual)',
    });
    expect(await dia(FERIADO)).toEqual({ fecha: FERIADO, abierto: true, manana: true, tarde: false });
    expect((await pedir(FERIADO, 'tarde')).body).toEqual(FRANJA_LLENA); // cupo 0 => 409, no 400
    expect((await pedir(FERIADO, 'manana')).status).toBe(201);
    expect((await pedir(FERIADO, 'manana')).body).toEqual(FRANJA_LLENA);
    expect(await dia(FERIADO)).toEqual({ fecha: FERIADO, abierto: true, manana: false, tarde: false });

    // Abierto con los dos cupos en 0: el día figura abierto pero sin lugar (409 en cualquier franja).
    expect((await admin.put(`/api/admin/disponibilidad/dias-especiales/${MARTES}`, { abierto: true, cupoManana: 0, cupoTarde: 0 })).status).toBe(200);
    expect(await dia(MARTES)).toEqual({ fecha: MARTES, abierto: true, manana: false, tarde: false });
    expect((await pedir(MARTES, 'manana')).body).toEqual(FRANJA_LLENA);
  });

  it('un día especial cerrado pisa a un sábado abierto; quitarlo vuelve al horario semanal', async () => {
    const SABADO = '2026-10-24';
    const { admin, pedir, dia } = await setup();
    expect(await dia(SABADO)).toEqual({ fecha: SABADO, abierto: true, manana: true, tarde: true });
    expect((await admin.put(`/api/admin/disponibilidad/dias-especiales/${SABADO}`, { abierto: false, motivo: null })).status).toBe(200);
    expect(await dia(SABADO)).toEqual({ fecha: SABADO, abierto: false, manana: false, tarde: false });
    expect((await pedir(SABADO, 'tarde')).body).toEqual(DIA_CERRADO);
    expect((await admin.delete(`/api/admin/disponibilidad/dias-especiales/${SABADO}`)).status).toBe(204);
    expect((await admin.delete(`/api/admin/disponibilidad/dias-especiales/${SABADO}`)).status).toBe(404);
    expect((await pedir(SABADO, 'tarde')).status).toBe(201);
  });

  it('migración: los 15 feriados del contrato (cerrados, con "Feriado: "), el horario inicial, RLS y updated_at', async () => {
    const { context } = await setup();
    const { pg } = context.db;
    const feriados = await pg.query<{ fecha: string; abierto: boolean; cupo_manana: number | null; cupo_tarde: number | null; motivo: string }>(
      `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, abierto, cupo_manana, cupo_tarde, motivo
       FROM mgdetailing.dias_especiales ORDER BY fecha`,
    );
    expect(feriados.rows.map((f) => f.fecha)).toEqual([
      '2026-11-23', '2026-12-08', '2026-12-25',
      '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-24', '2027-03-26', '2027-04-02', '2027-05-01',
      '2027-05-25', '2027-06-20', '2027-07-09', '2027-12-08', '2027-12-25',
    ]);
    for (const f of feriados.rows) {
      expect(f, f.fecha).toMatchObject({ abierto: false, cupo_manana: null, cupo_tarde: null });
      expect(f.motivo.startsWith('Feriado: '), f.fecha).toBe(true);
    }
    expect(feriados.rows[0]?.motivo).toMatch(/trasladable/);

    const horario = await pg.query<{ dia: number; abierto: boolean; cupo_manana: number; cupo_tarde: number }>(
      'SELECT dia, abierto, cupo_manana, cupo_tarde FROM mgdetailing.horario_semanal ORDER BY dia',
    );
    expect(horario.rows).toEqual([0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia: d, abierto: d !== 0, cupo_manana: 2, cupo_tarde: 2 })));

    const rls = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
       WHERE relnamespace = 'mgdetailing'::regnamespace AND relname IN ('horario_semanal', 'dias_especiales') ORDER BY relname`,
    );
    expect(rls.rows).toEqual([
      { relname: 'dias_especiales', relrowsecurity: true },
      { relname: 'horario_semanal', relrowsecurity: true },
    ]);

    // updated_at: el trigger rehecho de bookings sigue poniendo now() en un cambio que no lo manda, pero no cuando
    // solo cambia la marca del recordatorio. Los de las tablas nuevas también andan.
    await rawPost(context.app, '/api/bookings').send(validBooking({ fechaPreferida: MARTES }));
    const fresco = async (consulta: Promise<{ rows: { fresco: boolean | null }[] }>) => (await consulta).rows[0]?.fresco;

    await pg.exec("UPDATE mgdetailing.bookings SET updated_at = '2000-01-01T00:00:00Z'");
    await pg.exec('UPDATE mgdetailing.bookings SET recordatorio_enviado_at = now()');
    const bookingsFresco = () =>
      pg.query<{ fresco: boolean | null }>("SELECT bool_and(updated_at > '2020-01-01'::timestamptz) AS fresco FROM mgdetailing.bookings");
    expect(await fresco(bookingsFresco())).toBe(false); // marcar el recordatorio no es un cambio del turno
    await pg.exec("UPDATE mgdetailing.bookings SET estado = 'confirmado'");
    expect(await fresco(bookingsFresco())).toBe(true); // cualquier otro cambio sin updated_at => now()

    await pg.exec("UPDATE mgdetailing.horario_semanal SET updated_at = '2000-01-01T00:00:00Z'");
    await pg.exec('UPDATE mgdetailing.horario_semanal SET abierto = abierto');
    expect(
      await fresco(pg.query<{ fresco: boolean | null }>("SELECT bool_and(updated_at > '2020-01-01'::timestamptz) AS fresco FROM mgdetailing.horario_semanal")),
    ).toBe(true);
    await pg.exec("UPDATE mgdetailing.dias_especiales SET updated_at = '2000-01-01T00:00:00Z'");
    await pg.exec('UPDATE mgdetailing.dias_especiales SET motivo = motivo');
    expect(
      await fresco(pg.query<{ fresco: boolean | null }>("SELECT bool_and(updated_at > '2020-01-01'::timestamptz) AS fresco FROM mgdetailing.dias_especiales")),
    ).toBe(true);
    await pg.exec("UPDATE mgdetailing.servicios SET updated_at = '2000-01-01T00:00:00Z'");
    await pg.exec('UPDATE mgdetailing.servicios SET activo = activo');
    expect(await fresco(pg.query<{ fresco: boolean | null }>("SELECT bool_and(updated_at > '2020-01-01'::timestamptz) AS fresco FROM mgdetailing.servicios"))).toBe(
      true,
    );
  });
});
