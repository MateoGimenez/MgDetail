import { formatearNumero } from '../lib/formato.js';
import type { Rol } from './perfil.js';
import { puedeVerCostosInventario } from './permisos.js';

/**
 * Inventario del taller (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md, "Inventario").
 *
 * Insumos con stock decimal (hasta 2 decimales) y un historial de movimientos con signo (compra +, uso -, ajuste +/-).
 * Los costos y los valores en pesos (`costoUnitario`, `valorEnStock`, `costoTotal`, `valorTotal`) son plata: el
 * empleado nunca los recibe (ver `vistaDeInsumo`, `vistaDeMovimiento` y `vistaDeListaDeInsumos`).
 */

export const UNIDADES = ['unidad', 'litro', 'ml', 'kg', 'g', 'par', 'caja'] as const;
export type Unidad = (typeof UNIDADES)[number];

export const TIPOS_MOVIMIENTO = ['compra', 'uso', 'ajuste'] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

/** Mismos topes que los CHECK de las tablas insumos y movimientos_stock. */
export const INSUMO_NOMBRE_MAX = 80;
export const INSUMO_CATEGORIA_MAX = 40;
export const INSUMO_COSTO_MAX = 99_999_999;
export const CANTIDAD_MAX = 999_999;
export const MOVIMIENTO_NOTA_MAX = 200;
export const MOVIMIENTO_PROVEEDOR_MAX = 80;
export const COSTO_TOTAL_MAX = 99_999_999;

export interface Insumo {
  id: string;
  nombre: string;
  categoria: string | null;
  unidad: Unidad;
  stock: number;
  stockMinimo: number;
  /** Pesos por unidad. null = sin costo cargado (y siempre null para el empleado). */
  costoUnitario: number | null;
  activo: boolean;
  /** stockMinimo > 0 && stock <= stockMinimo. */
  bajoStock: boolean;
  /** round(stock x costoUnitario); null si no hay costo (y siempre null para el empleado). */
  valorEnStock: number | null;
  updatedAt: string;
}

export interface Movimiento {
  id: string;
  tipo: TipoMovimiento;
  /** Con signo: compra +, uso -, ajuste +/-. */
  cantidad: number;
  /** null si no tiene (y siempre null para el empleado). */
  costoTotal: number | null;
  proveedor: string | null;
  nota: string | null;
  persona: { id: string; nombre: string } | null;
  turnoId: string | null;
  createdAt: string;
}

export type FiltroActivo = 'true' | 'false' | 'todos';

export interface FiltroInsumos {
  /** Texto buscado en nombre y categoría (los comodines los escapa el repositorio). */
  q?: string;
  /** true = solo los de stock bajo. */
  bajoStock?: boolean;
  activo: FiltroActivo;
  limit: number;
  offset: number;
}

export interface ListaInsumos {
  insumos: Insumo[];
  /** Cantidad de insumos del filtro completo. */
  total: number;
  /** Insumos activos con stock bajo en TODO el inventario (no solo en el filtro ni en la página). */
  bajoStock: number;
  /** Suma de valorEnStock de los insumos activos de todo el inventario; null para el empleado. */
  valorTotal: number | null;
}

export interface ListaMovimientos {
  movimientos: Movimiento[];
  total: number;
}

export interface NuevoInsumo {
  nombre: string;
  categoria: string | null;
  unidad: Unidad;
  stockInicial: number;
  stockMinimo: number;
  costoUnitario: number | null;
}

/** Cambios de un PATCH: undefined = no se toca; null (donde se permite) = vaciar. */
export interface CambiosInsumo {
  nombre?: string;
  categoria?: string | null;
  unidad?: Unidad;
  stockMinimo?: number;
  costoUnitario?: number | null;
  activo?: boolean;
}

/** Lo que se pide registrar, ya validado en su formato. */
export type PedidoMovimiento =
  | { tipo: 'uso'; cantidad: number; nota: string | null; turnoId: string | null }
  | { tipo: 'compra'; cantidad: number; costoTotal: number | null; proveedor: string | null; nota: string | null }
  | { tipo: 'ajuste'; stockReal: number; nota: string | null };

export interface ResultadoMovimiento {
  insumo: Insumo;
  /** null si un ajuste no cambió nada (el stock ya era el real). */
  movimiento: Movimiento | null;
}

/** Quién registra y cuándo, para el movimiento y el gasto de una compra. */
export interface ContextoMovimiento {
  perfilId: string;
  /** Hoy en La Rioja (YYYY-MM-DD): la fecha del gasto de una compra. */
  hoy: string;
  ahora: Date;
}

/** El uso supera el stock: `disponible` es lo que queda. */
export class StockInsuficienteError extends Error {
  constructor(
    readonly disponible: number,
    readonly unidad: Unidad,
  ) {
    super('No alcanza el stock.');
    this.name = 'StockInsuficienteError';
  }
}

