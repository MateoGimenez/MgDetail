import { afterEach, describe, expect, it, vi } from 'vitest';
import { puedeRegistrarCobro } from '../admin/permisos';
import { actualizarTurno, listarTrabajadores, listarTurnos, obtenerPermisos } from './admin';
import { ApiError } from './client';

/* Contrato: reportes/2026-10-26_15_estadisticas-y-permisos.md */

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
  fechaConfirmada: null,
  franjaConfirmada: null,
  comentario: null,
  estado: 'completado',
  createdAt: '2026-10-16T15:00:00.000Z',
  updatedAt: '2026-10-22T15:00:00.000Z',
  notasInternas: null,
  turnosDelCliente: 1,
  monto: 60000,
  trabajador: { id: 'u1', nombre: 'Lucas' },
};

function simular(respuesta: () => Response) {
  const llamadas: { metodo: string; ruta: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      llamadas.push({
        metodo: init?.method ?? 'GET',
        ruta: typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      return Promise.resolve(respuesta());
    }),
  );
  return llamadas;
}

const fallo = async (promesa: Promise<unknown>) => (await promesa.catch((e: unknown) => e)) as ApiError;
const pagina = { limit: 20, offset: 0 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Turno con cobro y trabajador (validación estricta)', () => {
  it('acepta un completado con monto y trabajador, y uno sin cobro', async () => {
    simular(() => json(200, { bookings: [turno, { ...turno, id: 'a2', monto: null, trabajador: null }], total: 2 }));
    const { turnos } = await listarTurnos(pagina);
    expect(turnos[0]?.monto).toBe(60000);
    expect(turnos[0]?.trabajador).toEqual({ id: 'u1', nombre: 'Lucas' });
    expect(turnos[1]).toMatchObject({ monto: null, trabajador: null });
  });

  it('sin los campos nuevos se rechaza', async () => {
    const sin = (campo: string) => Object.fromEntries(Object.entries(turno).filter(([clave]) => clave !== campo));
    for (const viejo of [sin('monto'), sin('trabajador')]) {
      simular(() => json(200, { bookings: [viejo], total: 1 }));
      expect((await fallo(listarTurnos(pagina))).code).toBe('INVALID_RESPONSE');
    }
  });

  it('monto: entero de 0 a 99.999.999; trabajador: solo id y nombre', async () => {
    const malos = [
      { ...turno, monto: -1 },
      { ...turno, monto: 12.5 },
      { ...turno, monto: '60000' },
      { ...turno, monto: 100_000_000 },
      { ...turno, trabajador: { id: 'u1' } },
      { ...turno, trabajador: { id: 'u1', nombre: 'Lucas', rol: 'admin' } },
    ];
    for (const malo of malos) {
      simular(() => json(200, { bookings: [malo], total: 1 }));
      expect((await fallo(listarTurnos(pagina))).code, JSON.stringify(malo)).toBe('INVALID_RESPONSE');
    }
    simular(() => json(200, { bookings: [{ ...turno, monto: 0 }], total: 1 }));
    expect((await listarTurnos(pagina)).turnos[0]?.monto).toBe(0);
  });

  it('solo un completado tiene cobro o trabajador', async () => {
    simular(() => json(200, { bookings: [{ ...turno, estado: 'confirmado' }], total: 1 }));
    expect((await fallo(listarTurnos(pagina))).code).toBe('INVALID_RESPONSE');
    simular(() => json(200, { bookings: [{ ...turno, estado: 'cancelado', monto: null }], total: 1 }));
    expect((await fallo(listarTurnos(pagina))).code).toBe('INVALID_RESPONSE');
    simular(() => json(200, { bookings: [{ ...turno, estado: 'confirmado', monto: null, trabajador: null }], total: 1 }));
    expect((await listarTurnos(pagina)).turnos).toHaveLength(1);
  });
});

