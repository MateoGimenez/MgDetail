import * as z from 'zod/mini';
import { CATEGORIAS } from '../lib/finanzas';
import { esFechaValida } from '../lib/fechas';
import { requestAdmin } from './sesion';

/**
 * Finanzas del panel (reportes/2026-10-27_17_finanzas-inventario-documentos.md): gastos, metas mensuales y el aviso
 * de insumos con stock bajo de Hoy. Solo admin y superadmin (el empleado recibe 403), salvo el aviso de stock bajo
 * que ven todos. Tipos y esquemas estrictos: si el backend manda algo distinto de lo pactado, el panel lo rechaza
 * (INVALID_RESPONSE) en vez de mostrar números dudosos.
 *
 * - GET    /api/admin/gastos?desde&hasta&categoria&q&limit&offset
 * - POST   /api/admin/gastos          PATCH /api/admin/gastos/:id          DELETE /api/admin/gastos/:id
 * - GET    /api/admin/metas/actual    GET /api/admin/metas?anio=YYYY
 * - PUT    /api/admin/metas/:mes      DELETE /api/admin/metas/:mes
 * - GET    /api/admin/insumos?bajoStock=true&limit=1   (solo se lee `bajoStock`)
 */

/** Código del 409 cuando se intenta editar o borrar un gasto que viene de una compra de inventario. */
export const CODIGO_GASTO_DE_INVENTARIO = 'GASTO_DE_INVENTARIO';

const entero = z.int().check(z.gte(0));
const fecha = z.string().check(z.refine(esFechaValida, 'Fecha inválida.'));
const mes = z.string().check(z.regex(/^\d{4}-(0[1-9]|1[0-2])$/));

export const ORIGENES = ['manual', 'inventario'] as const;

