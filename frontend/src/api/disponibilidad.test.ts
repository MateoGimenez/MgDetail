import { afterEach, describe, expect, it, vi } from 'vitest';
import { puedeEditarDisponibilidad } from '../admin/permisos';
import { guardarDiaEspecial, guardarHorarioSemanal, listarAgenda, quitarDiaEspecial, verDisponibilidad } from './admin';
import { ApiError } from './client';
import { CODIGO_FRANJA_LLENA, type TurnoNuevo } from './contract';
import { consultarDisponibilidad, consultarTurno, crearTurno } from './turnos';

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

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

const error = async (promesa: Promise<unknown>) => (await promesa.catch((e: unknown) => e)) as ApiError;

afterEach(() => {
  vi.unstubAllGlobals();
});

const UUID = '3f2a9c1e-7b4d-4e8a-9c2b-1d5e6f7a8b9c';

const pedido: TurnoNuevo = {
  nombre: 'Lucía',
  telefono: '380 412 3456',
  email: '',
  vehiculoTipo: 'auto',
  vehiculoModelo: '',
  servicioId: 'pulido',
  fechaPreferida: '2026-10-28',
  franja: 'manana',
  comentario: '',
  website: '',
};

describe('GET /api/disponibilidad', () => {
  const dias = [
    { fecha: '2026-10-24', abierto: true, manana: true, tarde: false },
    { fecha: '2026-10-25', abierto: false, manana: false, tarde: false },
  ];

  it('sin rango pide el de siempre y devuelve los días', async () => {
    const llamadas = simular(() => json(200, { dias }));
    expect(await consultarDisponibilidad(null)).toEqual(dias);
    expect(llamadas[0]?.ruta).toBe('/api/disponibilidad');
  });

  it('con rango manda desde y hasta', async () => {
    const llamadas = simular(() => json(200, { dias }));
    await consultarDisponibilidad({ desde: '2026-10-24', hasta: '2026-10-30' });
    expect(llamadas[0]?.ruta).toBe('/api/disponibilidad?desde=2026-10-24&hasta=2026-10-30');
  });

  it('una forma que no cierra (fecha inválida, sin franjas) se rechaza: el formulario vuelve al campo de fecha', async () => {
    simular(() => json(200, { dias: [{ fecha: '2026-02-30', abierto: true, manana: true, tarde: true }] }));
    expect((await error(consultarDisponibilidad(null))).code).toBe('INVALID_RESPONSE');
    simular(() => json(200, { dias: [{ fecha: '2026-10-24', abierto: true }] }));
    expect((await error(consultarDisponibilidad(null))).code).toBe('INVALID_RESPONSE');
  });
});

describe('POST /api/bookings con disponibilidad', () => {
  it('devuelve la ruta de seguimiento que manda el backend (dentro de booking o arriba)', async () => {
    simular(() => json(201, { booking: { id: UUID, seguimientoUrl: `/turno/${UUID}` } }));
    expect(await crearTurno(pedido)).toEqual({ id: UUID, seguimiento: `/turno/${UUID}` });
    simular(() => json(201, { booking: { id: UUID }, seguimientoUrl: `/turno/${UUID}` }));
    expect((await crearTurno(pedido)).seguimiento).toBe(`/turno/${UUID}`);
  });

  it('sin seguimientoUrl la arma con el id; nunca acepta un enlace a otro sitio', async () => {
    simular(() => json(201, { booking: { id: UUID } }));
    expect((await crearTurno(pedido)).seguimiento).toBe(`/turno/${UUID}`);
    simular(() => json(201, { booking: { id: UUID, seguimientoUrl: 'https://otro.sitio/turno/x' } }));
    expect((await crearTurno(pedido)).seguimiento).toBe(`/turno/${UUID}`);
    simular(() => json(201, { booking: {} }));
    expect(await crearTurno(pedido)).toEqual({ id: null, seguimiento: null });
  });

  it('409 FRANJA_LLENA y 400 de día cerrado llegan con su código y su campo', async () => {
    simular(() =>
      json(409, {
        error: { code: 'FRANJA_LLENA', message: 'Esa franja se llenó. Elegí otra.', fields: { franja: 'Esa franja se llenó. Elegí otra.' } },
      }),
    );
    const lleno = await error(crearTurno(pedido));
    expect([lleno.status, lleno.code, lleno.fields?.franja]).toEqual([409, CODIGO_FRANJA_LLENA, 'Esa franja se llenó. Elegí otra.']);

    simular(() =>
      json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Revisá los datos.',
          fields: { fechaPreferida: 'Ese día no tomamos turnos. Elegí otro.' },
        },
      }),
    );
    expect((await error(crearTurno(pedido))).fields).toEqual({ fechaPreferida: 'Ese día no tomamos turnos. Elegí otro.' });
  });
});

