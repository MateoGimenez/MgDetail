import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rol } from './contract-panel';
import { ESTADOS } from './contract';
import * as permisos from '../admin/permisos';
import { actualizarTurno, listarAgenda, listarTrabajadores, listarTurnos, obtenerPermisos } from './admin';
import { ApiError } from './client';
import { turnoSchema } from './contract';
import { obtenerEstadisticas, obtenerMisTrabajos } from './estadisticas';
import fixtures from './fixtures-backend/respuestas.json';

/*
 * Las respuestas REALES del backend (generadas por backend/test/integracion-objetivo8.test.ts con la app de test y
 * PGlite; ACTUALIZAR_FIXTURES=1 las regenera) pasadas por los esquemas estrictos del panel y por las funciones de
 * api/*. Así el contrato no depende de lo que cada lado imagina del otro.
 */

type Captura = { status: number; body: unknown };
const capturas = fixtures as unknown as Record<string, Captura>;
const de = (nombre: string): Captura => {
  const captura = capturas[nombre];
  if (!captura) throw new Error(`Falta la captura ${nombre}`);
  return captura;
};

/**
 * Las capturas de estadísticas anteriores al objetivo 10 no traen gastos. Mientras el backend no las regenere
 * (ACTUALIZAR_FIXTURES=1), se completan en cero para poder probar el resto; las que ya traen `gastosPorCategoria`
 * (las regeneradas) se usan tal cual, sin tocar.
 */
function conGastos(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('resumen' in body) || 'gastosPorCategoria' in body) return body;
  const b = structuredClone(body) as {
    resumen: Record<string, Record<string, Record<string, number>>>;
    periodo: Record<string, number | null> & { ingresos: number };
    serie: Record<string, number>[];
    gastosPorCategoria?: unknown[];
  };
  for (const tramo of Object.values(b.resumen)) {
    for (const lado of Object.values(tramo)) {
      lado.gastos = 0;
      lado.ganancia = lado.ingresos ?? 0;
    }
  }
  b.periodo.gastos = 0;
  b.periodo.gananciaNeta = b.periodo.ingresos;
  b.periodo.margen = b.periodo.ingresos > 0 ? 1 : null;
  for (const punto of b.serie) punto.gastos = 0;
  b.gastosPorCategoria = [];
  return b;
}

function responder(nombre: string) {
  const { status, body } = de(nombre);
  const cuerpo = conGastos(body);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const RANGO = { desde: '2026-10-01', hasta: '2026-10-16' };
const turnosDe = (nombre: string): Record<string, unknown>[] => {
  const body = de(nombre).body as { bookings?: Record<string, unknown>[]; turnos?: Record<string, unknown>[] };
  return body.bookings ?? body.turnos ?? [];
};

describe('Turno: el backend manda exactamente los campos que el panel espera', () => {
  it('ni de más ni de menos, en listado, agenda y PATCH', () => {
    const claves = Object.keys(turnoSchema.shape).sort();
    const todos = [
      ...turnosDe('listaAdmin'),
      ...turnosDe('listaEmpleado'),
      ...turnosDe('agendaAdmin'),
      ...turnosDe('agendaEmpleado'),
      ...['patchAdminCompleta', 'patchEmpleadoCompleta', 'patchAdminCompletaSinCobro'].map(
        (n) => (de(n).body as { booking: Record<string, unknown> }).booking,
      ),
    ];
    expect(todos.length).toBeGreaterThan(8);
    for (const turno of todos) expect(Object.keys(turno).sort()).toEqual(claves);
  });

  it('listado y agenda del admin y del empleado pasan los esquemas estrictos', async () => {
    responder('listaAdmin');
    const admin = await listarTurnos({ limit: 20, offset: 0 });
    expect(admin.turnos.some((t) => t.monto === 60000 && t.trabajador?.nombre === 'Ana')).toBe(true);
    expect(admin.turnos.some((t) => t.estado === 'completado' && t.monto === null && t.trabajador === null)).toBe(true);

    responder('listaEmpleado');
    const empleado = await listarTurnos({ limit: 20, offset: 0 });
    expect(empleado.turnos.every((t) => t.monto === null)).toBe(true);
    expect(empleado.turnos.some((t) => t.trabajador?.nombre === 'Ana')).toBe(true);

    for (const nombre of ['agendaAdmin', 'agendaEmpleado']) {
      responder(nombre);
      const agenda = await listarAgenda('2026-10-14', '2026-10-16');
      expect(agenda.turnos.length).toBeGreaterThan(0);
    }
  });

  it('PATCH: el turno completado por el admin, por el empleado y sin cobro', async () => {
    responder('patchAdminCompleta');
    const admin = await actualizarTurno('x', { estado: 'completado', monto: 60000, trabajadorId: 'y' });
    expect(admin).toMatchObject({ estado: 'completado', monto: 60000, trabajador: { nombre: 'Ana' } });

    responder('patchEmpleadoCompleta');
    const empleado = await actualizarTurno('x', { estado: 'completado' });
    expect(empleado).toMatchObject({ estado: 'completado', monto: null, trabajador: { nombre: 'Beto' } });

    responder('patchAdminCompletaSinCobro');
    expect(await actualizarTurno('x', { estado: 'completado' })).toMatchObject({ monto: null, trabajador: null });
  });
});

describe('errores del PATCH ampliado', () => {
  const fallo = async (nombre: string, cambios: Parameters<typeof actualizarTurno>[1]) => {
    responder(nombre);
    return (await actualizarTurno('x', cambios).catch((e: unknown) => e)) as ApiError;
  };

  it('400 con fields.monto y fields.trabajadorId llegan como ApiError con sus campos', async () => {
    for (const [nombre, campo] of [
      ['error400Monto', 'monto'],
      ['error400MontoRango', 'monto'],
      ['error400Trabajador', 'trabajadorId'],
      ['error400TrabajadorInexistente', 'trabajadorId'],
    ] as const) {
      const error = await fallo(nombre, campo === 'monto' ? { monto: 5 } : { trabajadorId: 'y' });
      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(error.fields ?? {})).toEqual([campo]);
    }
  });

  it('403 del empleado llega como ApiError FORBIDDEN con mensaje', async () => {
    for (const nombre of ['error403EmpleadoMonto', 'error403EmpleadoCorrige']) {
      const error = await fallo(nombre, { monto: 5 });
      expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN' });
      expect(error.message.length).toBeGreaterThan(10);
    }
  });
});

