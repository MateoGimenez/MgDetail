import { Router } from 'express';
import type { DiaEspecial, HorarioDia, NuevoDiaEspecial } from '../domain/disponibilidad.js';
import { puedeEditarDisponibilidad } from '../domain/permisos.js';
import { AppError } from '../lib/errors.js';
import { getUsuario, requirePermiso } from '../middleware/require-session.js';
import { parseOrThrow } from '../schemas/common.js';
import { diaEspecialSchema, fechaDiaEspecialSchema, horarioSemanalSchema } from '../schemas/disponibilidad.js';
import { DIA_ESPECIAL_NOT_FOUND, type DisponibilidadService } from '../services/disponibilidad.js';

const SIN_PERMISO_MESSAGE = 'Con tu rol solo podés ver la disponibilidad.';
const FECHA_MSG = 'La fecha tiene que ser una fecha válida con formato AAAA-MM-DD.';

const horarioJson = (dia: HorarioDia) => ({
  dia: dia.dia,
  abierto: dia.abierto,
  cupoManana: dia.cupoManana,
  cupoTarde: dia.cupoTarde,
});

const diaEspecialJson = (dia: DiaEspecial) => ({
  fecha: dia.fecha,
  abierto: dia.abierto,
  cupoManana: dia.cupoManana,
  cupoTarde: dia.cupoTarde,
  motivo: dia.motivo,
});

/**
 * Disponibilidad en el panel. Detrás de requireSession. Permisos (domain/permisos.ts):
 *  - ver: todos los roles;
 *  - cambiar el horario semanal y los días especiales: superadmin y admin (empleado => 403, antes de validar el body).
 */
export function adminDisponibilidadRouter(deps: { disponibilidad: DisponibilidadService }): Router {
  const { disponibilidad } = deps;
  const router = Router();
  const soloEditores = requirePermiso(puedeEditarDisponibilidad, SIN_PERMISO_MESSAGE);

  // GET /api/admin/disponibilidad => { horarioSemanal (lunes a domingo), diasEspeciales (de hoy en adelante) }
  router.get('/', async (_req, res) => {
    const { horarioSemanal, diasEspeciales } = await disponibilidad.panel();
    res.json({ horarioSemanal: horarioSemanal.map(horarioJson), diasEspeciales: diasEspeciales.map(diaEspecialJson) });
  });

  // PUT /api/admin/disponibilidad/horario-semanal { dias: [7] } => { horarioSemanal }
  router.put('/horario-semanal', soloEditores, async (req, res) => {
    const { dias } = parseOrThrow(horarioSemanalSchema, req.body ?? {});
    const horario = await disponibilidad.reemplazarHorario(getUsuario(res), dias);
    res.json({ horarioSemanal: horario.map(horarioJson) });
  });

  // PUT /api/admin/disponibilidad/dias-especiales/:fecha { abierto, cupoManana?, cupoTarde?, motivo? } => { dia }
  router.put('/dias-especiales/:fecha', soloEditores, async (req, res) => {
    const parsed = fechaDiaEspecialSchema.safeParse(req.params.fecha);
    if (!parsed.success) throw AppError.validation({ fecha: FECHA_MSG });
    const fecha = parsed.data;
    const body = parseOrThrow(diaEspecialSchema, req.body ?? {});
    const motivo = body.motivo ?? null;
    const nuevo: NuevoDiaEspecial =
      body.abierto && body.cupoManana != null && body.cupoTarde != null
        ? { fecha, abierto: true, cupoManana: body.cupoManana, cupoTarde: body.cupoTarde, motivo }
        : { fecha, abierto: false, motivo };
    const dia = await disponibilidad.guardarDiaEspecial(getUsuario(res), nuevo);
    res.json({ dia: diaEspecialJson(dia) });
  });

  // DELETE /api/admin/disponibilidad/dias-especiales/:fecha => 204 (vuelve al horario semanal)
  router.delete('/dias-especiales/:fecha', soloEditores, async (req, res) => {
    const parsed = fechaDiaEspecialSchema.safeParse(req.params.fecha);
    // Una fecha con formato inválido no puede tener regla: igual que una que no tiene (404).
    if (!parsed.success) throw AppError.notFound(DIA_ESPECIAL_NOT_FOUND);
    await disponibilidad.borrarDiaEspecial(getUsuario(res), parsed.data);
    res.status(204).end();
  });

  return router;
}
