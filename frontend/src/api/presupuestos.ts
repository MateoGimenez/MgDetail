import * as z from 'zod/mini';
import { ESTADOS_PRESUPUESTO, type EstadoPresupuesto } from '../lib/presupuestos';
import { requestAdmin } from './sesion';

/**
 * Presupuestos (reportes/2026-10-27_17_finanzas-inventario-documentos.md), admin y superadmin. NO son facturas.
 *
 * - GET    /api/admin/presupuestos?estado=&q=&limit=&offset=
 * - POST   /api/admin/presupuestos
 * - PATCH  /api/admin/presupuestos/:id        (`items` se reemplaza entero; `estado` cambia libremente)
 * - DELETE /api/admin/presupuestos/:id        409 PRESUPUESTO_ACEPTADO si está aceptado
 * El PDF (GET /:id/pdf) se baja con api/pdf.ts.
 */

const entero = z.int().check(z.gte(0));

export const itemPresupuestoSchema = z.strictObject({
  descripcion: z.string(),
  cantidad: z.number().check(z.gt(0)),
  precioUnitario: entero,
});

export const presupuestoSchema = z.strictObject({
  id: z.string(),
  numero: z.int(),
  codigo: z.string(),
  clienteNombre: z.string(),
  clienteTelefono: z.nullable(z.string()),
  vehiculo: z.nullable(z.string()),
  items: z.array(itemPresupuestoSchema),
  descuento: entero,
  subtotal: entero,
  total: entero,
  validezDias: z.int(),
  venceEl: z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/)),
  estado: z.enum(ESTADOS_PRESUPUESTO),
  vencido: z.boolean(),
  notas: z.nullable(z.string()),
  turnoId: z.nullable(z.string()),
  creadoPor: z.nullable(z.strictObject({ id: z.string(), nombre: z.string() })),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Presupuesto = z.output<typeof presupuestoSchema>;

export const listaDePresupuestosSchema = z.strictObject({
  presupuestos: z.array(presupuestoSchema),
  total: entero,
});
export type ListaDePresupuestos = z.output<typeof listaDePresupuestosSchema>;

const respuestaPresupuestoSchema = z.strictObject({ presupuesto: presupuestoSchema });

export interface FiltroPresupuestos {
  estado?: EstadoPresupuesto;
  q?: string;
  limit: number;
  offset: number;
}

export async function listarPresupuestos(
  { estado, q, limit, offset }: FiltroPresupuestos,
  signal?: AbortSignal,
): Promise<ListaDePresupuestos> {
  const parametros = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (estado) parametros.set('estado', estado);
  if (q) parametros.set('q', q);
  return requestAdmin(`/admin/presupuestos?${parametros.toString()}`, { signal, schema: listaDePresupuestosSchema });
}

export interface NuevoPresupuesto {
  clienteNombre: string;
  clienteTelefono?: string;
  vehiculo?: string;
  items: { descripcion: string; cantidad: number; precioUnitario: number }[];
  descuento?: number;
  validezDias?: number;
  notas?: string;
  turnoId?: string;
}

export async function crearPresupuesto(datos: NuevoPresupuesto): Promise<Presupuesto> {
  const { presupuesto } = await requestAdmin('/admin/presupuestos', {
    method: 'POST',
    body: datos,
    schema: respuestaPresupuestoSchema,
  });
  return presupuesto;
}

export async function actualizarPresupuesto(id: string, cambios: Record<string, unknown>): Promise<Presupuesto> {
  const { presupuesto } = await requestAdmin(`/admin/presupuestos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: cambios,
    schema: respuestaPresupuestoSchema,
  });
  return presupuesto;
}

export async function eliminarPresupuesto(id: string): Promise<void> {
  await requestAdmin(`/admin/presupuestos/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export const rutaPdfPresupuesto = (id: string): string => `/admin/presupuestos/${encodeURIComponent(id)}/pdf`;
