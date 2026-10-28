import { type RequestHandler, type Response, Router } from 'express';
import { puedeArmarPresupuestos } from '../domain/permisos.js';
import type { Presupuesto } from '../domain/presupuestos.js';
import { AppError } from '../lib/errors.js';
import { nombreDeArchivo, generarPdfPresupuesto } from '../pdf/documentos.js';
import { getUsuario, requirePermiso } from '../middleware/require-session.js';
import { parseOrThrow } from '../schemas/common.js';
import {
  actualizarPresupuestoSchema,
  crearPresupuestoSchema,
  documentoIdSchema,
  listarPresupuestosQuerySchema,
} from '../schemas/documentos.js';
import { PRESUPUESTO_NOT_FOUND, type PresupuestoService } from '../services/presupuestos.js';
import type { TallerService } from '../services/taller.js';

const SIN_PERMISO_MESSAGE = 'Con tu rol no podés ver ni armar presupuestos.';

function toJson(p: Presupuesto) {
  return {
    id: p.id,
    numero: p.numero,
    codigo: p.codigo,
    clienteNombre: p.clienteNombre,
    clienteTelefono: p.clienteTelefono,
    vehiculo: p.vehiculo,
    items: p.items.map((item) => ({
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
    })),
    descuento: p.descuento,
    subtotal: p.subtotal,
    total: p.total,
    validezDias: p.validezDias,
    venceEl: p.venceEl,
    estado: p.estado,
    vencido: p.vencido,
    notas: p.notas,
    turnoId: p.turnoId,
    creadoPor: p.creadoPor,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** Un id con formato inválido no puede existir: se trata igual que uno inexistente (404). */
function parseId(value: unknown): string {
  const parsed = documentoIdSchema.safeParse(value);
  if (!parsed.success) throw AppError.notFound(PRESUPUESTO_NOT_FOUND);
  return parsed.data.toLowerCase();
}

/** Respuesta de un PDF: tipo, nombre de archivo seguro, sin caché y sin que el navegador adivine el tipo. */
export function enviarPdf(res: Response, nombre: string, contenido: Buffer): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', String(contenido.length));
  res.status(200).end(contenido);
}

/**
 * Presupuestos (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md). Detrás de requireSession. Solo
 * superadmin y admin (domain/permisos.ts, puedeArmarPresupuestos): el empleado recibe 403 en todo, antes de validar.
 */
export function adminPresupuestosRouter(deps: {
  presupuestos: PresupuestoService;
  taller: TallerService;
  pdfLimiter: RequestHandler;
}): Router {
  const { presupuestos, taller, pdfLimiter } = deps;
  const router = Router();

  router.use(requirePermiso(puedeArmarPresupuestos, SIN_PERMISO_MESSAGE));

  // GET /api/admin/presupuestos?estado=&q=&limit=&offset= => { presupuestos, total }
  router.get('/', async (req, res) => {
    const query = parseOrThrow(listarPresupuestosQuerySchema, req.query);
    const lista = await presupuestos.listar({
      ...(query.estado !== undefined && { estado: query.estado }),
      ...(query.q !== undefined && { q: query.q }),
      limit: query.limit,
      offset: query.offset,
    });
    res.json({ presupuestos: lista.presupuestos.map(toJson), total: lista.total });
  });

  // POST /api/admin/presupuestos => 201 { presupuesto }
  router.post('/', async (req, res) => {
    const datos = parseOrThrow(crearPresupuestoSchema, req.body ?? {});
    res.status(201).json({ presupuesto: toJson(await presupuestos.crear(getUsuario(res), datos)) });
  });

  // GET /api/admin/presupuestos/:id => { presupuesto }
  router.get('/:id', async (req, res) => {
    res.json({ presupuesto: toJson(await presupuestos.obtener(parseId(req.params.id))) });
  });

  // GET /api/admin/presupuestos/:id/pdf => application/pdf
  router.get('/:id/pdf', pdfLimiter, async (req, res) => {
    const presupuesto = await presupuestos.obtener(parseId(req.params.id));
    const pdf = await generarPdfPresupuesto(presupuesto, await taller.obtener());
    enviarPdf(res, nombreDeArchivo('Presupuesto', presupuesto.codigo), pdf);
  });

  // PATCH /api/admin/presupuestos/:id => { presupuesto }
  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const cambios = parseOrThrow(actualizarPresupuestoSchema, req.body ?? {});
    if (Object.keys(cambios).length === 0) {
      throw AppError.validation(undefined, 'Indicá al menos un cambio.');
    }
    res.json({ presupuesto: toJson(await presupuestos.actualizar(getUsuario(res), id, cambios)) });
  });

  // DELETE /api/admin/presupuestos/:id => 204 (409 PRESUPUESTO_ACEPTADO si está aceptado)
  router.delete('/:id', async (req, res) => {
    await presupuestos.borrar(getUsuario(res), parseId(req.params.id));
    res.status(204).end();
  });

  return router;
}
