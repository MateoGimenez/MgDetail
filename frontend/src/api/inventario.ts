import * as z from 'zod/mini';
import { UNIDADES, TIPOS_MOVIMIENTO, type CuerpoMovimiento } from '../lib/inventario';
import { requestAdmin } from './sesion';

/**
 * Inventario (reportes/2026-10-27_17_finanzas-inventario-documentos.md). Esquemas estrictos: lo que el backend mande
 * de más o de menos se rechaza (INVALID_RESPONSE). El empleado recibe `null` en todo lo que sea plata
 * (`costoUnitario`, `valorEnStock`, `costoTotal`, `valorTotal`).
 *
 * - GET   /api/admin/insumos                      todos los roles
 * - POST  /api/admin/insumos                      admin y superadmin
 * - PATCH /api/admin/insumos/:id                  admin y superadmin
 * - GET   /api/admin/insumos/:id/movimientos      todos los roles
 * - POST  /api/admin/insumos/:id/movimientos      uso: todos; compra y ajuste: admin y superadmin
 */

const cantidad = z.number().check(z.gte(0));
const pesos = z.nullable(z.int().check(z.gte(0)));

export const insumoSchema = z.strictObject({
  id: z.string(),
  nombre: z.string(),
  categoria: z.nullable(z.string()),
  unidad: z.enum(UNIDADES),
  stock: cantidad,
  stockMinimo: cantidad,
  costoUnitario: pesos,
  activo: z.boolean(),
  bajoStock: z.boolean(),
  valorEnStock: pesos,
  updatedAt: z.string(),
});
export type Insumo = z.output<typeof insumoSchema>;

export const listaDeInsumosSchema = z.strictObject({
  insumos: z.array(insumoSchema),
  total: z.int().check(z.gte(0)),
  bajoStock: z.int().check(z.gte(0)),
  valorTotal: pesos,
});
export type ListaDeInsumos = z.output<typeof listaDeInsumosSchema>;

export const movimientoSchema = z.strictObject({
  id: z.string(),
  tipo: z.enum(TIPOS_MOVIMIENTO),
  /** Con signo: compra +, uso −, ajuste ±. */
  cantidad: z.number(),
  costoTotal: pesos,
  proveedor: z.nullable(z.string()),
  nota: z.nullable(z.string()),
  persona: z.nullable(z.strictObject({ id: z.string(), nombre: z.string() })),
  turnoId: z.nullable(z.string()),
  createdAt: z.string(),
});
export type Movimiento = z.output<typeof movimientoSchema>;

export const listaDeMovimientosSchema = z.strictObject({
  movimientos: z.array(movimientoSchema),
  total: z.int().check(z.gte(0)),
});
export type ListaDeMovimientos = z.output<typeof listaDeMovimientosSchema>;

const respuestaInsumoSchema = z.strictObject({ insumo: insumoSchema });
/** Un ajuste que no cambia nada devuelve el insumo sin movimiento. */
const respuestaMovimientoSchema = z.strictObject({
  insumo: insumoSchema,
  movimiento: z.optional(z.nullable(movimientoSchema)),
});

export type FiltroActivo = 'true' | 'false' | 'todos';

export interface FiltroInsumos {
  q?: string;
  bajoStock?: boolean;
  activo?: FiltroActivo;
  limit: number;
  offset: number;
}

export async function listarInsumos(
  { q, bajoStock, activo, limit, offset }: FiltroInsumos,
  signal?: AbortSignal,
): Promise<ListaDeInsumos> {
  const parametros = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) parametros.set('q', q);
  if (bajoStock) parametros.set('bajoStock', 'true');
  if (activo && activo !== 'true') parametros.set('activo', activo);
  return requestAdmin(`/admin/insumos?${parametros.toString()}`, { signal, schema: listaDeInsumosSchema });
}

export interface NuevoInsumo {
  nombre: string;
  categoria?: string;
  unidad: (typeof UNIDADES)[number];
  stockInicial?: number;
  stockMinimo?: number;
  costoUnitario?: number;
}

/** 409 con `fields.nombre` si ya hay un insumo activo con ese nombre. */
export async function crearInsumo(datos: NuevoInsumo): Promise<Insumo> {
  const { insumo } = await requestAdmin('/admin/insumos', { method: 'POST', body: datos, schema: respuestaInsumoSchema });
  return insumo;
}

export interface CambiosInsumo {
  nombre?: string;
  categoria?: string | null;
  unidad?: (typeof UNIDADES)[number];
  stockMinimo?: number;
  costoUnitario?: number | null;
  activo?: boolean;
}

export async function actualizarInsumo(id: string, cambios: CambiosInsumo): Promise<Insumo> {
  const { insumo } = await requestAdmin(`/admin/insumos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: cambios,
    schema: respuestaInsumoSchema,
  });
  return insumo;
}

export async function listarMovimientos(
  id: string,
  { limit, offset }: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<ListaDeMovimientos> {
  const parametros = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return requestAdmin(`/admin/insumos/${encodeURIComponent(id)}/movimientos?${parametros.toString()}`, {
    signal,
    schema: listaDeMovimientosSchema,
  });
}

/** 409 STOCK_INSUFICIENTE (con `fields.cantidad`) si el uso supera lo que queda. */
export async function registrarMovimiento(
  id: string,
  cuerpo: CuerpoMovimiento,
): Promise<{ insumo: Insumo; movimiento: Movimiento | null }> {
  const { insumo, movimiento } = await requestAdmin(`/admin/insumos/${encodeURIComponent(id)}/movimientos`, {
    method: 'POST',
    body: cuerpo,
    schema: respuestaMovimientoSchema,
  });
  return { insumo, movimiento: movimiento ?? null };
}

export const CODIGO_STOCK_INSUFICIENTE = 'STOCK_INSUFICIENTE';
