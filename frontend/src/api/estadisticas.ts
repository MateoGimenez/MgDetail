import * as z from 'zod/mini';
import { esFechaValida } from '../lib/fechas';
import { requestAdmin } from './sesion';

/**
 * Estadísticas del panel (reportes/2026-10-26_15_estadisticas-y-permisos.md). Tipos y esquemas estrictos: si el
 * backend manda algo distinto de lo pactado, el panel lo rechaza (INVALID_RESPONSE) en vez de mostrar números dudosos.
 *
 * - GET /api/admin/estadisticas?desde&hasta         admin y superadmin (con importes)
 * - GET /api/admin/estadisticas/mias?desde&hasta    todos los roles (solo cantidades, solo lo que hizo esa persona)
 */

const entero = z.int().check(z.gte(0));
const fecha = z.string().check(z.refine(esFechaValida, 'Fecha inválida.'));
/** `YYYY-MM-DD` (por día) o `YYYY-MM` (por mes). */
const claveDeSerie = z.string().check(z.regex(/^\d{4}-\d{2}(-\d{2})?$/));

export const GRANULARIDADES = ['dia', 'mes'] as const;
export type Granularidad = (typeof GRANULARIDADES)[number];

const rangoSchema = z.strictObject({ desde: fecha, hasta: fecha });

const montosSchema = z.strictObject({ completados: entero, ingresos: entero });
const comparacionSchema = z.strictObject({ actual: montosSchema, anterior: montosSchema });

const periodoSchema = z.strictObject({
  turnos: entero,
  pedidos: entero,
  pendientes: entero,
  confirmados: entero,
  completados: entero,
  cancelados: entero,
  ingresos: entero,
  ticketPromedio: z.nullable(z.number()),
  completadosSinMonto: entero,
  tasaCancelacion: z.nullable(z.number()),
});

export const estadisticasSchema = z.strictObject({
  rango: rangoSchema,
  granularidad: z.enum(GRANULARIDADES),
  resumen: z.strictObject({ hoy: comparacionSchema, mes: comparacionSchema, anio: comparacionSchema }),
  periodo: periodoSchema,
  serie: z.array(z.strictObject({ clave: claveDeSerie, completados: entero, ingresos: entero })),
  porServicio: z.array(
    z.strictObject({ servicioId: z.string(), nombre: z.string(), pedidos: entero, completados: entero, ingresos: entero }),
  ),
  porTrabajador: z.array(
    z.strictObject({ id: z.nullable(z.string()), nombre: z.string(), completados: entero, ingresos: entero }),
  ),
  porDiaSemana: z.array(
    z.strictObject({ dia: z.int().check(z.gte(0), z.lte(6)), manana: entero, tarde: entero }),
  ),
  completadosSinTrabajador: entero,
});

export const misTrabajosSchema = z.strictObject({
  rango: rangoSchema,
  completados: entero,
  porServicio: z.array(z.strictObject({ servicioId: z.string(), nombre: z.string(), completados: entero })),
  serie: z.array(z.strictObject({ clave: claveDeSerie, completados: entero })),
});

export type Estadisticas = z.infer<typeof estadisticasSchema>;
export type MisTrabajos = z.infer<typeof misTrabajosSchema>;
export type Comparacion = Estadisticas['resumen']['hoy'];
export type PeriodoEstadisticas = Estadisticas['periodo'];
export type PuntoDeSerie = Estadisticas['serie'][number];
export type FilaServicio = Estadisticas['porServicio'][number];
export type FilaTrabajador = Estadisticas['porTrabajador'][number];
export type FilaDiaSemana = Estadisticas['porDiaSemana'][number];
export type RangoPedido = z.infer<typeof rangoSchema>;

const consulta = (rango: RangoPedido) => new URLSearchParams({ desde: rango.desde, hasta: rango.hasta }).toString();

/** Estadísticas completas del rango (admin y superadmin). */
export function obtenerEstadisticas(rango: RangoPedido, signal?: AbortSignal): Promise<Estadisticas> {
  return requestAdmin(`/admin/estadisticas?${consulta(rango)}`, { signal, schema: estadisticasSchema });
}

/** Los trabajos que completó quien está conectado, sin importes (todos los roles). */
export function obtenerMisTrabajos(rango: RangoPedido, signal?: AbortSignal): Promise<MisTrabajos> {
  return requestAdmin(`/admin/estadisticas/mias?${consulta(rango)}`, { signal, schema: misTrabajosSchema });
}
