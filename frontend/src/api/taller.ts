import * as z from 'zod/mini';
import type { DatosTaller } from '../lib/taller';
import { requestAdmin } from './sesion';

/**
 * Datos del taller que salen en los PDF (reportes/2026-10-27_17_finanzas-inventario-documentos.md), admin y
 * superadmin. Los opcionales pueden ser null; el PUT lleva siempre los seis campos (null para vaciar).
 */

export const tallerSchema = z.strictObject({
  nombre: z.string(),
  telefono: z.nullable(z.string()),
  direccion: z.nullable(z.string()),
  instagram: z.nullable(z.string()),
  cuit: z.nullable(z.string()),
  leyendaPdf: z.nullable(z.string()),
});

const respuestaTallerSchema = z.strictObject({ taller: tallerSchema });

export async function obtenerTaller(signal?: AbortSignal): Promise<DatosTaller> {
  const { taller } = await requestAdmin('/admin/taller', { signal, schema: respuestaTallerSchema });
  return taller;
}

export async function guardarTaller(datos: DatosTaller): Promise<DatosTaller> {
  const { taller } = await requestAdmin('/admin/taller', { method: 'PUT', body: datos, schema: respuestaTallerSchema });
  return taller;
}
