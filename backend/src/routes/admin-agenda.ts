import { Router } from 'express';
import { agendaQuerySchema } from '../schemas/admin.js';
import { parseOrThrow } from '../schemas/common.js';
import type { AgendaService } from '../services/agenda.js';

/**
 * Agenda de turnos en el panel (contrato: reportes/2026-10-22_08_agenda.md). Detrás de requireSession; la ven
 * todos los roles. Reprogramar es PATCH /api/admin/bookings/:id (ver admin-bookings.ts).
 */
export function adminAgendaRouter(deps: { agenda: AgendaService }): Router {
  const { agenda } = deps;
  const router = Router();

  // GET /api/admin/agenda?desde=YYYY-MM-DD&hasta=YYYY-MM-DD => { turnos } (no cancelados, por fecha y franja de
  // agenda y orden de llegada). Rango inclusivo de hasta 42 días.
  router.get('/', async (req, res) => {
    const { desde, hasta } = parseOrThrow(agendaQuerySchema, req.query);
    res.json({ turnos: await agenda.agenda(desde, hasta) });
  });

  return router;
}
