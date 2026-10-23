import { Router } from 'express';
import type { BookingRepository } from '../domain/booking.js';
import { puedeBorrarTurnos, puedeCambiarEstado } from '../domain/permisos.js';
import { AppError } from '../lib/errors.js';
import { getUsuario } from '../middleware/require-session.js';
import { bookingIdSchema, listBookingsQuerySchema, updateBookingSchema } from '../schemas/admin.js';
import { parseOrThrow } from '../schemas/common.js';
import { type AgendaService, NOT_FOUND_MESSAGE, SOLO_COMPLETAR_MESSAGE } from '../services/agenda.js';

/** Un id con formato inválido no puede existir: se trata igual que uno inexistente (404). */
function parseBookingId(raw: string): string {
  const result = bookingIdSchema.safeParse(raw);
  if (!result.success) {
    throw AppError.notFound(NOT_FOUND_MESSAGE);
  }
  return result.data;
}

/**
 * Rutas de gestión de turnos. Se montan detrás de requireSession. Permisos (domain/permisos.ts):
 *  - listar: todos los roles;
 *  - cambiar el estado: empleado solo a "completado"; admin y superadmin, a cualquiera;
 *  - reprogramar (fecha/franja confirmadas): solo admin y superadmin;
 *  - borrar: solo admin y superadmin.
 */
export function adminBookingsRouter(deps: { bookings: BookingRepository; agenda: AgendaService; now: () => Date }): Router {
  const { bookings, agenda, now } = deps;
  const router = Router();

  // GET /api/admin/bookings?estado=&limit=&offset= => { bookings, total }, más nuevas primero
  router.get('/', async (req, res) => {
    const query = parseOrThrow(listBookingsQuerySchema, req.query);
    res.json(await bookings.list(query));
  });

  // PATCH /api/admin/bookings/:id { estado?, fechaConfirmada?, franjaConfirmada? } => { booking }
  router.patch('/:id', async (req, res) => {
    const id = parseBookingId(req.params.id);
    const { estado, confirmada } = parseOrThrow(updateBookingSchema, req.body ?? {});
    const usuario = getUsuario(res);

    // Con fecha/franja: reprogramar (y, si viene, el estado en la misma escritura).
    if (confirmada !== undefined) {
      const booking = await agenda.reprogramar(usuario, id, estado === undefined ? { confirmada } : { confirmada, estado });
      res.json({ booking });
      return;
    }

    // Solo el estado: las mismas reglas de siempre. El schema garantiza que viene estado si no viene la fecha.
    if (estado === undefined) throw AppError.validation();
    if (!puedeCambiarEstado(usuario.rol, estado)) {
      throw AppError.forbidden(SOLO_COMPLETAR_MESSAGE);
    }
    const booking = await bookings.updateEstado(id, estado, now());
    if (!booking) {
      throw AppError.notFound(NOT_FOUND_MESSAGE);
    }
    res.json({ booking });
  });

  // DELETE /api/admin/bookings/:id => 204
  router.delete('/:id', async (req, res) => {
    if (!puedeBorrarTurnos(getUsuario(res).rol)) {
      throw AppError.forbidden('Con tu rol no podés borrar turnos.');
    }
    const id = parseBookingId(req.params.id);
    if (!(await bookings.delete(id))) {
      throw AppError.notFound(NOT_FOUND_MESSAGE);
    }
    res.status(204).end();
  });

  return router;
}
