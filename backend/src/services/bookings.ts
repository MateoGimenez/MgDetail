import type { BookingRepository, NewBooking, PublicBooking } from '../domain/booking.js';
import { nombreDeServicio } from '../domain/servicios.js';
import type { Logger } from '../lib/logger.js';

export interface BookingServiceDeps {
  bookings: BookingRepository;
  logger: Logger;
}

/**
 * Casos de uso de turnos que tienen lógica propia. Listar, cambiar el estado y borrar no pasan por acá:
 * serían pasamanos al repositorio sin nada que agregar.
 */
export class BookingService {
  constructor(private readonly deps: BookingServiceDeps) {}

  /** Guarda un turno nuevo (siempre "pendiente"), registra el alta en el log y arma la respuesta pública. */
  async createBooking(data: NewBooking, now: Date): Promise<PublicBooking> {
    const saved = await this.deps.bookings.create(data, now);

    // Solo id + servicio + fecha: sin nombre, teléfono, email ni comentario.
    this.deps.logger.info(
      `Turno creado id=${saved.id} servicio="${nombreDeServicio(data.servicioId)}" fecha=${saved.fechaPreferida}`,
    );

    // Respuesta pública mínima: nada de datos personales ni timestamps.
    return {
      id: saved.id,
      servicioId: data.servicioId,
      fechaPreferida: saved.fechaPreferida,
      franja: saved.franja,
      estado: 'pendiente',
    };
  }
}