export const gastoSchema = z.strictObject({
  id: z.string(),
  fecha,
  categoria: z.enum(CATEGORIAS),
  descripcion: z.string(),
  monto: z.int().check(z.gte(1)),
  proveedor: z.nullable(z.string()),
  origen: z.enum(ORIGENES),
  creadoPor: z.nullable(z.strictObject({ id: z.string(), nombre: z.string() })),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const listaDeGastosSchema = z.strictObject({ gastos: z.array(gastoSchema), total: entero, suma: entero });
const unGastoSchema = z.strictObject({ gasto: gastoSchema });

export type Gasto = z.infer<typeof gastoSchema>;
export type ListaDeGastos = z.infer<typeof listaDeGastosSchema>;

export const POR_PAGINA_GASTOS = 50;

export interface FiltroGastos {
  desde: string;
  hasta: string;
  categoria?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface NuevoGasto {
  fecha: string;
  categoria: string;
  descripcion: string;
  monto: number;
  proveedor?: string | null;
}

export type CambiosGasto = Partial<NuevoGasto>;

/** Los gastos del filtro (por defecto, 50 por página, fecha descendente). `suma` es de todo el filtro, no de la página. */
export function listarGastos(filtro: FiltroGastos, signal?: AbortSignal): Promise<ListaDeGastos> {
  const consulta = new URLSearchParams({ desde: filtro.desde, hasta: filtro.hasta });
  if (filtro.categoria) consulta.set('categoria', filtro.categoria);
  const q = filtro.q?.trim();
  if (q) consulta.set('q', q);
  consulta.set('limit', String(filtro.limit ?? POR_PAGINA_GASTOS));
  consulta.set('offset', String(filtro.offset ?? 0));
  return requestAdmin(`/admin/gastos?${consulta.toString()}`, { signal, schema: listaDeGastosSchema });
}

export async function crearGasto(datos: NuevoGasto): Promise<Gasto> {
  const { gasto } = await requestAdmin('/admin/gastos', { method: 'POST', body: datos, schema: unGastoSchema });
  return gasto;
}

/** Cambia solo los campos que se mandan. Un gasto de inventario responde 409 GASTO_DE_INVENTARIO. */
export async function editarGasto(id: string, cambios: CambiosGasto): Promise<Gasto> {
  const { gasto } = await requestAdmin(`/admin/gastos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: cambios,
    schema: unGastoSchema,
  });
  return gasto;
}

export async function borrarGasto(id: string): Promise<void> {
  await requestAdmin(`/admin/gastos/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ---------- Metas ---------- */

export const ESTADOS_DE_META = ['sin-meta', 'cumplida', 'adelantado', 'en-ritmo', 'atrasado'] as const;

const objetivosSchema = z.strictObject({
  ingresosObjetivo: z.nullable(z.int().check(z.gte(1))),
  trabajosObjetivo: z.nullable(z.int().check(z.gte(1))),
});

const progresoSchema = z.strictObject({
  ingresos: entero,
  trabajos: entero,
  porcentajeIngresos: z.nullable(z.number().check(z.gte(0))),
  porcentajeTrabajos: z.nullable(z.number().check(z.gte(0))),
  diasDeAtencionTranscurridos: entero,
  diasDeAtencionRestantes: entero,
  diasDeAtencionTotales: entero,
  proyeccionIngresos: z.nullable(z.number().check(z.gte(0))),
  necesarioPorDia: z.nullable(z.number().check(z.gte(0))),
  estado: z.enum(ESTADOS_DE_META),
});

export const metaActualSchema = z.strictObject({
  mes,
  meta: z.nullable(objetivosSchema),
  progreso: progresoSchema,
});

const filaDeMetaSchema = z.strictObject({
  mes,
  ingresosObjetivo: z.nullable(z.int().check(z.gte(1))),
  trabajosObjetivo: z.nullable(z.int().check(z.gte(1))),
  ingresos: entero,
  trabajos: entero,
  cumplida: z.boolean(),
});

const metasDelAnioSchema = z.strictObject({ metas: z.array(filaDeMetaSchema) });
const metaGuardadaSchema = z.strictObject({ meta: z.strictObject({ mes, ...objetivosSchema.shape }) });

export type MetaActual = z.infer<typeof metaActualSchema>;
export type ProgresoDeMeta = MetaActual['progreso'];
export type ObjetivosDeMeta = z.infer<typeof objetivosSchema>;
export type FilaDeMeta = z.infer<typeof filaDeMetaSchema>;

/** La meta de este mes (o `meta: null`) con cómo viene el mes: ritmo, proyección y estado. */
export function obtenerMetaActual(signal?: AbortSignal): Promise<MetaActual> {
  return requestAdmin('/admin/metas/actual', { signal, schema: metaActualSchema });
}

/** Las metas de un año (solo los meses que tienen), con lo que se logró en cada uno. */
export async function listarMetas(anio: number, signal?: AbortSignal): Promise<FilaDeMeta[]> {
  const { metas } = await requestAdmin(`/admin/metas?anio=${String(anio)}`, { signal, schema: metasDelAnioSchema });
  return metas;
}

/** Fija o cambia la meta de un mes (`YYYY-MM`). Un objetivo en `null` lo vacía; hace falta al menos uno. */
export async function fijarMeta(mesDeLaMeta: string, objetivos: ObjetivosDeMeta): Promise<ObjetivosDeMeta> {
  const { meta } = await requestAdmin(`/admin/metas/${encodeURIComponent(mesDeLaMeta)}`, {
    method: 'PUT',
    body: objetivos,
    schema: metaGuardadaSchema,
  });
  return { ingresosObjetivo: meta.ingresosObjetivo, trabajosObjetivo: meta.trabajosObjetivo };
}

export async function quitarMeta(mesDeLaMeta: string): Promise<void> {
  await requestAdmin(`/admin/metas/${encodeURIComponent(mesDeLaMeta)}`, { method: 'DELETE' });
}

/* ---------- Aviso de insumos con stock bajo (Hoy) ---------- */

// Solo se lee `bajoStock`: la lista de insumos y sus costos son de Inventario, no de Hoy.
const stockBajoSchema = z.looseObject({ bajoStock: entero });

/** Cuántos insumos activos tienen el stock en el mínimo o por debajo (de todo el inventario). Todos los roles. */
export async function contarInsumosConStockBajo(signal?: AbortSignal): Promise<number> {
  const { bajoStock } = await requestAdmin('/admin/insumos?bajoStock=true&limit=1', { signal, schema: stockBajoSchema });
  return bajoStock;
}
