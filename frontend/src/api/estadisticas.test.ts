import { afterEach, describe, expect, it, vi } from 'vitest';
import { MUESTRA } from '../lib/muestraEstadisticas';
import { ApiError } from './client';
import { obtenerEstadisticas, obtenerMisTrabajos } from './estadisticas';

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

function simular(respuesta: () => Response) {
  const rutas: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL) => {
      rutas.push(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
      return Promise.resolve(respuesta());
    }),
  );
  return rutas;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const rango = { desde: '2026-10-01', hasta: '2026-10-03' };
const codigo = async (pedido: Promise<unknown>) => ((await pedido.catch((e: unknown) => e)) as ApiError).code;

describe('estadísticas del panel', () => {
  it('pide el rango y valida la respuesta completa', async () => {
    const rutas = simular(() => json(200, MUESTRA));
    expect(await obtenerEstadisticas(rango)).toEqual(MUESTRA);
    expect(rutas).toEqual(['/api/admin/estadisticas?desde=2026-10-01&hasta=2026-10-03']);
  });

  it('rechaza campos de más, faltantes o con tipo equivocado', async () => {
    simular(() => json(200, { ...MUESTRA, extra: 1 }));
    expect(await codigo(obtenerEstadisticas(rango))).toBe('INVALID_RESPONSE');

    const sinPeriodo: Record<string, unknown> = { ...MUESTRA };
    delete sinPeriodo.periodo;
    simular(() => json(200, sinPeriodo));
    expect(await codigo(obtenerEstadisticas(rango))).toBe('INVALID_RESPONSE');

    simular(() => json(200, { ...MUESTRA, serie: [{ clave: 'ayer', completados: 1, ingresos: 5 }] }));
    expect(await codigo(obtenerEstadisticas(rango))).toBe('INVALID_RESPONSE');

    simular(() => json(200, { ...MUESTRA, porDiaSemana: [{ dia: 7, manana: 1, tarde: 1 }] }));
    expect(await codigo(obtenerEstadisticas(rango))).toBe('INVALID_RESPONSE');
  });

  it('un 400 con campos llega como ApiError', async () => {
    simular(() => json(400, { error: { code: 'VALIDATION', message: 'Rango inválido', fields: { hasta: 'Muy largo' } } }));
    const error = (await obtenerEstadisticas(rango).catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(400);
    expect(error.fields).toEqual({ hasta: 'Muy largo' });
  });

  it('Mis trabajos: sin importes, y rechaza si el backend los mandara', async () => {
    const mias = {
      rango,
      completados: 2,
      porServicio: [{ servicioId: 'lavado', nombre: 'Lavado', completados: 2 }],
      serie: [{ clave: '2026-10-01', completados: 2 }],
    };
    const rutas = simular(() => json(200, mias));
    expect(await obtenerMisTrabajos(rango)).toEqual(mias);
    expect(rutas).toEqual(['/api/admin/estadisticas/mias?desde=2026-10-01&hasta=2026-10-03']);

    simular(() => json(200, { ...mias, porServicio: [{ ...mias.porServicio[0], ingresos: 5 }] }));
    expect(await codigo(obtenerMisTrabajos(rango))).toBe('INVALID_RESPONSE');
  });
});