describe('GET /api/turnos/:id (seguimiento)', () => {
  const turno = {
    id: UUID,
    servicioNombre: 'Pulido',
    fecha: '2026-10-28',
    franja: 'tarde',
    estado: 'confirmado',
    actualizadoEl: '2026-10-23T15:00:00.000Z',
  };

  it('devuelve solo los campos públicos, aunque el backend mande de más', async () => {
    const llamadas = simular(() => json(200, { turno: { ...turno, nombre: 'Lucía', telefono: '380', notasInternas: 'x' } }));
    expect(await consultarTurno(UUID)).toEqual(turno);
    expect(llamadas[0]?.ruta).toBe(`/api/turnos/${UUID}`);
  });

  it('404 → null; un id con formato inválido da null sin pedir nada', async () => {
    simular(() => json(404, { error: { code: 'NOT_FOUND', message: 'No encontramos ese turno.' } }));
    expect(await consultarTurno(UUID)).toBeNull();
    const llamadas = simular(() => json(200, { turno }));
    expect(await consultarTurno('../admin')).toBeNull();
    expect(await consultarTurno('123')).toBeNull();
    expect(llamadas).toHaveLength(0);
  });

  it('otros errores (red, 429) se propagan para mostrar Reintentar', async () => {
    simular(() => json(429, { error: { code: 'RATE_LIMITED', message: 'Esperá un momento.' } }));
    expect((await error(consultarTurno(UUID))).status).toBe(429);
  });
});

describe('Panel: disponibilidad', () => {
  const horario = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, abierto: dia !== 0, cupoManana: 2, cupoTarde: 2 }));
  const feriado = { fecha: '2026-12-25', abierto: false, cupoManana: null, cupoTarde: null, motivo: 'Feriado: Navidad' };

  it('GET lee horario y días especiales; un cupo o motivo ausente queda en null', async () => {
    simular(() =>
      json(200, { horarioSemanal: horario, diasEspeciales: [feriado, { fecha: '2026-12-27', abierto: false }] }),
    );
    const datos = await verDisponibilidad();
    expect(datos.horarioSemanal).toHaveLength(7);
    expect(datos.diasEspeciales).toEqual([
      feriado,
      { fecha: '2026-12-27', abierto: false, cupoManana: null, cupoTarde: null, motivo: null },
    ]);
  });

  it('GET rechaza un horario que no tiene los 7 días o un cupo fuera de 0–20', async () => {
    simular(() => json(200, { horarioSemanal: horario.slice(1), diasEspeciales: [] }));
    expect((await error(verDisponibilidad())).code).toBe('INVALID_RESPONSE');
    simular(() => json(200, { horarioSemanal: [{ ...horario[0], cupoManana: 21 }, ...horario.slice(1)], diasEspeciales: [] }));
    expect((await error(verDisponibilidad())).code).toBe('INVALID_RESPONSE');
  });

  it('PUT del horario manda los 7 días, solo con los campos del contrato', async () => {
    const llamadas = simular(() => json(200, { horarioSemanal: horario }));
    expect(await guardarHorarioSemanal(horario.map((h) => ({ ...h, extra: 1 })))).toEqual(horario);
    expect(llamadas[0]).toEqual({
      metodo: 'PUT',
      ruta: '/api/admin/disponibilidad/horario-semanal',
      tipo: 'application/json',
      body: { dias: horario },
    });
  });

  it('PUT y DELETE de un día especial', async () => {
    const llamadas = simular(() => json(200, { dia: { ...feriado, abierto: true, cupoManana: 1, cupoTarde: 0 } }));
    const dia = await guardarDiaEspecial('2026-12-25', { abierto: true, cupoManana: 1, cupoTarde: 0, motivo: 'Feriado: Navidad' });
    expect(dia.cupoManana).toBe(1);
    expect(llamadas[0]).toMatchObject({
      metodo: 'PUT',
      ruta: '/api/admin/disponibilidad/dias-especiales/2026-12-25',
      body: { abierto: true, cupoManana: 1, cupoTarde: 0, motivo: 'Feriado: Navidad' },
    });

    const borrado = simular(() => new Response(null, { status: 204 }));
    await quitarDiaEspecial('2026-12-25');
    expect(borrado[0]).toMatchObject({ metodo: 'DELETE', ruta: '/api/admin/disponibilidad/dias-especiales/2026-12-25' });
  });

  it('la agenda trae los cupos de cada día; si no cierran, la agenda funciona igual', async () => {
    const cupo = { fecha: '2026-10-26', abierto: true, cupoManana: 2, cupoTarde: 3, ocupadosManana: 2, ocupadosTarde: 0 };
    simular(() => json(200, { turnos: [], cupos: [cupo] }));
    expect(await listarAgenda('2026-10-26', '2026-11-01')).toEqual({ turnos: [], cupos: [cupo] });
    simular(() => json(200, { turnos: [], cupos: [{ fecha: '2026-10-26' }] }));
    expect(await listarAgenda('2026-10-26', '2026-11-01')).toEqual({ turnos: [], cupos: null });
  });

  it('editar la disponibilidad: superadmin y admin; el empleado solo la ve', () => {
    expect([puedeEditarDisponibilidad('superadmin'), puedeEditarDisponibilidad('admin'), puedeEditarDisponibilidad('empleado')]).toEqual([
      true,
      true,
      false,
    ]);
  });
});