describe('trabajadores, estadísticas y permisos', () => {
  it('GET /trabajadores', async () => {
    responder('trabajadores');
    const lista = await listarTrabajadores();
    expect(lista.map((t) => t.nombre)).toEqual(['Ana', 'Beto', 'sin@t.test']);
  });

  it('GET /estadisticas: mes por día, año por mes y período vacío', async () => {
    responder('estadisticasMes');
    const mes = await obtenerEstadisticas(RANGO);
    expect(mes.granularidad).toBe('dia');
    expect(mes.serie).toHaveLength(16);
    expect(mes.porDiaSemana).toHaveLength(7);

    responder('estadisticasAnio');
    const anio = await obtenerEstadisticas({ desde: '2026-01-01', hasta: '2026-12-31' });
    expect(anio.granularidad).toBe('mes');
    expect(anio.serie).toHaveLength(12);

    responder('estadisticasVacio');
    const vacio = await obtenerEstadisticas({ desde: '2020-01-01', hasta: '2020-01-07' });
    expect(vacio.periodo).toMatchObject({ turnos: 0, ticketPromedio: null, tasaCancelacion: null });
    expect(vacio.porTrabajador).toEqual([]);
  });

  it('GET /estadisticas/mias (día y mes) y el 403 de las completas', async () => {
    responder('misTrabajos');
    expect((await obtenerMisTrabajos(RANGO)).completados).toBe(1);
    responder('misTrabajosAnio');
    expect((await obtenerMisTrabajos({ desde: '2026-01-01', hasta: '2026-12-31' })).serie).toHaveLength(12);
    responder('error403EstadisticasEmpleado');
    expect(await obtenerEstadisticas(RANGO).catch((e: unknown) => e)).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('GET /permisos para el empleado y para el admin', async () => {
    responder('permisosEmpleado');
    const empleado = await obtenerPermisos();
    expect(empleado.tuRol).toBe('empleado');
    expect(empleado.roles.map((r) => r.id)).toEqual(['superadmin', 'admin', 'empleado']);
    responder('permisosAdmin');
    expect((await obtenerPermisos()).tuRol).toBe('admin');
  });

  it('el empleado nunca ve importes en sus respuestas', () => {
    for (const nombre of ['listaEmpleado', 'agendaEmpleado', 'patchEmpleadoCompleta', 'misTrabajos', 'misTrabajosAnio']) {
      const texto = JSON.stringify(de(nombre).body);
      expect(texto, nombre).not.toMatch(/60000|ingresos/);
      expect(texto.match(/"monto":(\S+?)[,}]/g)?.every((m) => m.includes('null')) ?? true, nombre).toBe(true);
    }
  });
});

describe('las funciones puede* del panel no contradicen a /api/admin/permisos', () => {
  const capacidades = (de('permisosAdmin').body as { capacidades: { id: string; roles: Record<Rol, 'si' | 'no' | 'parcial'> }[] })
    .capacidades;
  const nivel = (id: string, rol: Rol) => {
    const capacidad = capacidades.find((c) => c.id === id);
    if (!capacidad) throw new Error(`Falta la capacidad ${id}`);
    return capacidad.roles[rol];
  };
  const ROLES_PRUEBA: Rol[] = ['superadmin', 'admin', 'empleado'];

  it('cada función coincide con su capacidad, para los tres roles', () => {
    const simples: [string, (rol: Rol) => boolean][] = [
      ['turnos.borrar', permisos.puedeBorrarTurnos],
      ['turnos.reprogramar', permisos.puedeReprogramar],
      ['turnos.notas', permisos.puedeEditarNotas],
      ['catalogo.editar', permisos.puedeEditarCatalogo],
      ['disponibilidad.editar', permisos.puedeEditarDisponibilidad],
      ['usuarios.gestionar', permisos.puedeGestionarUsuarios],
      ['cobro.registrar', permisos.puedeRegistrarCobro],
      ['estadisticas.completas', permisos.puedeVerEstadisticas],
    ];
    for (const rol of ROLES_PRUEBA) {
      for (const [id, funcion] of simples) expect(funcion(rol), `${id} / ${rol}`).toBe(nivel(id, rol) === 'si');
      for (const estado of ESTADOS) {
        const esperado = nivel('turnos.estado', rol) === 'si' || (nivel('turnos.estado', rol) === 'parcial' && estado === 'completado');
        expect(permisos.puedeCambiarEstado(rol, estado), `estado ${estado} / ${rol}`).toBe(esperado);
      }
    }
  });

  it('el empleado no ve botones de estado que el backend le niega, y el selector solo si puede más de uno', () => {
    expect(permisos.muestraSelectorDeEstado('empleado')).toBe(nivel('turnos.estado', 'empleado') === 'si');
    expect(permisos.muestraSelectorDeEstado('admin')).toBe(nivel('turnos.estado', 'admin') === 'si');
  });
});
