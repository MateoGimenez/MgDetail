import { randomUUID } from 'node:crypto';
import { type RequestHandler, Router } from 'express';
import { bookingDateRange } from '../domain/booking-dates.js';
import type { PublicBooking } from '../domain/booking.js';
import type { Logger } from '../lib/logger.js';
import { createBookingSchema } from '../schemas/bookings.js';
import { parseOrThrow } from '../schemas/common.js';
import type { BookingService } from '../services/bookings.js';

export interface PublicBookingsDeps {
  bookings: BookingService;
  logger: Logger;
  now: () => Date;
  /** Rate limit de creación de turnos (máx. 5 por IP cada 15 min). */
  limiter: RequestHandler;
}

/** POST /api/bookings (público). Responde solo lo mínimo: nada de datos personales. */
export function publicBookingsRouter({ bookings, logger, now, limiter }: PublicBookingsDeps): Router {
  const router = Router();

  router.post('/', limiter, async (req, res) => {
    const moment = now();
    const schema = createBookingSchema(bookingDateRange(moment));
    // `req.body` es undefined si el pedido no trae body: se valida como objeto vacío para listar los campos faltantes.
    const { website, ...data } = parseOrThrow(schema, req.body ?? {});

    // Honeypot: un bot completó el campo oculto. Se responde igual que un éxito (para no darle señales) pero NO se guarda nada.
    if (website !== undefined && website.trim() !== '') {
      // Mismas respuestas que un pedido real: un servicio inexistente o inactivo también da 400 acá.
      await bookings.servicioReservable(data.servicioId);
      logger.info('Solicitud de turno descartada por honeypot');
      const decoy: PublicBooking = {
        id: randomUUID(),
        servicioId: data.servicioId,
        fechaPreferida: data.fechaPreferida,
        franja: data.franja,
        estado: 'pendiente',
      };
      res.status(201).json({ booking: decoy });
      return;
    }

    const booking = await bookings.createBooking(data, moment);
    res.status(201).json({ booking });
  });

  return router;
}
