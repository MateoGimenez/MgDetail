import { Router } from 'express';
import type { PerfilRepository } from '../domain/perfil.js';
import { puedeRegistrarCobro } from '../domain/permisos.js';
import { requirePermiso } from '../middleware/require-session.js';

/**
 * Quién puede figurar como "el que hizo el trabajo". Detrás de requireSession; solo admin y superadmin (el empleado
 * no elige a otra persona: al completar un turno queda él).
 */
export function adminTrabajadoresRouter(deps: { perfiles: PerfilRepository }): Router {
  const { perfiles } = deps;
  const router = Router();

  router.use(requirePermiso(puedeRegistrarCobro, 'Con tu rol no podés elegir quién hizo un trabajo.'));

  // GET /api/admin/trabajadores => { trabajadores: [{ id, nombre, rol }] }: personas ACTIVAS de cualquier rol, por nombre.
  router.get('/', async (_req, res) => {
    res.json({ trabajadores: await perfiles.trabajadores() });
  });

  return router;
}
