import { Router } from 'express';
import type { BookingRepository } from '../domain/booking.js';
import { TurnoConComprobanteError } from '../domain/comprobantes.js';
import { puedeBorrarTurnos, vistaDeTurno } from '../domain/permisos.js';
import { AppError } from '../lib/errors.js';
import { getUsuario } from '../middleware/require-session.js';
import { bookingIdSchema, listBookingsQuerySchema, updateBookingSchema } from '../schemas/admin.js';
import { parseOrThrow } from '../schemas/common.js';
import { type AgendaService, NOT_FOUND_MESSAGE } from '../services/agenda.js';

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
 *  - cobro (monto y trabajador): admin y superadmin cargan y corrigen; el empleado, al completar un turno, queda como
 *    trabajador (ver AgendaService.modificar);
 *  - notas internas, búsqueda e historial del cliente: todos los roles (la nota, también en turnos cerrados);
 *  - borrar: solo admin y superadmin.
 * El monto es plata: toda respuesta con turnos pasa por vistaDeTurno, que se lo saca al empleado.
 */
export function adminBookingsRouter(deps: { bookings: BookingRepository; agenda: AgendaService }): Router {
  const { bookings, agenda } = deps;
  const router = Router();

  // GET /api/admin/bookings?estado=&q=&cliente=&limit=&offset= => { bookings, total }, más nuevas primero
  router.get('/', async (req, res) => {
    const { estado, q, cliente, limit, offset } = parseOrThrow(listBookingsQuerySchema, req.query);
    const { rol } = getUsuario(res);
    const page = await bookings.list({
      limit,
      offset,
      ...(estado !== undefined && { estado }),
      ...(q !== undefined && { q }),
      ...(cliente !== undefined && { cliente }),
    });
    res.json({ bookings: page.bookings.map((booking) => vistaDeTurno(rol, booking)), total: page.total });
  });

  // PATCH /api/admin/bookings/:id { estado?, fechaConfirmada?, franjaConfirmada?, notasInternas?, monto?, trabajadorId? }
  // => { booking }
  router.patch('/:id', async (req, res) => {
    const id = parseBookingId(req.params.id);
    const cambios = parseOrThrow(updateBookingSchema, req.body ?? {});
    const usuario = getUsuario(res);
    const booking = await agenda.modificar(usuario, id, cambios);
    res.json({ booking: vistaDeTurno(usuario.rol, booking) });
  });

  // DELETE /api/admin/bookings/:id => 204
  router.delete('/:id', async (req, res) => {
    if (!puedeBorrarTurnos(getUsuario(res).rol)) {
      throw AppError.forbidden('Con tu rol no podés borrar turnos.');
    }
    const id = parseBookingId(req.params.id);
    try {
      if (!(await bookings.delete(id))) throw AppError.notFound(NOT_FOUND_MESSAGE);
    } catch (error) {
      if (error instanceof TurnoConComprobanteError) throw AppError.turnoConComprobante();
      throw error;
    }
    res.status(204).end();
  });

  return router;
}
