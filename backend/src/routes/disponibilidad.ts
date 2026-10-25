import { Router } from 'express';
import { bookingDateRange } from '../domain/booking-dates.js';
import { parseOrThrow } from '../schemas/common.js';
import { disponibilidadQuerySchema } from '../schemas/disponibilidad.js';
import type { DisponibilidadService } from '../services/disponibilidad.js';

/**
 * GET /api/disponibilidad?desde=&hasta= (público): qué días se atiende y en qué franjas queda lugar, para el
 * formulario de reserva. Sin cantidades. Rango: dentro de hoy..hoy+60 (el mismo del alta), hasta 62 días; sin
 * parámetros, ese rango completo.
 */
export function publicDisponibilidadRouter(deps: { disponibilidad: DisponibilidadService; now: () => Date }): Router {
  const { disponibilidad, now } = deps;
  const router = Router();

  router.get('/', async (req, res) => {
    const { desde, hasta } = parseOrThrow(disponibilidadQuerySchema(bookingDateRange(now())), req.query);
    const dias = await disponibilidad.publica(desde, hasta);
    res.json({
      dias: dias.map((dia) => ({ fecha: dia.fecha, abierto: dia.abierto, manana: dia.manana, tarde: dia.tarde })),
    });
  });

  return router;
}