/** Tope del stock de un insumo (el CHECK de la tabla insumos). */
export const STOCK_MAX = 9_999_999.99;

/** La compra dejaría el stock por encima del tope. */
export class StockExcedidoError extends Error {
  constructor() {
    super('El stock supera el máximo.');
    this.name = 'StockExcedidoError';
  }
}

/** Ya hay un insumo activo con ese nombre (sin distinguir mayúsculas). */
export class NombreDeInsumoRepetidoError extends Error {
  constructor() {
    super('Ya hay un insumo activo con ese nombre.');
    this.name = 'NombreDeInsumoRepetidoError';
  }
}

/** El turno que se quiere vincular al uso no existe. */
export class TurnoInexistenteError extends Error {
  constructor() {
    super('El turno no existe.');
    this.name = 'TurnoInexistenteError';
  }
}

export interface InventarioRepository {
  listar(filtro: FiltroInsumos): Promise<ListaInsumos>;
  /** null si no existe. */
  obtener(id: string): Promise<Insumo | null>;
  /** Lanza NombreDeInsumoRepetidoError. Un stock inicial > 0 deja un ajuste "Stock inicial". */
  crear(nuevo: NuevoInsumo, contexto: ContextoMovimiento): Promise<Insumo>;
  /** null si no existe. Lanza NombreDeInsumoRepetidoError. */
  actualizar(id: string, cambios: CambiosInsumo, ahora: Date): Promise<Insumo | null>;
  /** null si el insumo no existe. */
  listarMovimientos(id: string, limit: number, offset: number): Promise<ListaMovimientos | null>;
  /**
   * Registra el movimiento y cambia el stock en UNA transacción, con un bloqueo por insumo. Una compra con costo
   * crea además su gasto. null si el insumo no existe. Lanza StockInsuficienteError y TurnoInexistenteError.
   */
  registrarMovimiento(
    id: string,
    pedido: PedidoMovimiento,
    contexto: ContextoMovimiento,
  ): Promise<ResultadoMovimiento | null>;
}

/* ----------------------------------------------------------------------------------- reglas puras */

/** stockMinimo > 0 && stock <= stockMinimo. */
export function estaBajoStock(stock: number, stockMinimo: number): boolean {
  return stockMinimo > 0 && stock <= stockMinimo;
}

/** Redondea a 2 decimales (las cantidades del inventario tienen a lo sumo 2). */
export function redondear2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** 4,5 / 1.250 (formato es-AR). */
export function formatearCantidad(valor: number): string {
  return formatearNumero(valor, 2);
}

const PLURALES: Readonly<Record<Unidad, string>> = {
  unidad: 'unidades',
  litro: 'litros',
  ml: 'ml',
  kg: 'kg',
  g: 'g',
  par: 'pares',
  caja: 'cajas',
};

/** "litro" / "litros" según la cantidad (1 es singular). */
export function nombreDeUnidad(unidad: Unidad, cantidad: number): string {
  return cantidad === 1 ? unidad : PLURALES[unidad];
}

/** "Solo quedan 0,3 litros." / "Solo queda 1 litro." / "No queda stock de este insumo." */
export function mensajeStockInsuficiente(disponible: number, unidad: Unidad): string {
  if (disponible <= 0) return 'No queda stock de este insumo.';
  const verbo = disponible === 1 ? 'queda' : 'quedan';
  return `Solo ${verbo} ${formatearCantidad(disponible)} ${nombreDeUnidad(unidad, disponible)}.`;
}

/* ----------------------------------------------------------------------------------- vistas por rol */

/** El insumo tal como lo ve ese rol: el empleado nunca recibe costos ni valores en pesos. */
export function vistaDeInsumo(rol: Rol, insumo: Insumo): Insumo {
  return puedeVerCostosInventario(rol) ? insumo : { ...insumo, costoUnitario: null, valorEnStock: null };
}

/**
 * El movimiento tal como lo ve ese rol: el empleado nunca recibe el costo ni el proveedor, y de las personas solo
 * se ve a sí mismo (no el nombre ni el email de los demás).
 */
export function vistaDeMovimiento(rol: Rol, movimiento: Movimiento, perfilId: string): Movimiento {
  if (puedeVerCostosInventario(rol)) return movimiento;
  const propio = movimiento.persona !== null && movimiento.persona.id === perfilId;
  return { ...movimiento, costoTotal: null, proveedor: null, persona: propio ? movimiento.persona : null };
}

/** La lista tal como la ve ese rol (también `valorTotal`). */
export function vistaDeListaDeInsumos(rol: Rol, lista: ListaInsumos): ListaInsumos {
  if (puedeVerCostosInventario(rol)) return lista;
  return {
    insumos: lista.insumos.map((insumo) => vistaDeInsumo(rol, insumo)),
    total: lista.total,
    bajoStock: lista.bajoStock,
    valorTotal: null,
  };
}
