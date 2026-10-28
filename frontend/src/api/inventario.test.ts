import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import {
  CODIGO_STOCK_INSUFICIENTE,
  actualizarInsumo,
  crearInsumo,
  listarInsumos,
  listarMovimientos,
  registrarMovimiento,
} from './inventario';

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

const insumo = {
  id: 'i1',
  nombre: 'Shampoo neutro',
  categoria: 'Lavado',
  unidad: 'litro',
  stock: 4.5,
  stockMinimo: 2,
  costoUnitario: 3500,
  activo: true,
  bajoStock: false,
  valorEnStock: 15750,
  updatedAt: '2026-10-27T15:00:00.000Z',
};
/** Lo que ve el empleado: sin un solo importe. */
const insumoEmpleado = { ...insumo, costoUnitario: null, valorEnStock: null };
const movimiento = {
  id: 'm1',
  tipo: 'uso',
  cantidad: -0.5,
  costoTotal: null,
  proveedor: null,
  nota: 'Pulido Corsa',
  persona: { id: 'u1', nombre: 'Lucas' },
  turnoId: null,
  createdAt: '2026-10-27T15:05:00.000Z',
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api/inventario', () => {
  it('lista con filtros y valida la forma', async () => {
    const llamadas = simular(() => json(200, { insumos: [insumo], total: 1, bajoStock: 0, valorTotal: 15750 }));
    const r = await listarInsumos({ q: 'shampoo', bajoStock: true, activo: 'todos', limit: 50, offset: 0 });
    expect(r.insumos[0]?.nombre).toBe('Shampoo neutro');
    expect(r.valorTotal).toBe(15750);
    expect(llamadas[0]?.ruta).toBe('/api/admin/insumos?limit=50&offset=0&q=shampoo&bajoStock=true&activo=todos');
  });

  it('por defecto no manda activo (el backend lista los activos)', async () => {
    const llamadas = simular(() => json(200, { insumos: [], total: 0, bajoStock: 0, valorTotal: 0 }));
    await listarInsumos({ activo: 'true', limit: 50, offset: 50 });
    expect(llamadas[0]?.ruta).toBe('/api/admin/insumos?limit=50&offset=50');
  });

  it('el empleado recibe null en todos los importes y se acepta tal cual', async () => {
    simular(() => json(200, { insumos: [insumoEmpleado], total: 1, bajoStock: 0, valorTotal: null }));
    const r = await listarInsumos({ limit: 50, offset: 0 });
    expect(r.valorTotal).toBeNull();
    expect(r.insumos[0]?.costoUnitario).toBeNull();
    expect(r.insumos[0]?.valorEnStock).toBeNull();
  });

  it('rechaza campos de más, unidades desconocidas y stock negativo', async () => {
    simular(() => json(200, { insumos: [{ ...insumo, extra: 1 }], total: 1, bajoStock: 0, valorTotal: 0 }));
    await expect(listarInsumos({ limit: 50, offset: 0 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    simular(() => json(200, { insumos: [{ ...insumo, unidad: 'galon' }], total: 1, bajoStock: 0, valorTotal: 0 }));
    await expect(listarInsumos({ limit: 50, offset: 0 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    simular(() => json(200, { insumos: [{ ...insumo, stock: -1 }], total: 1, bajoStock: 0, valorTotal: 0 }));
    await expect(listarInsumos({ limit: 50, offset: 0 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('crear manda JSON con Content-Type y un nombre repetido vuelve como 409 con fields.nombre', async () => {
    const llamadas = simular(() => json(201, { insumo }));
    const creado = await crearInsumo({ nombre: 'Shampoo neutro', unidad: 'litro', stockInicial: 4.5, stockMinimo: 2 });
    expect(creado.id).toBe('i1');
    expect(llamadas[0]).toMatchObject({
      metodo: 'POST',
      ruta: '/api/admin/insumos',
      tipo: 'application/json',
      body: { nombre: 'Shampoo neutro', unidad: 'litro', stockInicial: 4.5, stockMinimo: 2 },
    });

    simular(() =>
      json(409, { error: { code: 'CONFLICT', message: 'Ya hay un insumo con ese nombre.', fields: { nombre: 'Ya existe un insumo activo con ese nombre.' } } }),
    );
    const falla = await crearInsumo({ nombre: 'Shampoo neutro', unidad: 'litro' }).catch((e: unknown) => e);
    expect(falla).toBeInstanceOf(ApiError);
    expect(falla).toMatchObject({ status: 409, fields: { nombre: 'Ya existe un insumo activo con ese nombre.' } });
  });

  it('editar y desactivar van por PATCH', async () => {
    const llamadas = simular(() => json(200, { insumo: { ...insumo, activo: false } }));
    const r = await actualizarInsumo('i1', { activo: false });
    expect(r.activo).toBe(false);
    expect(llamadas[0]).toMatchObject({ metodo: 'PATCH', ruta: '/api/admin/insumos/i1', body: { activo: false } });
  });

  it('historial: paginado y con el costo en null para el empleado', async () => {
    const llamadas = simular(() => json(200, { movimientos: [movimiento], total: 1 }));
    const r = await listarMovimientos('i1', { limit: 20, offset: 0 });
    expect(r.movimientos[0]?.cantidad).toBe(-0.5);
    expect(llamadas[0]?.ruta).toBe('/api/admin/insumos/i1/movimientos?limit=20&offset=0');
  });

  it('registra un uso, una compra y un ajuste con el cuerpo de cada uno', async () => {
    const llamadas = simular(() => json(201, { insumo, movimiento }));
    await registrarMovimiento('i1', { tipo: 'uso', cantidad: 0.5 });
    await registrarMovimiento('i1', { tipo: 'compra', cantidad: 5, costoTotal: 12500, proveedor: 'Sur' });
    await registrarMovimiento('i1', { tipo: 'ajuste', stockReal: 3 });
    expect(llamadas.map((l) => l.body)).toEqual([
      { tipo: 'uso', cantidad: 0.5 },
      { tipo: 'compra', cantidad: 5, costoTotal: 12500, proveedor: 'Sur' },
      { tipo: 'ajuste', stockReal: 3 },
    ]);
    expect(llamadas.every((l) => l.ruta === '/api/admin/insumos/i1/movimientos' && l.tipo === 'application/json')).toBe(true);
  });

  it('un ajuste sin diferencia devuelve el insumo sin movimiento', async () => {
    simular(() => json(200, { insumo }));
    const r = await registrarMovimiento('i1', { tipo: 'ajuste', stockReal: 4.5 });
    expect(r.movimiento).toBeNull();
    simular(() => json(200, { insumo, movimiento: null }));
    expect((await registrarMovimiento('i1', { tipo: 'ajuste', stockReal: 4.5 })).movimiento).toBeNull();
  });

  it('409 STOCK_INSUFICIENTE trae el campo cantidad', async () => {
    simular(() =>
      json(409, { error: { code: CODIGO_STOCK_INSUFICIENTE, message: 'No alcanza el stock.', fields: { cantidad: 'Solo quedan 0,3 litros.' } } }),
    );
    const falla = await registrarMovimiento('i1', { tipo: 'uso', cantidad: 2 }).catch((e: unknown) => e);
    expect(falla).toMatchObject({ status: 409, code: CODIGO_STOCK_INSUFICIENTE, fields: { cantidad: 'Solo quedan 0,3 litros.' } });
  });
});
