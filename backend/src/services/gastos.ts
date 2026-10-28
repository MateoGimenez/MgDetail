import {
  type CambiosGasto,
  type DatosGastoDeInventario,
  type FiltroGastos,
  type Gasto,
  GastoDeInventarioError,
  type GastoRepository,
  type ListaGastos,
  type CategoriaGasto,
} from '../domain/gastos.js';
import { daysBetween, daysInMonth, startOfMonth, todayInLaRioja } from '../lib/dates.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { SqlClient } from '../db/postgres.js';
import { crearGasto } from '../repositories/postgres/gastos.js';
import type { UsuarioSesion } from './auth.js';

export interface GastoServiceDeps {
  gastos: GastoRepository;
  logger: Logger;
  now: () => Date;
}

export const GASTO_NOT_FOUND = 'No encontramos ese gasto.';
export const FECHA_FUTURA_MSG = 'La fecha del gasto no puede ser futura.';

/** Lo que pide GET /api/admin/gastos ya validado en su formato. */
export interface PedidoGastos {
  desde?: string;
  hasta?: string;
  categoria?: CategoriaGasto;
  q?: string;
  limit: number;
  offset: number;
}

/** Lo que pide el alta, ya validado en su formato. */
export interface DatosGasto {
  fecha: string;
  categoria: CategoriaGasto;
  descripcion: string;
  monto: number;
  proveedor?: string | null;
}

/**
 * Casos de uso de los gastos (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md). Los permisos los
 * exige la ruta (domain/permisos.ts, puedeGestionarGastos). En el log: quién y qué id; nunca la descripción ni el
 * proveedor. "Hoy" es el de La Rioja.
 */
export class GastoService {
  constructor(private readonly deps: GastoServiceDeps) {}

  private hoy(): string {
    return todayInLaRioja(this.deps.now());
  }

  /** Sin `desde` ni `hasta`, el mes actual; si viene uno solo, el otro extremo queda abierto. */
  async listar(pedido: PedidoGastos): Promise<ListaGastos> {
    const hoy = this.hoy();
    let { desde, hasta } = pedido;
    if (desde === undefined && hasta === undefined) {
      desde = startOfMonth(hoy);
      hasta = `${hoy.slice(0, 7)}-${String(daysInMonth(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)))).padStart(2, '0')}`;
    } else if (desde !== undefined && hasta !== undefined && daysBetween(desde, hasta) < 0) {
      throw AppError.validation({ hasta: '"hasta" no puede ser anterior a "desde".' });
    }
    const filtro: FiltroGastos = {
      ...(desde !== undefined && { desde }),
      ...(hasta !== undefined && { hasta }),
      ...(pedido.categoria !== undefined && { categoria: pedido.categoria }),
      ...(pedido.q !== undefined && { q: pedido.q }),
      limit: pedido.limit,
      offset: pedido.offset,
    };
    return this.deps.gastos.listar(filtro);
  }

  private verificarFecha(fecha: string): void {
    if (fecha > this.hoy()) throw AppError.validation({ fecha: FECHA_FUTURA_MSG });
  }

  async crear(actor: UsuarioSesion, datos: DatosGasto): Promise<Gasto> {
    this.verificarFecha(datos.fecha);
    const gasto = await this.deps.gastos.crear({
      fecha: datos.fecha,
      categoria: datos.categoria,
      descripcion: datos.descripcion,
      monto: datos.monto,
      proveedor: datos.proveedor ?? null,
      origen: 'manual',
      creadoPor: actor.id,
    });
    this.deps.logger.info(`Gasto creado id=${gasto.id} por=${actor.id}`);
    return gasto;
  }

  async actualizar(actor: UsuarioSesion, id: string, cambios: CambiosGasto): Promise<Gasto> {
    if (cambios.fecha !== undefined) this.verificarFecha(cambios.fecha);
    try {
      const gasto = await this.deps.gastos.actualizar(id, cambios, this.deps.now());
      if (gasto === null) throw AppError.notFound(GASTO_NOT_FOUND);
      this.deps.logger.info(`Gasto actualizado id=${id} campos=${Object.keys(cambios).join(',')} por=${actor.id}`);
      return gasto;
    } catch (error) {
      if (error instanceof GastoDeInventarioError) throw AppError.gastoDeInventario();
      throw error;
    }
  }

  async borrar(actor: UsuarioSesion, id: string): Promise<void> {
    try {
      if (!(await this.deps.gastos.borrar(id))) throw AppError.notFound(GASTO_NOT_FOUND);
    } catch (error) {
      if (error instanceof GastoDeInventarioError) throw AppError.gastoDeInventario();
      throw error;
    }
    this.deps.logger.info(`Gasto borrado id=${id} por=${actor.id}`);
  }
}

/**
 * Para el inventario: deja el gasto de una compra DENTRO de la transacción de quien llama (`tx` es el cliente que
 * recibe `sql.transaction(async (tx) => ...)`). Categoría "insumos" y origen "inventario" (ese gasto no se edita ni se
 * borra desde Finanzas). Devuelve el gasto creado, para vincular su id al movimiento de stock. Los datos tienen que
 * respetar los topes de la tabla gastos (descripción 1 a 120, monto 1 a 99.999.999, proveedor hasta 80, fecha
 * YYYY-MM-DD): si no, la base rechaza el INSERT y la transacción entera se revierte.
 */
export function registrarGastoDeInventario(tx: SqlClient, datos: DatosGastoDeInventario): Promise<Gasto> {
  return crearGasto(tx, {
    fecha: datos.fecha,
    categoria: 'insumos',
    descripcion: datos.descripcion,
    monto: datos.monto,
    proveedor: datos.proveedor ?? null,
    origen: 'inventario',
    creadoPor: datos.creadoPor ?? null,
  });
}
