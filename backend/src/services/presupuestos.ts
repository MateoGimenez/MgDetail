import { TurnoInexistenteError } from '../domain/inventario.js';
import {
  type CambiosPresupuesto,
  type FiltroPresupuestos,
  PRESUPUESTO_TOTAL_MAX,
  PresupuestoAceptadoError,
  type Presupuesto,
  type PresupuestoRepository,
  VALIDEZ_DIAS_DEFAULT,
  armarPresupuesto,
  calcularSubtotal,
  calcularTotal,
} from '../domain/presupuestos.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { DatosCambiosPresupuesto, DatosNuevoPresupuesto } from '../schemas/documentos.js';
import type { UsuarioSesion } from './auth.js';

export interface PresupuestoServiceDeps {
  presupuestos: PresupuestoRepository;
  logger: Logger;
  now: () => Date;
}

export const PRESUPUESTO_NOT_FOUND = 'No encontramos ese presupuesto.';
const TOTAL_EXCEDIDO_MSG = `La suma de los ítems supera el máximo permitido ($ ${PRESUPUESTO_TOTAL_MAX.toLocaleString('es-AR')}).`;

/**
 * Casos de uso de los presupuestos (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md). Los permisos
 * los exige la ruta (domain/permisos.ts, puedeArmarPresupuestos). Las cuentas (subtotal, total, vencimiento) se hacen
 * acá y en domain/presupuestos.ts, nunca en el cliente. En el log: quién y qué id; nunca nombres ni teléfonos.
 */
export class PresupuestoService {
  constructor(private readonly deps: PresupuestoServiceDeps) {}

  async listar(filtro: FiltroPresupuestos): Promise<{ presupuestos: Presupuesto[]; total: number }> {
    const lista = await this.deps.presupuestos.listar(filtro);
    const ahora = this.deps.now();
    return { presupuestos: lista.presupuestos.map((p) => armarPresupuesto(p, ahora)), total: lista.total };
  }

  async obtener(id: string): Promise<Presupuesto> {
    const guardado = await this.deps.presupuestos.obtener(id);
    if (guardado === null) throw AppError.notFound(PRESUPUESTO_NOT_FOUND);
    return armarPresupuesto(guardado, this.deps.now());
  }

  async crear(actor: UsuarioSesion, datos: DatosNuevoPresupuesto): Promise<Presupuesto> {
    const total = this.totalDe(datos.items, datos.descuento);
    try {
      const guardado = await this.deps.presupuestos.crear({
        clienteNombre: datos.clienteNombre,
        clienteTelefono: datos.clienteTelefono,
        vehiculo: datos.vehiculo,
        items: datos.items,
        descuento: datos.descuento,
        total,
        validezDias: datos.validezDias ?? VALIDEZ_DIAS_DEFAULT,
        notas: datos.notas,
        turnoId: datos.turnoId,
        creadoPor: actor.id,
      }, this.deps.now());
      this.deps.logger.info(`Presupuesto creado id=${guardado.id} numero=${String(guardado.numero)} por=${actor.id}`);
      return armarPresupuesto(guardado, this.deps.now());
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async actualizar(actor: UsuarioSesion, id: string, datos: DatosCambiosPresupuesto): Promise<Presupuesto> {
    const cambios: CambiosPresupuesto = { ...datos };
    try {
      // El total depende de los ítems y del descuento: el repositorio lo recalcula con lo guardado, bajo bloqueo.
      const guardado = await this.deps.presupuestos.actualizar(id, cambios, this.deps.now(), (items, descuento) =>
        this.totalDe(items, descuento),
      );
      if (guardado === null) throw AppError.notFound(PRESUPUESTO_NOT_FOUND);
      this.deps.logger.info(`Presupuesto actualizado id=${id} campos=${Object.keys(datos).join(',')} por=${actor.id}`);
      return armarPresupuesto(guardado, this.deps.now());
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async borrar(actor: UsuarioSesion, id: string): Promise<void> {
    try {
      if (!(await this.deps.presupuestos.borrar(id))) throw AppError.notFound(PRESUPUESTO_NOT_FOUND);
    } catch (error) {
      throw this.traducir(error);
    }
    this.deps.logger.info(`Presupuesto borrado id=${id} por=${actor.id}`);
  }

  /** max(0, subtotal - descuento); un subtotal que no entra en el tope es un 400 en el campo de los ítems. */
  private totalDe(items: DatosNuevoPresupuesto['items'], descuento: number): number {
    const subtotal = calcularSubtotal(items);
    if (subtotal > PRESUPUESTO_TOTAL_MAX) throw AppError.validation({ items: TOTAL_EXCEDIDO_MSG });
    return calcularTotal(subtotal, descuento);
  }

  private traducir(error: unknown): unknown {
    if (error instanceof PresupuestoAceptadoError) return AppError.presupuestoAceptado();
    if (error instanceof TurnoInexistenteError) return AppError.validation({ turnoId: 'No encontramos ese turno.' });
    return error;
  }
}
