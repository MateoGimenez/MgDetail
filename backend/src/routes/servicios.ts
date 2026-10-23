import { Router } from 'express';
import { servicioPublico } from '../domain/servicios.js';
import type { ServicioService } from '../services/servicios.js';

/**
 * GET /api/servicios (público): el catálogo que muestra la landing. Solo los activos, por `orden` y después por `id`,
 * y solo los campos públicos (sin activo, orden ni updatedAt).
 */
export function publicServiciosRouter(deps: { servicios: ServicioService }): Router {
  const { servicios } = deps;
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ servicios: (await servicios.listActivos()).map(servicioPublico) });
  });

  return router;
}
