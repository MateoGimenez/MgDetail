import type { Booking, BookingRepository, NewBooking, PublicBooking } from '../domain/booking.js';
import { type BookingNotifier, NotifyError } from '../domain/notifier.js';
import type { Servicio, ServicioRepository } from '../domain/servicios.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { SERVICIO_MSG } from '../schemas/bookings.js';

export interface BookingServiceDeps {
  bookings: BookingRepository;
  /** El catálogo (mgdetailing.servicios): decide qué servicios se pueden reservar. */
  servicios: ServicioRepository;
  logger: Logger;
  /** Aviso al dueño por cada turno nuevo. Sin notificador, no se avisa. */
  notifier?: BookingNotifier;
}

/**
 * Casos de uso de turnos que tienen lógica propia. Listar, cambiar el estado y borrar no pasan por acá:
 * serían pasamanos al repositorio sin nada que agregar.
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
   * Verifica el servicio contra el catálogo, guarda el turno nuevo (siempre "pendiente"), registra el alta en el
   * log y arma la respuesta pública.
   */
  async createBooking(data: NewBooking, now: Date): Promise<PublicBooking> {
    const servicio = await this.servicioReservable(data.servicioId);
    const saved = await this.deps.bookings.create(data, now);

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
