import { Router } from 'express';
import type { Gasto } from '../domain/gastos.js';
import { puedeGestionarGastos } from '../domain/permisos.js';
import { AppError } from '../lib/errors.js';
import { getUsuario, requirePermiso } from '../middleware/require-session.js';
import { parseOrThrow } from '../schemas/common.js';
import {
  actualizarGastoSchema,
  crearGastoSchema,
  gastoIdSchema,
  listarGastosQuerySchema,
} from '../schemas/finanzas.js';
import { GASTO_NOT_FOUND, type GastoService } from '../services/gastos.js';

const SIN_PERMISO_MESSAGE = 'Con tu rol no podés ver ni cargar los gastos del taller.';

function toJson(gasto: Gasto) {
  return {
    id: gasto.id,
    fecha: gasto.fecha,
    categoria: gasto.categoria,
    descripcion: gasto.descripcion,
    monto: gasto.monto,
    proveedor: gasto.proveedor,
    origen: gasto.origen,
    creadoPor: gasto.creadoPor,
    createdAt: gasto.createdAt,
    updatedAt: gasto.updatedAt,
  };
}

/** Un id con formato inválido no puede existir: se trata igual que uno inexistente (404). */
function parseId(value: unknown): string {
  const parsed = gastoIdSchema.safeParse(value);
  if (!parsed.success) throw AppError.notFound(GASTO_NOT_FOUND);
  return parsed.data.toLowerCase();
}

/**
 * Gastos del taller (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md). Detrás de requireSession.
 * Solo superadmin y admin (domain/permisos.ts, puedeGestionarGastos): el empleado recibe 403 en todo, antes de validar.
 */
export function adminGastosRouter(deps: { gastos: GastoService }): Router {
  const { gastos } = deps;
  const router = Router();

  router.use(requirePermiso(puedeGestionarGastos, SIN_PERMISO_MESSAGE));

  // GET /api/admin/gastos?desde=&hasta=&categoria=&q=&limit=&offset= => { gastos, total, suma }
  router.get('/', async (req, res) => {
    const query = parseOrThrow(listarGastosQuerySchema, req.query);
    const resultado = await gastos.listar({
      ...(query.desde !== undefined && { desde: query.desde }),
      ...(query.hasta !== undefined && { hasta: query.hasta }),
      ...(query.categoria !== undefined && { categoria: query.categoria }),
      ...(query.q !== undefined && { q: query.q }),
      limit: query.limit,
      offset: query.offset,
    });
    res.json({ gastos: resultado.gastos.map(toJson), total: resultado.total, suma: resultado.suma });
  });

  // POST /api/admin/gastos { fecha, categoria, descripcion, monto, proveedor? } => 201 { gasto }
  router.post('/', async (req, res) => {
    const datos = parseOrThrow(crearGastoSchema, req.body ?? {});
    res.status(201).json({ gasto: toJson(await gastos.crear(getUsuario(res), datos)) });
  });

  // PATCH /api/admin/gastos/:id => { gasto }. 404 si no existe; 409 GASTO_DE_INVENTARIO si viene de una compra.
  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const cambios = parseOrThrow(actualizarGastoSchema, req.body ?? {});
    if (Object.keys(cambios).length === 0) {
      throw AppError.validation(
        undefined,
        'Indicá al menos un cambio: fecha, categoría, descripción, monto o proveedor.',
      );
    }
    res.json({ gasto: toJson(await gastos.actualizar(getUsuario(res), id, cambios)) });
  });

  // DELETE /api/admin/gastos/:id => 204
  router.delete('/:id', async (req, res) => {
    await gastos.borrar(getUsuario(res), parseId(req.params.id));
    res.status(204).end();
  });

  return router;
}
