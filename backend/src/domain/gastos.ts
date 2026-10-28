/**
 * Gastos del taller (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md, "Gastos").
 *
 * Ganancia neta = ingresos - gastos del período (criterio de caja). Los gastos se agrupan por la fecha del gasto
 * (hora de La Rioja: es una fecha de calendario, sin zona horaria). Pesos enteros. Un gasto con origen "inventario"
 * lo crea una compra de inventario y solo se corrige desde Inventario.
 */

export const CATEGORIAS_GASTO = [
  'insumos',
  'herramientas',
  'alquiler',
  'servicios',
  'sueldos',
  'publicidad',
  'mantenimiento',
  'impuestos',
  'otros',
] as const;
export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];

export const ORIGENES_GASTO = ['manual', 'inventario'] as const;
export type OrigenGasto = (typeof ORIGENES_GASTO)[number];

/** Mismos topes que los CHECK de la tabla gastos. */
export const GASTO_MONTO_MIN = 1;
export const GASTO_MONTO_MAX = 99_999_999;
export const GASTO_DESCRIPCION_MAX = 120;
export const GASTO_PROVEEDOR_MAX = 80;

export interface Gasto {
  id: string;
  /** YYYY-MM-DD */
  fecha: string;
  categoria: CategoriaGasto;
  descripcion: string;
  monto: number;
  proveedor: string | null;
  origen: OrigenGasto;
  creadoPor: { id: string; nombre: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** Filtro del listado, ya con los valores por omisión resueltos. Los límites de fecha son inclusivos y opcionales. */
export interface FiltroGastos {
  desde?: string;
  hasta?: string;
  categoria?: CategoriaGasto;
  /** Texto buscado en descripción y proveedor (los comodines se tratan como texto: lo escapa el repositorio). */
  q?: string;
  limit: number;
  offset: number;
}

export interface ListaGastos {
  gastos: Gasto[];
  /** Cantidad de gastos del filtro completo (no solo de la página). */
  total: number;
  /** Suma en pesos de TODO el filtro (no solo de la página). */
  suma: number;
}

/** Lo que se guarda al crear un gasto. */
export interface NuevoGasto {
  fecha: string;
  categoria: CategoriaGasto;
  descripcion: string;
  monto: number;
  proveedor: string | null;
  origen: OrigenGasto;
  /** perfiles.id de quien lo cargó; null si lo creó el sistema. */
  creadoPor: string | null;
}

/** Cambios de un PATCH: undefined = no se toca; `proveedor: null` = borrarlo. */
export interface CambiosGasto {
  fecha?: string;
  categoria?: CategoriaGasto;
  descripcion?: string;
  monto?: number;
  proveedor?: string | null;
}

/** El gasto viene de una compra de inventario: no se edita ni se borra desde Gastos. */
export class GastoDeInventarioError extends Error {
  constructor() {
    super('Este gasto viene de una compra de inventario: corregilo desde Inventario.');
    this.name = 'GastoDeInventarioError';
  }
}

export interface GastoRepository {
  listar(filtro: FiltroGastos): Promise<ListaGastos>;
  /** Crea un gasto (dentro de una transacción ajena, ver `crearGasto` en repositories/postgres/gastos.ts). */
  crear(nuevo: NuevoGasto): Promise<Gasto>;
  /** null si no existe. Lanza GastoDeInventarioError si el gasto es de inventario. */
  actualizar(id: string, cambios: CambiosGasto, ahora: Date): Promise<Gasto | null>;
  /** false si no existía. Lanza GastoDeInventarioError si el gasto es de inventario. */
  borrar(id: string): Promise<boolean>;
}

/** Lo que necesita una compra de inventario para dejar su gasto (ver `registrarGastoDeInventario`). */
export interface DatosGastoDeInventario {
  /** YYYY-MM-DD, la fecha de la compra (hoy en La Rioja). */
  fecha: string;
  /** Ej.: "Compra: Cera en pasta (5 unidad)". 1 a 120 caracteres. */
  descripcion: string;
  /** Pesos enteros, 1 a 99.999.999. */
  monto: number;
  proveedor?: string | null;
  /** perfiles.id de quien registró la compra. */
  creadoPor?: string | null;
}

