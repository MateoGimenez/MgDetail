import { request } from './client';
import { catalogoPublicoSchema, type ServicioPublico } from './contract';

/**
 * GET /api/servicios (público) → solo los servicios activos, ya ordenados por el backend.
 * La landing lo usa a través de CatalogoProvider, que cae al respaldo de src/data/servicios.ts si esto falla.
 */
export async function listarServiciosPublicos(signal?: AbortSignal): Promise<ServicioPublico[]> {
  const { servicios } = await request('/servicios', { signal, schema: catalogoPublicoSchema });
  return servicios;
}
