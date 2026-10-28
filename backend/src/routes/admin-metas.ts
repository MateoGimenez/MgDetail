import { Router } from 'express';
import { puedeGestionarMetas } from '../domain/permisos.js';
import { getUsuario, requirePermiso } from '../middleware/require-session.js';
import { parseOrThrow } from '../schemas/common.js';
import { guardarMetaSchema, listarMetasQuerySchema, mesSchema } from '../schemas/finanzas.js';
import type { MetaService } from '../services/metas.js';
import { AppError } from '../lib/errors.js';

const SIN_PERMISO_MESSAGE = 'Con tu rol no podés ver ni fijar las metas mensuales.';

/** Un mes con formato inválido en la URL: 400 con el campo "mes". */
function parseMes(value: unknown): string {
  const parsed = mesSchema.safeParse(value);
  if (!parsed.success) throw AppError.validation({ mes: parsed.error.issues[0]?.message ?? 'Mes inválido.' });
  return parsed.data;
}

/**
 * Metas mensuales (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md). Detrás de requireSession.
 * Solo superadmin y admin (domain/permisos.ts, puedeGestionarMetas): el empleado recibe 403 en todo, antes de validar.
 */
export function adminMetasRouter(deps: { metas: MetaService }): Router {
  const { metas } = deps;
  const router = Router();

  router.use(requirePermiso(puedeGestionarMetas, SIN_PERMISO_MESSAGE));

  // GET /api/admin/metas/actual => { mes, meta, progreso }. Antes de "/:mes" por claridad.
  router.get('/actual', async (_req, res) => {
    res.json(await metas.actual());
  });

  // GET /api/admin/metas?anio=YYYY => { metas: [{ mes, ingresosObjetivo, trabajosObjetivo, ingresos, trabajos, cumplida }] }
  router.get('/', async (req, res) => {
    const { anio } = parseOrThrow(listarMetasQuerySchema, req.query);
    res.json({ metas: await metas.delAnio(anio) });
  });

  // PUT /api/admin/metas/:mes { ingresosObjetivo?, trabajosObjetivo? } => { meta }
  router.put('/:mes', async (req, res) => {
    const mes = parseMes(req.params.mes);
    const cambios = parseOrThrow(guardarMetaSchema, req.body ?? {});
    const meta = await metas.guardar(getUsuario(res), mes, cambios);
    res.json({
      meta: { mes: meta.mes, ingresosObjetivo: meta.ingresosObjetivo, trabajosObjetivo: meta.trabajosObjetivo },
    });
  });

  // DELETE /api/admin/metas/:mes => 204 (404 si ese mes no tenía meta)
  router.delete('/:mes', async (req, res) => {
    await metas.borrar(getUsuario(res), parseMes(req.params.mes));
    res.status(204).end();
  });

  return router;
}
