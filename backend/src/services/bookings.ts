import { type Booking, type BookingRepository, type NewBooking, type PublicBooking, seguimientoPath } from '../domain/booking.js';
import {
  DiaCerradoError,
  type DisponibilidadRepository,
  FranjaLlenaError,
  verificarLugar,
} from '../domain/disponibilidad.js';
import { type BookingNotifier, NotifyError } from '../domain/notifier.js';
import type { Servicio, ServicioRepository } from '../domain/servicios.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { SERVICIO_MSG } from '../schemas/bookings.js';

export interface BookingServiceDeps {
  bookings: BookingRepository;
  /** El catálogo (mgdetailing.servicios): decide qué servicios se pueden reservar. */
  servicios: ServicioRepository;
  /** Horario semanal, días especiales y cupos: decide qué días y franjas se pueden pedir. */
  disponibilidad: DisponibilidadRepository;
  logger: Logger;
  /** Aviso al dueño por cada turno nuevo. Sin notificador, no se avisa. */
  notifier?: BookingNotifier;
}

/** 400 en fechaPreferida: el día está cerrado (horario semanal o día especial). */
export const DIA_CERRADO_MESSAGE = 'Ese día no tomamos turnos. Elegí otro.';

/** Errores de disponibilidad del dominio => respuestas del contrato. Cualquier otro error pasa tal cual. */
function errorDeDisponibilidad(error: unknown): unknown {
  if (error instanceof DiaCerradoError) return AppError.validation({ fechaPreferida: DIA_CERRADO_MESSAGE }, DIA_CERRADO_MESSAGE);
  if (error instanceof FranjaLlenaError) return AppError.franjaLlena();
  return error;
}

/**
 * Casos de uso de turnos que tienen lógica propia. Listar, cambiar el estado y borrar no pasan por acá:
 * serían pasamanos al repositorio sin nada que agregar. La agenda y la reprogramación están en services/agenda.ts.
 */
export class BookingService {
  constructor(private readonly deps: BookingServiceDeps) {}

  /**
   * El servicio del catálogo si existe y está activo. Si no, 400 VALIDATION_ERROR en el campo servicioId (mismo
   * mensaje que un id mal formado: al público no le importa la diferencia).
   */
  async servicioReservable(id: string): Promise<Servicio> {
    const servicio = await this.deps.servicios.findById(id);
    if (!servicio?.activo) {
      throw AppError.validation({ servicioId: SERVICIO_MSG });
    }
    return servicio;
  }

  /**
   * Verifica (sin guardar ni bloquear) que el día esté abierto y la franja tenga lugar: 400 en fechaPreferida o
   * 409 FRANJA_LLENA. Lo usa el honeypot para responder lo mismo que un pedido real.
   */
  async verificarDisponible(fecha: string, franja: NewBooking['franja']): Promise<void> {
    const [cupo] = await this.deps.disponibilidad.cupos(fecha, fecha);
    if (cupo === undefined) return;
    try {
      verificarLugar(cupo, franja);
    } catch (error) {
      throw errorDeDisponibilidad(error);
    }
  }

  /**
   * Verifica el servicio contra el catálogo, guarda el turno nuevo (siempre "pendiente") solo si el día está abierto
   * y la franja tiene lugar (con la fecha bloqueada: sin carreras por el último lugar), registra el alta en el log y
   * arma la respuesta pública.
   */
  async createBooking(data: NewBooking, now: Date): Promise<PublicBooking> {
    const servicio = await this.servicioReservable(data.servicioId);
    let saved: Booking;
    try {
      saved = await this.deps.bookings.reservar(data, now);
    } catch (error) {
      throw errorDeDisponibilidad(error);
    }

    // Solo id + servicio + fecha: sin nombre, teléfono, email ni comentario.
    this.deps.logger.info(`Turno creado id=${saved.id} servicio="${servicio.nombre}" fecha=${saved.fechaPreferida}`);

    // Fire-and-forget: el aviso nunca demora ni hace fallar la respuesta al cliente.
    void this.notify(saved, servicio.nombre);

    // Respuesta pública mínima: nada de datos personales ni timestamps.
    return {
      id: saved.id,
      servicioId: data.servicioId,
      fechaPreferida: saved.fechaPreferida,
      franja: saved.franja,
      estado: 'pendiente',
      seguimientoUrl: seguimientoPath(saved.id),
    };
  }

  /** Nunca rechaza. Solo se loguea el id del turno y el status: ni mensaje, ni datos personales, ni URL. */
  private async notify(booking: Booking, servicioNombre: string): Promise<void> {
    const { notifier, logger } = this.deps;
    if (notifier === undefined) return;
    try {
      await notifier.notifyNewBooking(booking, servicioNombre);
      logger.info(`Aviso de turno enviado id=${booking.id}`);
    } catch (error) {
      const detail = error instanceof NotifyError ? `status ${String(error.status)}` : 'sin respuesta';
      logger.warn(`Aviso de turno falló id=${booking.id} (${detail})`);
    }
  }
}
