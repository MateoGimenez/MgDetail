import {
  type Booking,
  type BookingRepository,
  ESTADOS_CERRADOS,
  type Reprogramacion,
  TurnoCerradoError,
} from '../domain/booking.js';
import { fechaConfirmadaRange, MAX_DAYS_CONFIRMADA } from '../domain/booking-dates.js';
import type { PerfilRepository } from '../domain/perfil.js';
import { puedeCambiarEstado, puedeRegistrarCobro, puedeReprogramar } from '../domain/permisos.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { CambiosTurno } from '../schemas/admin.js';
import type { UsuarioSesion } from './auth.js';

export interface AgendaServiceDeps {
  bookings: BookingRepository;
  /** Para comprobar que quien hizo el trabajo existe y está activo. */
  perfiles: PerfilRepository;
  logger: Logger;
  now: () => Date;
}

export const NOT_FOUND_MESSAGE = 'No encontramos ese turno.';
export const SOLO_COMPLETAR_MESSAGE = 'Con tu rol solo podés marcar los turnos como completados.';
export const SIN_PERMISO_REPROGRAMAR_MESSAGE = 'Con tu rol no podés cambiar la fecha de un turno.';
const CERRADO_MESSAGE = 'No se puede cambiar la fecha de un turno cancelado o completado.';
export const COBRO_SOLO_COMPLETADO_MESSAGE = 'El cobro y quién hizo el trabajo solo se cargan en un turno completado.';
export const EMPLEADO_SIN_MONTO_MESSAGE = 'Con tu rol no podés cargar el monto cobrado: lo completa un administrador.';
export const EMPLEADO_OTRO_TRABAJADOR_MESSAGE = 'Con tu rol, quien hizo el trabajo sos vos: no podés elegir a otra persona.';
export const EMPLEADO_COBRO_COMPLETADO_MESSAGE = 'Con tu rol no podés cambiar el cobro de un turno ya completado.';
export const TRABAJADOR_INVALIDO_MESSAGE = 'Elegí una persona activa del panel.';

/** Errores por campo cuando se manda cobro (con valor) para un turno que no queda completado. */
function erroresCobroSinCompletar(
  monto: number | null | undefined,
  trabajadorId: string | null | undefined,
): Record<string, string> {
  return {
    ...(monto != null && { monto: COBRO_SOLO_COMPLETADO_MESSAGE }),
    ...(trabajadorId != null && { trabajadorId: COBRO_SOLO_COMPLETADO_MESSAGE }),
  };
}

/**
 * Agenda de turnos (contrato: reportes/2026-10-22_08_agenda.md): la consulta por rango y la reprogramación (fecha y
 * franja confirmadas, opcionalmente junto con el estado). Permisos de domain/permisos.ts; rango de fechas de
 * domain/booking-dates.ts. En el log, solo id del turno, quién y la fecha nueva: nunca datos del cliente.
 */
export class AgendaService {
  constructor(private readonly deps: AgendaServiceDeps) {}

  /** Turnos no cancelados con fecha de agenda en [desde, hasta]. El rango ya viene validado (schemas/admin.ts). */
  agenda(desde: string, hasta: string): Promise<Booking[]> {
    return this.deps.bookings.agenda(desde, hasta);
  }

