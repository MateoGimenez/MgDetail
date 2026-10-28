import {
  type CambiosInsumo,
  type FiltroInsumos,
  type Insumo,
  type InventarioRepository,
  type ListaInsumos,
  type ListaMovimientos,
  NombreDeInsumoRepetidoError,
  type NuevoInsumo,
  type PedidoMovimiento,
  type ResultadoMovimiento,
  StockExcedidoError,
  StockInsuficienteError,
  TurnoInexistenteError,
  mensajeStockInsuficiente,
} from '../domain/inventario.js';
import { todayInLaRioja } from '../lib/dates.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { UsuarioSesion } from './auth.js';

export interface InventarioServiceDeps {
  inventario: InventarioRepository;
  logger: Logger;
  now: () => Date;
}

export const INSUMO_NOT_FOUND = 'No encontramos ese insumo.';
export const NOMBRE_REPETIDO_MSG = 'Ya hay un insumo activo con ese nombre.';

/**
 * Casos de uso del inventario (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md). Los permisos los
 * exige la ruta (domain/permisos.ts); lo que ve cada rol (sin costos para el empleado) también lo resuelve la ruta con
 * las vistas de domain/inventario.ts. En el log: quién y qué id; nunca montos ni notas.
 */
export class InventarioService {
  constructor(private readonly deps: InventarioServiceDeps) {}

  listar(filtro: FiltroInsumos): Promise<ListaInsumos> {
    return this.deps.inventario.listar(filtro);
  }

  async crear(actor: UsuarioSesion, datos: NuevoInsumo): Promise<Insumo> {
    const ahora = this.deps.now();
    try {
      const insumo = await this.deps.inventario.crear(datos, { perfilId: actor.id, hoy: todayInLaRioja(ahora), ahora });
      this.deps.logger.info(`Insumo creado id=${insumo.id} por=${actor.id}`);
      return insumo;
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async actualizar(actor: UsuarioSesion, id: string, cambios: CambiosInsumo): Promise<Insumo> {
    try {
      const insumo = await this.deps.inventario.actualizar(id, cambios, this.deps.now());
      if (insumo === null) throw AppError.notFound(INSUMO_NOT_FOUND);
      this.deps.logger.info(`Insumo actualizado id=${id} campos=${Object.keys(cambios).join(',')} por=${actor.id}`);
      return insumo;
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async listarMovimientos(id: string, limit: number, offset: number): Promise<ListaMovimientos> {
    const lista = await this.deps.inventario.listarMovimientos(id, limit, offset);
    if (lista === null) throw AppError.notFound(INSUMO_NOT_FOUND);
    return lista;
  }

  async registrarMovimiento(actor: UsuarioSesion, id: string, pedido: PedidoMovimiento): Promise<ResultadoMovimiento> {
    const ahora = this.deps.now();
    try {
      const resultado = await this.deps.inventario.registrarMovimiento(id, pedido, {
        perfilId: actor.id,
        hoy: todayInLaRioja(ahora),
        ahora,
      });
      if (resultado === null) throw AppError.notFound(INSUMO_NOT_FOUND);
      this.deps.logger.info(`Stock movido insumo=${id} tipo=${pedido.tipo} por=${actor.id}`);
      return resultado;
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /** Errores de la regla de negocio => errores de la API. Lo demás se propaga (500). */
  private traducir(error: unknown): unknown {
    if (error instanceof StockInsuficienteError) {
      return AppError.stockInsuficiente(mensajeStockInsuficiente(error.disponible, error.unidad));
    }
    if (error instanceof NombreDeInsumoRepetidoError) {
      return AppError.conflict(NOMBRE_REPETIDO_MSG, { nombre: NOMBRE_REPETIDO_MSG });
    }
    if (error instanceof TurnoInexistenteError) {
      return AppError.validation({ turnoId: 'No encontramos ese turno.' });
    }
    if (error instanceof StockExcedidoError) {
      return AppError.validation({ cantidad: 'Con esa cantidad el stock supera el máximo permitido (9.999.999,99).' });
    }
    return error;
  }
}
