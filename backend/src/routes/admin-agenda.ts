import { Router } from 'express';
import { agendaQuerySchema } from '../schemas/admin.js';
import { parseOrThrow } from '../schemas/common.js';
import type { AgendaService } from '../services/agenda.js';
import type { DisponibilidadService } from '../services/disponibilidad.js';

/**
 * Agenda de turnos en el panel (contrato: reportes/2026-10-22_08_agenda.md). Detrás de requireSession; la ven
 * todos los roles. Reprogramar es PATCH /api/admin/bookings/:id (ver admin-bookings.ts).
 */
export function adminAgendaRouter(deps: { agenda: AgendaService; disponibilidad: DisponibilidadService }): Router {
  const { agenda, disponibilidad } = deps;
  const router = Router();

  // GET /api/admin/agenda?desde=YYYY-MM-DD&hasta=YYYY-MM-DD => { turnos, cupos } (turnos no cancelados, por fecha y
  // franja de agenda y orden de llegada; cupos y ocupados de cada día del rango). Rango inclusivo de hasta 42 días.
  router.get('/', async (req, res) => {
    const { desde, hasta } = parseOrThrow(agendaQuerySchema, req.query);
    const turnos = await agenda.agenda(desde, hasta);
    const cupos = await disponibilidad.cupos(desde, hasta);
    res.json({
      turnos,
      cupos: cupos.map((dia) => ({
        fecha: dia.fecha,
        abierto: dia.abierto,
        cupoManana: dia.cupoManana,
        cupoTarde: dia.cupoTarde,
        ocupadosManana: dia.ocupadosManana,
        ocupadosTarde: dia.ocupadosTarde,
      })),
    });
  });

  return router;
}
