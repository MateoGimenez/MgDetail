import { Router } from 'express';
import { puedeVerEstadisticas } from '../domain/permisos.js';
import { getUsuario, requirePermiso } from '../middleware/require-session.js';
import { estadisticasQuerySchema } from '../schemas/admin.js';
import { parseOrThrow } from '../schemas/common.js';
import type { EstadisticasService } from '../services/estadisticas.js';

/** Quita las claves sin valor (con exactOptionalPropertyTypes, desde: undefined no es lo mismo que no tener desde). */
function pedido(query: { desde?: string | undefined; hasta?: string | undefined }): { desde?: string; hasta?: string } {
  return {
    ...(query.desde !== undefined && { desde: query.desde }),
    ...(query.hasta !== undefined && { hasta: query.hasta }),
  };
}

/**
 * Estadísticas del taller (contrato: reportes/2026-10-26_15_estadisticas-y-permisos.md). Detrás de requireSession.
 *  - GET /api/admin/estadisticas: completas, con importes y de todo el equipo; solo admin y superadmin.
 *  - GET /api/admin/estadisticas/mias: los trabajos que completó quien pregunta, sin importes; todos los roles.
 */
export function adminEstadisticasRouter(deps: { estadisticas: EstadisticasService }): Router {
  const { estadisticas } = deps;
  const router = Router();

  router.get(
    '/',
    requirePermiso(puedeVerEstadisticas, 'Con tu rol no podés ver las estadísticas completas.'),
    async (req, res) => {
      res.json(await estadisticas.completas(pedido(parseOrThrow(estadisticasQuerySchema, req.query))));
    },
  );

  router.get('/mias', async (req, res) => {
    res.json(await estadisticas.mias(getUsuario(res).id, pedido(parseOrThrow(estadisticasQuerySchema, req.query))));
  });

  return router;
}
