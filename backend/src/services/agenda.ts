import {
  type Booking,
  type BookingRepository,
  ESTADOS_CERRADOS,
  type Reprogramacion,
  TurnoCerradoError,
} from '../domain/booking.js';
import { fechaConfirmadaRange, MAX_DAYS_CONFIRMADA } from '../domain/booking-dates.js';
import { puedeCambiarEstado, puedeReprogramar } from '../domain/permisos.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { UsuarioSesion } from './auth.js';

export interface AgendaServiceDeps {
  bookings: BookingRepository;
  logger: Logger;
  now: () => Date;
}

export const NOT_FOUND_MESSAGE = 'No encontramos ese turno.';
export const SOLO_COMPLETAR_MESSAGE = 'Con tu rol solo podés marcar los turnos como completados.';
export const SIN_PERMISO_REPROGRAMAR_MESSAGE = 'Con tu rol no podés cambiar la fecha de un turno.';
const CERRADO_MESSAGE = 'No se puede cambiar la fecha de un turno cancelado o completado.';

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
