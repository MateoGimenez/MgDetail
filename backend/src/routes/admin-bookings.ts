import { Router } from 'express';
import type { BookingRepository } from '../domain/booking.js';
import { AppError } from '../lib/errors.js';
import { bookingIdSchema, listBookingsQuerySchema, updateEstadoSchema } from '../schemas/admin.js';
import { parseOrThrow } from '../schemas/common.js';

const NOT_FOUND_MESSAGE = 'No encontramos ese turno.';

/** Un id con formato inválido no puede existir: se trata igual que uno inexistente (404). */
function parseBookingId(raw: string): string {
  const result = bookingIdSchema.safeParse(raw);
  if (!result.success) {
    throw AppError.notFound(NOT_FOUND_MESSAGE);
  }
  return result.data;
}

/**
 * Rutas de gestión de turnos. Se montan detrás de requireAdmin.
 * Listar, cambiar el estado y borrar van directo al repositorio: no hay lógica de negocio que justifique un servicio.
 */
export function adminBookingsRouter(deps: { bookings: BookingRepository; now: () => Date }): Router {
  const { bookings, now } = deps;
  const router = Router();

  // GET /api/admin/bookings?estado=&limit=&offset= => { bookings, total }, más nuevas primero
  router.get('/', async (req, res) => {
    const query = parseOrThrow(listBookingsQuerySchema, req.query);
    res.json(await bookings.list(query));
  });

  // PATCH /api/admin/bookings/:id { estado } => { booking }
  router.patch('/:id', async (req, res) => {
    const id = parseBookingId(req.params.id);
    const { estado } = parseOrThrow(updateEstadoSchema, req.body ?? {});
    const booking = await bookings.updateEstado(id, estado, now());
    if (!booking) {
      throw AppError.notFound(NOT_FOUND_MESSAGE);
    }
    res.json({ booking });
  });

  // DELETE /api/admin/bookings/:id => 204
  router.delete('/:id', async (req, res) => {
    const id = parseBookingId(req.params.id);
    if (!(await bookings.delete(id))) {
      throw AppError.notFound(NOT_FOUND_MESSAGE);
    }
    res.status(204).end();
  });

  return router;
}