describe('PATCH con cobro', () => {
  it('completar manda estado, monto y trabajadorId juntos', async () => {
    const llamadas = simular(() => json(200, { booking: turno }));
    const actualizado = await actualizarTurno('a1', { estado: 'completado', monto: 60000, trabajadorId: 'u1' });
    expect(actualizado.monto).toBe(60000);
    expect(llamadas).toEqual([
      { metodo: 'PATCH', ruta: '/api/admin/bookings/a1', body: { estado: 'completado', monto: 60000, trabajadorId: 'u1' } },
    ]);
  });

  it('editar el cobro de un completado manda solo lo que cambia; null lo quita', async () => {
    const llamadas = simular(() => json(200, { booking: { ...turno, monto: null, trabajador: null } }));
    await actualizarTurno('a1', { monto: null });
    await actualizarTurno('a1', { trabajadorId: null });
    expect(llamadas.map((l) => l.body)).toEqual([{ monto: null }, { trabajadorId: null }]);
  });

  it('un 400 trae fields.monto y fields.trabajadorId para mostrarlos en su campo', async () => {
    simular(() =>
      json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Revisá los datos.',
          fields: { monto: 'El monto no puede pasar de 99.999.999.', trabajadorId: 'Esa persona no está activa.' },
        },
      }),
    );
    const error = await fallo(actualizarTurno('a1', { monto: 1, trabajadorId: 'zzz' }));
    expect(error.status).toBe(400);
    expect(error.fields).toEqual({
      monto: 'El monto no puede pasar de 99.999.999.',
      trabajadorId: 'Esa persona no está activa.',
    });
  });
});

describe('GET /api/admin/trabajadores', () => {
  it('devuelve las personas activas', async () => {
    const trabajadores = [
      { id: 'u1', nombre: 'Lucas', rol: 'empleado' },
      { id: 'u2', nombre: 'Mateo', rol: 'superadmin' },
    ];
    const llamadas = simular(() => json(200, { trabajadores }));
    expect(await listarTrabajadores()).toEqual(trabajadores);
    expect(llamadas[0]?.ruta).toBe('/api/admin/trabajadores');
  });

  it('rechaza una forma que no cierra (rol inexistente, falta nombre)', async () => {
    simular(() => json(200, { trabajadores: [{ id: 'u1', nombre: 'Lucas', rol: 'jefe' }] }));
    expect((await fallo(listarTrabajadores())).code).toBe('INVALID_RESPONSE');
    simular(() => json(200, { trabajadores: [{ id: 'u1', rol: 'admin' }] }));
    expect((await fallo(listarTrabajadores())).code).toBe('INVALID_RESPONSE');
  });
});

const permisos = {
  roles: [
    { id: 'superadmin', nombre: 'Superadmin', descripcion: 'Todo.' },
    { id: 'admin', nombre: 'Admin', descripcion: 'Casi todo.' },
    { id: 'empleado', nombre: 'Empleado', descripcion: 'Lo del día a día.' },
  ],
  capacidades: [
    { id: 'turnos.ver', grupo: 'Turnos', texto: 'Ver los turnos y la agenda', roles: { superadmin: 'si', admin: 'si', empleado: 'si' } },
    {
      id: 'turnos.estado',
      grupo: 'Turnos',
      texto: 'Cambiar el estado de un turno',
      roles: { superadmin: 'si', admin: 'si', empleado: 'parcial' },
      matiz: { empleado: 'Solo puede marcarlos como Completado' },
    },
  ],
  tuRol: 'empleado',
};

describe('GET /api/admin/permisos', () => {
  it('devuelve la matriz y el rol de quien pregunta', async () => {
    const llamadas = simular(() => json(200, permisos));
    expect(await obtenerPermisos()).toEqual(permisos);
    expect(llamadas[0]?.ruta).toBe('/api/admin/permisos');
  });

  it('rechaza niveles o roles que no existen', async () => {
    const malo = { ...permisos, capacidades: [{ ...permisos.capacidades[0], roles: { superadmin: 'si', admin: 'tal vez', empleado: 'si' } }] };
    simular(() => json(200, malo));
    expect((await fallo(obtenerPermisos())).code).toBe('INVALID_RESPONSE');
    simular(() => json(200, { ...permisos, tuRol: 'jefe' }));
    expect((await fallo(obtenerPermisos())).code).toBe('INVALID_RESPONSE');
  });
});

describe('puedeRegistrarCobro', () => {
  it('lo hacen superadmin y admin; el empleado completa sin monto', () => {
    expect(puedeRegistrarCobro('superadmin')).toBe(true);
    expect(puedeRegistrarCobro('admin')).toBe(true);
    expect(puedeRegistrarCobro('empleado')).toBe(false);
  });
});
