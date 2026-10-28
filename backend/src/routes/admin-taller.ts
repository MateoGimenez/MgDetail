import { Router } from 'express';
import { puedeEditarTaller } from '../domain/permisos.js';
import type { Taller } from '../domain/taller.js';
import { getUsuario, requirePermiso } from '../middleware/require-session.js';
import { parseOrThrow } from '../schemas/common.js';
import { guardarTallerSchema } from '../schemas/finanzas.js';
import type { TallerService } from '../services/taller.js';

const SIN_PERMISO_MESSAGE = 'Con tu rol no podés ver ni editar los datos del taller.';

function toJson(taller: Taller) {
  return {
    nombre: taller.nombre,
    telefono: taller.telefono,
    direccion: taller.direccion,
    instagram: taller.instagram,
    cuit: taller.cuit,
    leyendaPdf: taller.leyendaPdf,
  };
}

/**
 * Datos del taller que salen en los PDF (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md). Detrás
 * de requireSession. Solo superadmin y admin (domain/permisos.ts, puedeEditarTaller): el empleado recibe 403 en todo.
 */
export function adminTallerRouter(deps: { taller: TallerService }): Router {
  const { taller } = deps;
  const router = Router();

  router.use(requirePermiso(puedeEditarTaller, SIN_PERMISO_MESSAGE));

  // GET /api/admin/taller => { taller }
  router.get('/', async (_req, res) => {
    res.json({ taller: toJson(await taller.obtener()) });
  });

  // PUT /api/admin/taller { nombre, telefono?, direccion?, instagram?, cuit?, leyendaPdf? } => { taller }
  router.put('/', async (req, res) => {
    const datos = parseOrThrow(guardarTallerSchema, req.body ?? {});
    res.json({ taller: toJson(await taller.guardar(getUsuario(res), datos)) });
  });

  return router;
}
