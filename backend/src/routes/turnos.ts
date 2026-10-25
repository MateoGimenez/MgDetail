import { type RequestHandler, Router } from 'express';
import type { BookingRepository } from '../domain/booking.js';
import { AppError } from '../lib/errors.js';
import { bookingIdSchema } from '../schemas/admin.js';
import { NOT_FOUND_MESSAGE } from '../services/agenda.js';

/**
 * GET /api/turnos/:id (público): el seguimiento del turno, para la página /turno/<id>. El id es el UUID aleatorio
 * que devolvió POST /api/bookings (no se puede adivinar). Devuelve SOLO servicio, fecha y franja de agenda, estado y
 * cuándo se actualizó: nunca nombre, teléfono, email, vehículo, comentario ni notas. Un id inexistente y uno con
 * formato inválido dan el mismo 404. Tiene su propio rate limit por IP (contra el barrido de ids).
 */
export function publicTurnosRouter(deps: { bookings: BookingRepository; limiter: RequestHandler }): Router {
  const { bookings, limiter } = deps;
  const router = Router();

  router.get('/:id', limiter, async (req, res) => {
    // Que un buscador no indexe la respuesta aunque alguien publique el enlace (la página lleva su propio noindex).
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const parsed = bookingIdSchema.safeParse(req.params.id);
    const turno = parsed.success ? await bookings.seguimiento(parsed.data) : undefined;
    if (turno === undefined) throw AppError.notFound(NOT_FOUND_MESSAGE);
    res.json({
      turno: {
        id: turno.id,
        servicioNombre: turno.servicioNombre,
        fecha: turno.fecha,
        franja: turno.franja,
        estado: turno.estado,
        actualizadoEl: turno.actualizadoEl,
      },
    });
  });

  return router;
}
