import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import {
  borrarGasto,
  contarInsumosConStockBajo,
  crearGasto,
  editarGasto,
  fijarMeta,
  listarGastos,
  listarMetas,
  obtenerMetaActual,
  quitarMeta,
} from './finanzas';

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

interface Llamada {
  ruta: string;
  metodo: string;
  cuerpo: unknown;
}

function simular(respuesta: () => Response) {
  const llamadas: Llamada[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const ruta = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      llamadas.push({ ruta, metodo: init?.method ?? 'GET', cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      return Promise.resolve(respuesta());
    }),
  );
  return llamadas;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const gasto = {
  id: 'g1',
  fecha: '2026-10-20',
  categoria: 'alquiler',
  descripcion: 'Alquiler del galpón',
  monto: 150000,
  proveedor: null,
  origen: 'manual',
  creadoPor: { id: 'u1', nombre: 'Mateo' },
  createdAt: '2026-10-20T13:00:00.000Z',
  updatedAt: '2026-10-20T13:00:00.000Z',
};
const codigo = async (pedido: Promise<unknown>) => ((await pedido.catch((e: unknown) => e)) as ApiError).code;

describe('gastos', () => {
  it('lista con el filtro en la consulta y valida la respuesta', async () => {
    const llamadas = simular(() => json(200, { gastos: [gasto], total: 1, suma: 150000 }));
    const r = await listarGastos({ desde: '2026-10-01', hasta: '2026-10-27', categoria: 'alquiler', q: ' galpón ', offset: 50 });
    expect(r.suma).toBe(150000);
    expect(llamadas[0]?.ruta).toBe(
      '/api/admin/gastos?desde=2026-10-01&hasta=2026-10-27&categoria=alquiler&q=galp%C3%B3n&limit=50&offset=50',
    );
  });

  it('sin categoría ni búsqueda no manda esos parámetros', async () => {
    const llamadas = simular(() => json(200, { gastos: [], total: 0, suma: 0 }));
    await listarGastos({ desde: '2026-10-01', hasta: '2026-10-27', q: '  ' });
    expect(llamadas[0]?.ruta).toBe('/api/admin/gastos?desde=2026-10-01&hasta=2026-10-27&limit=50&offset=0');
  });

  it('rechaza lo que no cierra: campo de más, categoría rara, monto en cero, fecha inválida', async () => {
    simular(() => json(200, { gastos: [{ ...gasto, extra: 1 }], total: 1, suma: 1 }));
    expect(await codigo(listarGastos({ desde: '2026-10-01', hasta: '2026-10-27' }))).toBe('INVALID_RESPONSE');
    simular(() => json(200, { gastos: [{ ...gasto, categoria: 'rara' }], total: 1, suma: 1 }));
    expect(await codigo(listarGastos({ desde: '2026-10-01', hasta: '2026-10-27' }))).toBe('INVALID_RESPONSE');
    simular(() => json(200, { gastos: [{ ...gasto, monto: 0 }], total: 1, suma: 0 }));
    expect(await codigo(listarGastos({ desde: '2026-10-01', hasta: '2026-10-27' }))).toBe('INVALID_RESPONSE');
    simular(() => json(200, { gastos: [{ ...gasto, fecha: '2026-02-30' }], total: 1, suma: 1 }));
    expect(await codigo(listarGastos({ desde: '2026-10-01', hasta: '2026-10-27' }))).toBe('INVALID_RESPONSE');
  });

  it('crear, editar y borrar usan POST, PATCH y DELETE', async () => {
    const llamadas = simular(() => json(201, { gasto }));
    const creado = await crearGasto({ fecha: '2026-10-20', categoria: 'alquiler', descripcion: 'Alquiler del galpón', monto: 150000 });
    expect(creado.id).toBe('g1');
    expect(llamadas[0]).toMatchObject({ ruta: '/api/admin/gastos', metodo: 'POST' });

    simular(() => json(200, { gasto }));
    const editado = await editarGasto('g 1', { monto: 160000 });
    expect(editado.monto).toBe(150000);

    const borrados = simular(() => new Response(null, { status: 204 }));
    await borrarGasto('g1');
    expect(borrados[0]).toMatchObject({ ruta: '/api/admin/gastos/g1', metodo: 'DELETE' });
  });

  it('400 con fields.* llega como ApiError con sus campos', async () => {
    simular(() => json(400, { error: { code: 'VALIDATION_ERROR', message: 'Revisá los datos.', fields: { fecha: 'No puede ser futura.' } } }));
    const error = (await crearGasto({ fecha: '2030-01-01', categoria: 'otros', descripcion: 'x', monto: 1 }).catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(400);
    expect(error.fields).toEqual({ fecha: 'No puede ser futura.' });
  });

  it('409 GASTO_DE_INVENTARIO llega con su código y su mensaje', async () => {
    simular(() =>
      json(409, { error: { code: 'GASTO_DE_INVENTARIO', message: 'Este gasto viene de una compra de inventario: corregilo desde Inventario.' } }),
    );
    const error = (await editarGasto('g1', { monto: 5 }).catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 409, code: 'GASTO_DE_INVENTARIO' });
    expect(error.message).toMatch(/Inventario/);
    simular(() => json(409, { error: { code: 'GASTO_DE_INVENTARIO', message: 'Este gasto viene de una compra de inventario: corregilo desde Inventario.' } }));
    expect(await codigo(borrarGasto('g1'))).toBe('GASTO_DE_INVENTARIO');
  });

  it('403 del empleado llega como FORBIDDEN', async () => {
    simular(() => json(403, { error: { code: 'FORBIDDEN', message: 'No tenés permiso para hacer esto.' } }));
    expect(await codigo(listarGastos({ desde: '2026-10-01', hasta: '2026-10-27' }))).toBe('FORBIDDEN');
  });
});

const metaActual = {
  mes: '2026-10',
  meta: { ingresosObjetivo: 1500000, trabajosObjetivo: 40 },
  progreso: {
    ingresos: 1096000,
    trabajos: 32,
    porcentajeIngresos: 0.7307,
    porcentajeTrabajos: 0.8,
    diasDeAtencionTranscurridos: 20,
    diasDeAtencionRestantes: 5,
    diasDeAtencionTotales: 25,
    proyeccionIngresos: 1370000,
    necesarioPorDia: 80800,
    estado: 'en-ritmo',
  },
};

describe('metas', () => {
  it('la meta de este mes', async () => {
    const llamadas = simular(() => json(200, metaActual));
    const r = await obtenerMetaActual();
    expect(r.progreso.estado).toBe('en-ritmo');
    expect(llamadas[0]?.ruta).toBe('/api/admin/metas/actual');
  });

  it('sin meta: meta null, porcentajes y proyección en null', async () => {
    simular(() =>
      json(200, {
        ...metaActual,
        meta: null,
        progreso: { ...metaActual.progreso, estado: 'sin-meta', porcentajeIngresos: null, porcentajeTrabajos: null, proyeccionIngresos: null, necesarioPorDia: null },
      }),
    );
    const r = await obtenerMetaActual();
    expect(r.meta).toBeNull();
    expect(r.progreso.estado).toBe('sin-meta');
  });

  it('rechaza un estado desconocido o un campo de más', async () => {
    simular(() => json(200, { ...metaActual, progreso: { ...metaActual.progreso, estado: 'raro' } }));
    expect(await codigo(obtenerMetaActual())).toBe('INVALID_RESPONSE');
    simular(() => json(200, { ...metaActual, extra: true }));
    expect(await codigo(obtenerMetaActual())).toBe('INVALID_RESPONSE');
    simular(() => json(200, { ...metaActual, mes: '2026-13' }));
    expect(await codigo(obtenerMetaActual())).toBe('INVALID_RESPONSE');
  });

  it('las metas de un año', async () => {
    const fila = { mes: '2026-09', ingresosObjetivo: 1000000, trabajosObjetivo: null, ingresos: 1200000, trabajos: 30, cumplida: true };
    const llamadas = simular(() => json(200, { metas: [fila] }));
    expect(await listarMetas(2026)).toEqual([fila]);
    expect(llamadas[0]?.ruta).toBe('/api/admin/metas?anio=2026');
    simular(() => json(200, { metas: [{ ...fila, cumplida: 'si' }] }));
    expect(await codigo(listarMetas(2026))).toBe('INVALID_RESPONSE');
  });

  it('fijar manda los dos objetivos con PUT y quitar usa DELETE', async () => {
    const llamadas = simular(() => json(200, { meta: { mes: '2026-10', ingresosObjetivo: 1500000, trabajosObjetivo: null } }));
    const r = await fijarMeta('2026-10', { ingresosObjetivo: 1500000, trabajosObjetivo: null });
    expect(r).toEqual({ ingresosObjetivo: 1500000, trabajosObjetivo: null });
    expect(llamadas[0]).toMatchObject({
      ruta: '/api/admin/metas/2026-10',
      metodo: 'PUT',
      cuerpo: { ingresosObjetivo: 1500000, trabajosObjetivo: null },
    });
    const borradas = simular(() => new Response(null, { status: 204 }));
    await quitarMeta('2026-10');
    expect(borradas[0]).toMatchObject({ ruta: '/api/admin/metas/2026-10', metodo: 'DELETE' });
  });

  it('un 400 de la meta trae sus campos', async () => {
    simular(() => json(400, { error: { code: 'VALIDATION_ERROR', message: 'Revisá.', fields: { ingresosObjetivo: 'Muy alto.' } } }));
    const error = (await fijarMeta('2026-10', { ingresosObjetivo: 5, trabajosObjetivo: null }).catch((e: unknown) => e)) as ApiError;
    expect(error.fields).toEqual({ ingresosObjetivo: 'Muy alto.' });
  });
});

describe('aviso de stock bajo', () => {
  it('lee solo bajoStock y no se queja de lo demás', async () => {
    const llamadas = simular(() => json(200, { insumos: [{ nombre: 'Cera', costoUnitario: 5 }], total: 9, bajoStock: 3, valorTotal: 1000 }));
    expect(await contarInsumosConStockBajo()).toBe(3);
    expect(llamadas[0]?.ruta).toBe('/api/admin/insumos?bajoStock=true&limit=1');
  });

  it('sin bajoStock numérico rechaza', async () => {
    simular(() => json(200, { insumos: [], total: 0 }));
    expect(await codigo(contarInsumosConStockBajo())).toBe('INVALID_RESPONSE');
  });
});
