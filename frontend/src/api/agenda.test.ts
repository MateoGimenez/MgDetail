import { afterEach, describe, expect, it, vi } from 'vitest';
import { admiteNuevaFecha, puedeReprogramar } from '../admin/permisos';
import { actualizarTurno, cambiarEstado, listarAgenda } from './admin';
import { ApiError } from './client';

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

const turno = {
  id: 'a1',
  nombre: 'Lucía',
  telefono: '380 412-3456',
  telefonoWhatsapp: '5493804123456',
  email: null,
  vehiculoTipo: 'auto',
  vehiculoModelo: null,
  servicioId: 'pulido',
  fechaPreferida: '2026-10-22',
  franja: 'manana',
  fechaConfirmada: '2026-10-24',
  franjaConfirmada: 'tarde',
  comentario: null,
  estado: 'confirmado',
  createdAt: '2026-10-16T15:00:00.000Z',
  updatedAt: '2026-10-22T15:00:00.000Z',
};

function simular(respuesta: () => Response) {
  const llamadas: { metodo: string; ruta: string; tipo: string | null; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      llamadas.push({
        metodo: init?.method ?? 'GET',
        ruta: typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url,
        tipo: headers.get('Content-Type'),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      return Promise.resolve(respuesta());
    }),
  );
  return llamadas;
}

const codigo = async (promesa: Promise<unknown>) => ((await promesa.catch((e: unknown) => e)) as ApiError).code;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/admin/agenda', () => {
  it('pide el rango inclusivo y devuelve los turnos', async () => {
    const llamadas = simular(() => json(200, { turnos: [turno] }));
    expect(await listarAgenda('2026-10-19', '2026-10-25')).toEqual([turno]);
    expect(llamadas).toEqual([
      { metodo: 'GET', ruta: '/api/admin/agenda?desde=2026-10-19&hasta=2026-10-25', tipo: null, body: undefined },
    ]);
  });

  it('valida estricto: sin los campos nuevos, o con fecha y franja separadas, se rechaza', async () => {
    const viejo = Object.fromEntries(Object.entries(turno).filter(([clave]) => !clave.endsWith('Confirmada')));
    simular(() => json(200, { turnos: [viejo] }));
    expect(await codigo(listarAgenda('2026-10-19', '2026-10-25'))).toBe('INVALID_RESPONSE');

    simular(() => json(200, { turnos: [{ ...turno, franjaConfirmada: null }] }));
    expect(await codigo(listarAgenda('2026-10-19', '2026-10-25'))).toBe('INVALID_RESPONSE');

    simular(() => json(200, { turnos: [{ ...turno, franjaConfirmada: 'noche' }] }));
    expect(await codigo(listarAgenda('2026-10-19', '2026-10-25'))).toBe('INVALID_RESPONSE');

    simular(() => json(200, { turnos: [{ ...turno, fechaConfirmada: null, franjaConfirmada: null }] }));
    expect(await listarAgenda('2026-10-19', '2026-10-25')).toHaveLength(1);
  });

  it('un 400 trae los campos del rango', async () => {
    simular(() =>
      json(400, { error: { code: 'VALIDATION_ERROR', message: 'Revisá las fechas.', fields: { hasta: 'Máximo 42 días.' } } }),
    );
    const error = (await listarAgenda('2026-10-19', '2027-10-25').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(400);
    expect(error.fields).toEqual({ hasta: 'Máximo 42 días.' });
  });
});

describe('PATCH /api/admin/bookings/:id ampliado', () => {
  it('confirma con otra fecha en el mismo pedido, con JSON', async () => {
    const llamadas = simular(() => json(200, { booking: turno }));
    const cambios = { estado: 'confirmado', fechaConfirmada: '2026-10-24', franjaConfirmada: 'tarde' } as const;
    expect(await actualizarTurno('a1', cambios)).toEqual(turno);
    expect(llamadas).toEqual([
      { metodo: 'PATCH', ruta: '/api/admin/bookings/a1', tipo: 'application/json', body: cambios },
    ]);
  });

  it('reprograma, vuelve a lo pedido (null las dos) y cambia solo el estado', async () => {
    const llamadas = simular(() => json(200, { booking: turno }));
    await actualizarTurno('a1', { fechaConfirmada: '2026-11-02', franjaConfirmada: 'manana' });
    await actualizarTurno('a1', { fechaConfirmada: null, franjaConfirmada: null });
    await cambiarEstado('a1', 'completado');
    expect(llamadas.map((l) => l.body)).toEqual([
      { fechaConfirmada: '2026-11-02', franjaConfirmada: 'manana' },
      { fechaConfirmada: null, franjaConfirmada: null },
      { estado: 'completado' },
    ]);
  });

  it('una fecha fuera de rango vuelve con fields.fechaConfirmada', async () => {
    simular(() =>
      json(400, {
        error: { code: 'VALIDATION_ERROR', message: 'Revisá la fecha.', fields: { fechaConfirmada: 'Fuera de rango.' } },
      }),
    );
    const error = (await actualizarTurno('a1', { fechaConfirmada: '2030-01-01', franjaConfirmada: 'tarde' }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(error.fields?.fechaConfirmada).toBe('Fuera de rango.');
  });
});

describe('permisos de la agenda', () => {
  it('reprograman superadmin y admin; el empleado solo mira', () => {
    expect(puedeReprogramar('superadmin')).toBe(true);
    expect(puedeReprogramar('admin')).toBe(true);
    expect(puedeReprogramar('empleado')).toBe(false);
  });

  it('cancelados y completados conservan su fecha', () => {
    expect(admiteNuevaFecha('pendiente')).toBe(true);
    expect(admiteNuevaFecha('confirmado')).toBe(true);
    expect(admiteNuevaFecha('completado')).toBe(false);
    expect(admiteNuevaFecha('cancelado')).toBe(false);
  });
});
