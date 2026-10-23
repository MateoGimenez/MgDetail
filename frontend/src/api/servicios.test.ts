import { afterEach, describe, expect, it, vi } from 'vitest';
import { puedeEditarCatalogo } from '../admin/permisos';
import { conServicio, mensajeActivo, moverEnLista } from '../admin/useServicios';
import {
  MENSAJE_DESTACADO_INACTIVO,
  cambiosDe,
  formularioDesde,
  formularioVacio,
  leerPrecio,
  sugerirSlug,
  validarServicio,
} from '../admin/validacionServicio';
import { serviciosDeRespaldo } from '../data/servicios';
import { CATALOGO_RESPALDO, CATALOGO_VACIO, catalogoDeLaApi } from '../landing/catalogo-contexto';
import { actualizarServicio, crearServicio, listarServiciosPanel, ordenarServicios } from './admin';
import { ApiError } from './client';
import { crearEsquemaTurno } from './contract';
import { listarServiciosPublicos } from './servicios';

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

const publico = {
  id: 'pulido',
  nombre: 'Pulido',
  resumen: 'Saca rayas finas.',
  descripcion: 'Lavamos, descontaminamos y pulimos.',
  incluye: ['Clay bar'],
  glosario: [{ termino: 'Swirls', significado: 'marcas circulares finitas.' }],
  duracion: 'Alrededor de 1 día',
  precioDesde: 25000,
  destacado: false,
};
const panel = { ...publico, activo: true, orden: 10, updatedAt: '2026-10-22T15:00:00.000Z' };

/** fetch falso con una respuesta fija; guarda método, ruta, Content-Type y body de cada llamada. */
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catálogo público (landing)', () => {
  it('GET /api/servicios devuelve los servicios; una forma inesperada se rechaza', async () => {
    const llamadas = simular(() => json(200, { servicios: [publico] }));
    expect(await listarServiciosPublicos()).toEqual([publico]);
    expect(llamadas).toEqual([{ metodo: 'GET', ruta: '/api/servicios', tipo: null, body: undefined }]);

    simular(() => json(200, { servicios: [{ ...publico, precioDesde: '25000' }] }));
    const error = await listarServiciosPublicos().catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('INVALID_RESPONSE');
  });

  it('el respaldo (solo si la API falla) nunca tiene precios', () => {
    expect(catalogoDeLaApi([publico])).toEqual({ estado: 'api', servicios: [publico] });
    expect(CATALOGO_RESPALDO.servicios).toBe(serviciosDeRespaldo);
    expect(serviciosDeRespaldo.length).toBeGreaterThan(0);
    expect(serviciosDeRespaldo.every((s) => s.precioDesde === null)).toBe(true);
  });

  it('una lista vacía de la API NO usa el respaldo: el catálogo queda vacío (no hay turnos online)', () => {
    const catalogo = catalogoDeLaApi([]);
    expect(catalogo).toBe(CATALOGO_VACIO);
    expect(catalogo).toEqual({ estado: 'vacio', servicios: [] });
    // Con el catálogo vacío, ningún servicio pasa la validación del turno (ni los del respaldo).
    const ids = catalogo.servicios.map((s) => s.id);
    const turno = {
      nombre: 'Lucía',
      telefono: '380 412-3456',
      email: '',
      vehiculoTipo: 'auto',
      vehiculoModelo: '',
      servicioId: 'pulido',
      fechaPreferida: '2026-10-20',
      franja: 'manana',
      comentario: '',
      website: '',
    };
    expect(crearEsquemaTurno(new Date('2026-10-16T15:00:00.000Z'), ids).safeParse(turno).success).toBe(false);
  });

  it('el turno acepta solo servicios del catálogo que se muestra', () => {
    const turno = {
      nombre: 'Lucía',
      telefono: '380 412-3456',
      email: '',
      vehiculoTipo: 'auto',
      vehiculoModelo: '',
      servicioId: 'lavado-de-motor',
      fechaPreferida: '2026-10-20',
      franja: 'manana',
      comentario: '',
      website: '',
    };
    const ahora = new Date('2026-10-16T15:00:00.000Z');
    expect(crearEsquemaTurno(ahora, ['lavado-de-motor']).safeParse(turno).success).toBe(true);
    const r = crearEsquemaTurno(ahora, ['pulido']).safeParse(turno);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Elegí un servicio.');
    expect(crearEsquemaTurno(ahora).safeParse({ ...turno, servicioId: 'No Es Slug' }).success).toBe(false);
  });
});

