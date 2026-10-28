import { addDays, todayInLaRioja } from '../lib/dates.js';

/**
 * Presupuestos (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md, "Presupuestos"). NO son facturas.
 *
 * Pesos enteros. `subtotal`, `total`, `venceEl` y `vencido` no se guardan a mano: los calcula el backend con las
 * funciones de este archivo (el total sí se guarda, para que la base pueda ordenar y verificar su rango).
 */

export const ESTADOS_PRESUPUESTO = ['borrador', 'enviado', 'aceptado', 'rechazado'] as const;
export type EstadoPresupuesto = (typeof ESTADOS_PRESUPUESTO)[number];

/** Mismos topes que los CHECK de la tabla presupuestos y de la función presupuesto_items_validos. */
export const PRESUPUESTO_ITEMS_MIN = 1;
export const PRESUPUESTO_ITEMS_MAX = 30;
export const ITEM_DESCRIPCION_MAX = 120;
export const ITEM_CANTIDAD_MAX = 999;
export const ITEM_PRECIO_MAX = 99_999_999;
export const PRESUPUESTO_CLIENTE_MAX = 80;
export const PRESUPUESTO_VEHICULO_MAX = 80;
export const PRESUPUESTO_NOTAS_MAX = 500;
export const PRESUPUESTO_DESCUENTO_MAX = 999_999_999;
/** El total tiene que entrar en un integer de Postgres con holgura. */
export const PRESUPUESTO_TOTAL_MAX = 999_999_999;
export const VALIDEZ_DIAS_MIN = 1;
export const VALIDEZ_DIAS_MAX = 90;
export const VALIDEZ_DIAS_DEFAULT = 7;

export interface ItemPresupuesto {
  descripcion: string;
  /** > 0, hasta 999 y con a lo sumo 2 decimales. */
  cantidad: number;
  /** Pesos enteros, 0 a 99.999.999. */
  precioUnitario: number;
}

/** El presupuesto como está guardado (sin lo que se calcula). */
export interface PresupuestoGuardado {
  id: string;
  numero: number;
  clienteNombre: string;
  /** Solo dígitos, formato internacional (con 549 si es celular argentino). */
  clienteTelefono: string | null;
  vehiculo: string | null;
  items: ItemPresupuesto[];
  descuento: number;
  total: number;
  validezDias: number;
  estado: EstadoPresupuesto;
  notas: string | null;
  turnoId: string | null;
  creadoPor: { id: string; nombre: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** El presupuesto tal como sale por la API (y para el PDF). */
export interface Presupuesto extends PresupuestoGuardado {
  /** P-0007 */
  codigo: string;
  subtotal: number;
  /** YYYY-MM-DD */
  venceEl: string;
  vencido: boolean;
}

export interface FiltroPresupuestos {
  estado?: EstadoPresupuesto;
  /** Texto buscado en cliente, vehículo y código (los comodines los escapa el repositorio). */
  q?: string;
  limit: number;
  offset: number;
}

export interface ListaPresupuestos {
  presupuestos: PresupuestoGuardado[];
  total: number;
}

export interface NuevoPresupuesto {
  clienteNombre: string;
  clienteTelefono: string | null;
  vehiculo: string | null;
  items: ItemPresupuesto[];
  descuento: number;
  total: number;
  validezDias: number;
  notas: string | null;
  turnoId: string | null;
  creadoPor: string | null;
}

/** Cambios de un PATCH: undefined = no se toca; null (donde se permite) = vaciar. `total` ya viene recalculado. */
export interface CambiosPresupuesto {
  clienteNombre?: string;
  clienteTelefono?: string | null;
  vehiculo?: string | null;
  items?: ItemPresupuesto[];
  descuento?: number;
  total?: number;
  validezDias?: number;
  estado?: EstadoPresupuesto;
  notas?: string | null;
  turnoId?: string | null;
}

/** El presupuesto está aceptado: no se borra. */
export class PresupuestoAceptadoError extends Error {
  constructor() {
    super('El presupuesto está aceptado.');
    this.name = 'PresupuestoAceptadoError';
  }
}

export interface PresupuestoRepository {
  listar(filtro: FiltroPresupuestos): Promise<ListaPresupuestos>;
  /** null si no existe. */
  obtener(id: string): Promise<PresupuestoGuardado | null>;
  /** Lanza TurnoInexistenteError si el turno vinculado no existe. */
  crear(nuevo: NuevoPresupuesto, ahora: Date): Promise<PresupuestoGuardado>;
  /**
   * null si no existe. Lanza TurnoInexistenteError. Si cambian los ítems o el descuento, `recalcularTotal` recibe lo
   * que quedó guardado mezclado con los cambios, DENTRO de la transacción y con la fila bloqueada: dos cambios a la
   * vez no pueden dejar un total que no corresponde.
   */
  actualizar(
    id: string,
    cambios: CambiosPresupuesto,
    ahora: Date,
    recalcularTotal?: (items: ItemPresupuesto[], descuento: number) => number,
  ): Promise<PresupuestoGuardado | null>;
  /** false si no existía. Lanza PresupuestoAceptadoError. */
  borrar(id: string): Promise<boolean>;
}

/* ----------------------------------------------------------------------------------- cuentas */

/**
 * Importe de un ítem: round(cantidad x precioUnitario), con .5 hacia arriba. Con enteros (la cantidad en centésimas)
 * para no arrastrar errores de coma flotante: 1,15 x 100 da 115, no 114,99999.
 */
export function importeDeItem(item: ItemPresupuesto): number {
  const centesimas = Math.round(item.cantidad * 100);
  return Math.floor((centesimas * item.precioUnitario + 50) / 100);
}

/** Suma de los importes de los ítems. */
export function calcularSubtotal(items: readonly ItemPresupuesto[]): number {
  return items.reduce((suma, item) => suma + importeDeItem(item), 0);
}

/** max(0, subtotal - descuento): un descuento mayor al subtotal deja el total en 0, nunca negativo. */
export function calcularTotal(subtotal: number, descuento: number): number {
  return Math.max(0, subtotal - descuento);
}

/** P-0007 (el número no se corta si pasa de 4 dígitos). */
export function codigoDePresupuesto(numero: number): string {
  return `P-${String(numero).padStart(4, '0')}`;
}

/** Fecha de creación (en hora de La Rioja) + validezDias. */
export function calcularVencimiento(createdAt: string, validezDias: number): string {
  return addDays(todayInLaRioja(new Date(createdAt)), validezDias);
}

/** Borrador o enviado con la fecha de vencimiento ya pasada (hoy, en La Rioja, todavía vale). */
export function estaVencido(estado: EstadoPresupuesto, venceEl: string, hoy: string): boolean {
  return (estado === 'borrador' || estado === 'enviado') && venceEl < hoy;
}

/** Agrega al presupuesto guardado lo que se calcula: código, subtotal, vencimiento y si está vencido. */
export function armarPresupuesto(guardado: PresupuestoGuardado, ahora: Date): Presupuesto {
  const venceEl = calcularVencimiento(guardado.createdAt, guardado.validezDias);
  return {
    ...guardado,
    codigo: codigoDePresupuesto(guardado.numero),
    subtotal: calcularSubtotal(guardado.items),
    venceEl,
    vencido: estaVencido(guardado.estado, venceEl, todayInLaRioja(ahora)),
  };
}
