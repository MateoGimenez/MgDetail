import * as z from 'zod/mini';
import { FORMAS_DE_PAGO, type FormaDePago } from '../lib/comprobantes';
import { ApiError } from './client';
import { requestAdmin } from './sesion';

/**
 * Comprobantes de pago (reportes/2026-10-27_17_finanzas-inventario-documentos.md), admin y superadmin. NO son
 * facturas. Una "foto" del momento del cobro; un turno tiene a lo sumo uno.
 *
 * - POST /api/admin/bookings/:id/comprobante    idempotente: 201 si lo emite, 200 con el que ya existía
 * - GET  /api/admin/bookings/:id/comprobante    200 o 404 (todavía no se emitió)
 * El PDF (GET /api/admin/comprobantes/:id/pdf) se baja con api/pdf.ts.
 */

export const comprobanteSchema = z.strictObject({
  id: z.string(),
  numero: z.int(),
  codigo: z.string(),
  fechaEmision: z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/)),
  formaPago: z.enum(FORMAS_DE_PAGO),
  monto: z.int().check(z.gte(0)),
  clienteNombre: z.string(),
  servicioNombre: z.string(),
  vehiculo: z.nullable(z.string()),
  notas: z.nullable(z.string()),
});
export type Comprobante = z.output<typeof comprobanteSchema>;

const respuestaSchema = z.strictObject({ comprobante: comprobanteSchema });

export async function emitirComprobante(
  turnoId: string,
  datos: { formaPago: FormaDePago; notas?: string },
): Promise<Comprobante> {
  const { comprobante } = await requestAdmin(`/admin/bookings/${encodeURIComponent(turnoId)}/comprobante`, {
    method: 'POST',
    body: datos,
    schema: respuestaSchema,
  });
  return comprobante;
}

/** El comprobante ya emitido de un turno, o null si todavía no tiene (404). */
export async function buscarComprobante(turnoId: string, signal?: AbortSignal): Promise<Comprobante | null> {
  try {
    const { comprobante } = await requestAdmin(`/admin/bookings/${encodeURIComponent(turnoId)}/comprobante`, {
      signal,
      schema: respuestaSchema,
    });
    return comprobante;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export const rutaPdfComprobante = (id: string): string => `/admin/comprobantes/${encodeURIComponent(id)}/pdf`;