describe('API del catálogo en el panel', () => {
  it('lista, crea (POST), edita (PATCH) y ordena (PUT) con JSON', async () => {
    let llamadas = simular(() => json(200, { servicios: [panel] }));
    expect(await listarServiciosPanel()).toEqual([panel]);
    expect(llamadas[0]?.ruta).toBe('/api/admin/servicios');

    llamadas = simular(() => json(201, { servicio: panel }));
    const nuevo = { ...publico, activo: true };
    expect(await crearServicio(nuevo)).toEqual(panel);
    expect(llamadas).toEqual([{ metodo: 'POST', ruta: '/api/admin/servicios', tipo: 'application/json', body: nuevo }]);

    llamadas = simular(() => json(200, { servicio: { ...panel, precioDesde: null } }));
    await actualizarServicio('pulido', { precioDesde: null });
    expect(llamadas).toEqual([
      { metodo: 'PATCH', ruta: '/api/admin/servicios/pulido', tipo: 'application/json', body: { precioDesde: null } },
    ]);

    llamadas = simular(() => json(200, { servicios: [panel] }));
    await ordenarServicios(['pulido']);
    expect(llamadas).toEqual([
      { metodo: 'PUT', ruta: '/api/admin/servicios/orden', tipo: 'application/json', body: { ids: ['pulido'] } },
    ]);
  });

  it('un 409 SERVICIO_EXISTE llega con su código; la respuesta del panel es estricta', async () => {
    simular(() => json(409, { error: { code: 'SERVICIO_EXISTE', message: 'Ya existe un servicio con ese id.' } }));
    const error = await crearServicio({ ...publico, activo: true }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('SERVICIO_EXISTE');

    simular(() => json(200, { servicios: [{ ...panel, extra: 1 }] }));
    const raro = await listarServiciosPanel().catch((e: unknown) => e);
    expect((raro as ApiError).code).toBe('INVALID_RESPONSE');
  });

  it('solo superadmin y admin editan el catálogo', () => {
    expect(puedeEditarCatalogo('superadmin')).toBe(true);
    expect(puedeEditarCatalogo('admin')).toBe(true);
    expect(puedeEditarCatalogo('empleado')).toBe(false);
  });

  it('al destacar uno, el anterior deja de estarlo; mover reordena sin perder elementos', () => {
    const a = { ...panel, id: 'a', destacado: true };
    const b = { ...panel, id: 'b' };
    expect(conServicio([a, b], { ...b, destacado: true }).map((s) => s.destacado)).toEqual([false, true]);
    expect(moverEnLista(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });

  it('desactivar el destacado: la respuesta del servidor (destacado: false) queda en la lista y el aviso lo cuenta', () => {
    const a = { ...panel, id: 'a', nombre: 'A', destacado: true };
    const b = { ...panel, id: 'b', nombre: 'B' };
    const lista = conServicio([a, b], { ...a, activo: false, destacado: false });
    expect(lista.map((s) => [s.id, s.activo, s.destacado])).toEqual([
      ['a', false, false],
      ['b', true, false],
    ]);
    expect(mensajeActivo(a)).toBe('A ya no se ve en la web y dejó de estar destacado.');
    expect(mensajeActivo(b)).toBe('B ya no se ve en la web.');
    expect(mensajeActivo({ ...b, activo: false })).toBe('B vuelve a verse en la web.');
  });
});

describe('formulario de servicio', () => {
  it('sugiere el slug desde el nombre, sin tildes ni ñ', () => {
    expect(sugerirSlug('  Lavado de Motor ')).toBe('lavado-de-motor');
    expect(sugerirSlug('Restauración de ópticas & faros')).toBe('restauracion-de-opticas-faros');
    expect(sugerirSlug('Señal ñandú')).toBe('senal-nandu');
    expect(sugerirSlug('x'.repeat(70))).toHaveLength(64);
  });

  it('lee el precio en pesos: vacío = null, puntos y $ se ignoran', () => {
    expect(leerPrecio('')).toBeNull();
    expect(leerPrecio('$ 25.000')).toBe(25000);
    expect(leerPrecio('25,50')).toBeUndefined();
  });

  it('valida con las reglas del contrato y usa las mismas claves que el backend', () => {
    const base = {
      ...formularioVacio(),
      id: 'lavado-de-motor',
      nombre: ' Lavado de motor ',
      resumen: 'Motor limpio.',
      descripcion: 'Desengrasamos.',
    };
    const ok = validarServicio({ ...base, duracion: '  ', precio: '' });
    expect(ok.ok && ok.datos).toMatchObject({ nombre: 'Lavado de motor', duracion: null, precioDesde: null, incluye: [], activo: true });

    const mal = validarServicio({
      ...base,
      id: 'Lavado Motor',
      nombre: ' ',
      incluye: ['Desengrase', ''],
      glosario: [{ termino: 'x'.repeat(61), significado: 'ok' }],
      precio: '100000000',
    });
    expect(mal.ok).toBe(false);
    if (mal.ok) return;
    expect(Object.keys(mal.errores).sort()).toEqual(['glosario.0.termino', 'id', 'incluye.1', 'nombre', 'precioDesde']);
    expect(mal.errores.nombre).toMatch(/nombre/);

    const demasiados = validarServicio({ ...base, incluye: Array.from({ length: 16 }, (_, i) => `Ítem ${String(i)}`) });
    expect(!demasiados.ok && demasiados.errores.incluye).toMatch(/15/);
  });

  it('no deja destacar un inactivo ni usar un id reservado (mismas reglas y textos que el backend)', () => {
    const base = { ...formularioVacio(), id: 'lavado-de-motor', nombre: 'Lavado de motor', resumen: 'R.', descripcion: 'D.' };
    const inactivo = validarServicio({ ...base, activo: false, destacado: true });
    expect(inactivo.ok).toBe(false);
    expect(!inactivo.ok && inactivo.errores).toEqual({ destacado: MENSAJE_DESTACADO_INACTIVO });
    expect(MENSAJE_DESTACADO_INACTIVO).toBe('No se puede destacar un servicio inactivo. Activalo primero.');
    expect(validarServicio({ ...base, activo: false, destacado: false }).ok).toBe(true);
    expect(validarServicio({ ...base, activo: true, destacado: true }).ok).toBe(true);

    const reservado = validarServicio({ ...base, id: 'orden' });
    expect(!reservado.ok && Object.keys(reservado.errores)).toEqual(['id']);
  });

  it('como el backend: solo la descripción admite saltos de línea (resumen y significado son <textarea> de una línea)', () => {
    const base = { ...formularioVacio(), id: 'lavado-de-motor', nombre: 'Lavado de motor', resumen: 'R.', descripcion: 'D.' };
    expect(validarServicio({ ...base, descripcion: 'Paso 1\n\tPaso 2' }).ok).toBe(true);

    const mal = validarServicio({
      ...base,
      resumen: 'Línea 1\nLínea 2',
      glosario: [{ termino: 'Clay', significado: 'una arcilla\nespecial' }],
      incluye: [`a${String.fromCharCode(7)}b`],
      descripcion: `a${String.fromCharCode(0)}b`,
    });
    expect(!mal.ok && Object.keys(mal.errores).sort()).toEqual(['descripcion', 'glosario.0.significado', 'incluye.0', 'resumen']);
    expect(!mal.ok && mal.errores.resumen).toMatch(/una sola línea/);
  });

  it('al editar, solo manda lo que cambió', () => {
    const resultado = validarServicio({ ...formularioDesde(panel), precio: '30.000', incluye: ['Clay bar', 'Pulido'] });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(cambiosDe(panel, resultado.datos)).toEqual({ precioDesde: 30000, incluye: ['Clay bar', 'Pulido'] });
    const igual = validarServicio(formularioDesde(panel));
    expect(igual.ok && cambiosDe(panel, igual.datos)).toEqual({});
  });
});