  /**
   * PATCH /api/admin/bookings/:id: estado, nota interna, fecha/franja confirmadas y cobro (monto y trabajador), con
   * todas las reglas del contrato (reportes/2026-10-26_15_estadisticas-y-permisos.md):
   *  - el cobro solo vale si el turno QUEDA completado (400 con fields.monto / fields.trabajadorId); mandar null no
   *    es error: en un turno que no está completado no hay nada que borrar;
   *  - admin y superadmin cargan el monto y eligen a cualquier persona ACTIVA (400 en fields.trabajadorId si no existe
   *    o está inactiva) y pueden corregirlos en un turno ya completado;
   *  - el empleado, al completar un turno, queda él mismo como trabajador; 403 si manda un monto, a otra persona o si
   *    toca el cobro de un turno que ya estaba completado;
   *  - si el estado pasa a algo distinto de completado, monto y trabajador se borran (lo hace el repositorio);
   *  - todo se valida antes de escribir: o se guarda todo o nada.
   * Cargar o corregir solo el cobro no mueve updated_at (es el "actualizado el" que ve el cliente).
   */
  async modificar(actor: UsuarioSesion, id: string, cambios: CambiosTurno): Promise<Booking> {
    const { estado, confirmada, notasInternas, monto, trabajadorId } = cambios;
    const nota = notasInternas === undefined ? {} : { notasInternas };

    // Con fecha/franja: reprogramar. Un turno que se reprograma no está (ni queda) completado: no admite cobro.
    if (confirmada !== undefined) {
      if (monto != null || trabajadorId != null) {
        if (!puedeReprogramar(actor.rol)) throw AppError.forbidden(SIN_PERMISO_REPROGRAMAR_MESSAGE);
        throw AppError.validation(erroresCobroSinCompletar(monto, trabajadorId));
      }
      return this.reprogramar(actor, id, { confirmada, ...(estado !== undefined && { estado }), ...nota });
    }

    if (estado !== undefined && !puedeCambiarEstado(actor.rol, estado)) throw AppError.forbidden(SOLO_COMPLETAR_MESSAGE);

    const completaTodo = puedeRegistrarCobro(actor.rol);
    const tocaCobro = monto !== undefined || trabajadorId !== undefined;
    const empleadoCompleta = !completaTodo && estado === 'completado';
    const now = this.deps.now();

    if (!tocaCobro && !empleadoCompleta) {
      // Sin cobro de por medio: estado y/o nota, como siempre (el repositorio borra el cobro si el turno sale de completado).
      const booking = await this.deps.bookings.actualizar(id, { ...(estado !== undefined && { estado }), ...nota }, now);
      if (booking === undefined) throw AppError.notFound(NOT_FOUND_MESSAGE);
      return booking;
    }

    // El empleado no maneja plata ni elige a otra persona (se verifica antes de leer nada).
    if (!completaTodo) {
      if (monto !== undefined) throw AppError.forbidden(EMPLEADO_SIN_MONTO_MESSAGE);
      if (trabajadorId !== undefined && trabajadorId !== actor.id) {
        throw AppError.forbidden(EMPLEADO_OTRO_TRABAJADOR_MESSAGE);
      }
    }

    const actual = await this.deps.bookings.find(id);
    if (actual === undefined) throw AppError.notFound(NOT_FOUND_MESSAGE);
    const yaCompletado = actual.estado === 'completado';
    if (!completaTodo && tocaCobro && yaCompletado) throw AppError.forbidden(EMPLEADO_COBRO_COMPLETADO_MESSAGE);

    let cobro: { monto?: number | null; trabajadorId?: string | null } = {};
    if ((estado ?? actual.estado) !== 'completado') {
      const errores = erroresCobroSinCompletar(monto, trabajadorId);
      if (Object.keys(errores).length > 0) throw AppError.validation(errores);
    } else if (completaTodo) {
      if (trabajadorId != null) {
        const persona = await this.deps.perfiles.findById(trabajadorId);
        if (persona?.activo !== true) throw AppError.validation({ trabajadorId: TRABAJADOR_INVALIDO_MESSAGE });
      }
      cobro = { ...(monto !== undefined && { monto }), ...(trabajadorId !== undefined && { trabajadorId }) };
    } else if (!yaCompletado) {
      cobro = { trabajadorId: actor.id }; // el empleado que completa un turno queda como quien lo hizo
    }

    // Nada cambia de verdad (por ejemplo, "Guardar" sin tocar nada): no se escribe, así el cliente no ve un cambio.
    const igualEstado = estado === undefined || estado === actual.estado;
    const igualCobro =
      (cobro.monto === undefined || cobro.monto === actual.monto) &&
      (cobro.trabajadorId === undefined || cobro.trabajadorId === (actual.trabajador?.id ?? null));
    if (igualEstado && notasInternas === undefined && igualCobro) return actual;

    const booking = await this.deps.bookings.actualizar(id, { ...(estado !== undefined && { estado }), ...nota, ...cobro }, now);
    if (booking === undefined) throw AppError.notFound(NOT_FOUND_MESSAGE);
    if (cobro.monto !== undefined || cobro.trabajadorId !== undefined) {
      this.deps.logger.info(`Cobro de turno actualizado id=${booking.id} por=${actor.id}`); // sin el importe
    }
    return booking;
  }

  /**
   * Cambia la fecha/franja confirmadas (null = volver a la pedida) y, si viene, el estado en la misma escritura.
   * 403 si el rol no puede reprogramar (o no puede pasar a ese estado); 400 si el turno está (o quedaría)
   * cancelado o completado, o si la fecha está fuera de rango; 404 si no existe.
   */
  async reprogramar(actor: UsuarioSesion, id: string, cambios: Reprogramacion): Promise<Booking> {
    const { estado, confirmada } = cambios;
    if (!puedeReprogramar(actor.rol)) throw AppError.forbidden(SIN_PERMISO_REPROGRAMAR_MESSAGE);
    if (estado !== undefined && !puedeCambiarEstado(actor.rol, estado)) throw AppError.forbidden(SOLO_COMPLETAR_MESSAGE);

    // Confirmar una fecha y a la vez cancelar o completar el turno no tiene sentido: se rechaza igual que
    // reprogramar uno que ya está cerrado.
    if (estado !== undefined && ESTADOS_CERRADOS.includes(estado)) throw AppError.validation(undefined, CERRADO_MESSAGE);

    const now = this.deps.now();
    if (confirmada !== null) {
      const { min, max } = fechaConfirmadaRange(now);
      if (confirmada.fecha < min) {
        throw AppError.validation({ fechaConfirmada: 'La fecha confirmada no puede ser anterior a hoy.' });
      }
      if (confirmada.fecha > max) {
        throw AppError.validation({
          fechaConfirmada: `La fecha confirmada puede ser hasta ${String(MAX_DAYS_CONFIRMADA)} días desde hoy.`,
        });
      }
    }

    let booking: Booking | undefined;
    try {
      booking = await this.deps.bookings.reprogramar(id, cambios, now);
    } catch (error) {
      if (error instanceof TurnoCerradoError) throw AppError.validation(undefined, CERRADO_MESSAGE);
      throw error;
    }
    if (booking === undefined) throw AppError.notFound(NOT_FOUND_MESSAGE);

    const destino = confirmada === null ? 'la pedida' : `${confirmada.fecha} ${confirmada.franja}`;
    this.deps.logger.info(
      `Turno reprogramado id=${booking.id} por=${actor.id} fecha=${destino}${estado === undefined ? '' : ` estado=${estado}`}`,
    );
    return booking;
  }
}
