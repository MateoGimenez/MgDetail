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
 *  - notas internas, búsqueda e historial del cliente: todos los roles (la nota, también en turnos cerrados);
 *  - borrar: solo admin y superadmin.
 */
export function adminBookingsRouter(deps: { bookings: BookingRepository; agenda: AgendaService; now: () => Date }): Router {
  const { bookings, agenda, now } = deps;
  const router = Router();

  // GET /api/admin/bookings?estado=&q=&cliente=&limit=&offset= => { bookings, total }, más nuevas primero
  router.get('/', async (req, res) => {
    const { estado, q, cliente, limit, offset } = parseOrThrow(listBookingsQuerySchema, req.query);
    res.json(
      await bookings.list({
        limit,
        offset,
        ...(estado !== undefined && { estado }),
        ...(q !== undefined && { q }),
        ...(cliente !== undefined && { cliente }),
      }),
    );
  });

  // PATCH /api/admin/bookings/:id { estado?, fechaConfirmada?, franjaConfirmada?, notasInternas? } => { booking }
  router.patch('/:id', async (req, res) => {
    const id = parseBookingId(req.params.id);
    const { estado, confirmada, notasInternas } = parseOrThrow(updateBookingSchema, req.body ?? {});
    const usuario = getUsuario(res);
    // La nota la puede cambiar cualquier rol (domain/permisos.ts), y viaja en la misma escritura que el resto.
    const nota = notasInternas === undefined ? {} : { notasInternas };

    // Con fecha/franja: reprogramar (y, si vienen, el estado y la nota en la misma escritura).
    if (confirmada !== undefined) {
      const booking = await agenda.reprogramar(usuario, id, {
        confirmada,
        ...(estado !== undefined && { estado }),
        ...nota,
      });
      res.json({ booking });
      return;
    }

    // Estado y/o nota. El estado, con las mismas reglas de siempre; la nota, aunque el turno esté cerrado.
    if (estado !== undefined && !puedeCambiarEstado(usuario.rol, estado)) {
      throw AppError.forbidden(SOLO_COMPLETAR_MESSAGE);
    }
    const booking = await bookings.actualizar(id, { ...(estado !== undefined && { estado }), ...nota }, now());
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
