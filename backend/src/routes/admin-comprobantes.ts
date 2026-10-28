import { type RequestHandler, Router } from 'express';
import type { Comprobante } from '../domain/comprobantes.js';
import { puedeEmitirComprobantes } from '../domain/permisos.js';
import { AppError } from '../lib/errors.js';
import { getUsuario, requirePermiso } from '../middleware/require-session.js';
import { generarPdfComprobante, nombreDeArchivo } from '../pdf/documentos.js';
import { parseOrThrow } from '../schemas/common.js';
import { documentoIdSchema, emitirComprobanteSchema } from '../schemas/documentos.js';
import { COMPROBANTE_ID_NOT_FOUND, type ComprobanteService, TURNO_NOT_FOUND } from '../services/comprobantes.js';
import type { TallerService } from '../services/taller.js';
import { enviarPdf } from './admin-presupuestos.js';

const SIN_PERMISO_MESSAGE = 'Con tu rol no podés emitir ni ver comprobantes.';

function toJson(c: Comprobante) {
  return {
    id: c.id,
    numero: c.numero,
    codigo: c.codigo,
    fechaEmision: c.fechaEmision,
    formaPago: c.formaPago,
    monto: c.monto,
    clienteNombre: c.clienteNombre,
    servicioNombre: c.servicioNombre,
    vehiculo: c.vehiculo,
    notas: c.notas,
  };
}

function parseId(value: unknown, mensaje: string): string {
  const parsed = documentoIdSchema.safeParse(value);
  if (!parsed.success) throw AppError.notFound(mensaje);
  return parsed.data.toLowerCase();
}

/**
 * Comprobantes de pago (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md). Se monta en /api/admin
 * porque cuelga de dos prefijos: /bookings/:id/comprobante y /comprobantes/:id/pdf. Solo superadmin y admin
 * (puedeEmitirComprobantes): el empleado recibe 403 antes de validar. NO son facturas.
 */
export function adminComprobantesRouter(deps: {
  comprobantes: ComprobanteService;
  taller: TallerService;
  pdfLimiter: RequestHandler;
}): Router {
  const { comprobantes, taller, pdfLimiter } = deps;
  const router = Router();
  const permiso = requirePermiso(puedeEmitirComprobantes, SIN_PERMISO_MESSAGE);

  // POST /api/admin/bookings/:id/comprobante { formaPago, notas? } => 201 { comprobante } (200 si ya existía)
  router.post('/bookings/:id/comprobante', permiso, async (req, res) => {
    const bookingId = parseId(req.params.id, TURNO_NOT_FOUND);
    const datos = parseOrThrow(emitirComprobanteSchema, req.body ?? {});
    const { comprobante, creado } = await comprobantes.emitir(getUsuario(res), bookingId, datos);
    res.status(creado ? 201 : 200).json({ comprobante: toJson(comprobante) });
  });

  // GET /api/admin/bookings/:id/comprobante => { comprobante } o 404
  router.get('/bookings/:id/comprobante', permiso, async (req, res) => {
    res.json({ comprobante: toJson(await comprobantes.deTurno(parseId(req.params.id, TURNO_NOT_FOUND))) });
  });

  // GET /api/admin/comprobantes/:id/pdf => application/pdf
  router.get('/comprobantes/:id/pdf', permiso, pdfLimiter, async (req, res) => {
    const comprobante = await comprobantes.obtener(parseId(req.params.id, COMPROBANTE_ID_NOT_FOUND));
    const pdf = await generarPdfComprobante(comprobante, await taller.obtener());
    enviarPdf(res, nombreDeArchivo('Comprobante', comprobante.codigo), pdf);
  });

  return router;
}
