import { Router } from 'express';
import { puedeEditarCatalogo } from '../domain/permisos.js';
import type { Servicio } from '../domain/servicios.js';
import { AppError } from '../lib/errors.js';
import { getUsuario, requirePermiso } from '../middleware/require-session.js';
import { parseOrThrow } from '../schemas/common.js';
import {
  createServicioSchema,
  ordenServiciosSchema,
  servicioIdSchema,
  updateServicioSchema,
} from '../schemas/servicios.js';
import type { ServicioService } from '../services/servicios.js';

const NOT_FOUND_MESSAGE = 'No encontramos ese servicio.';
const SIN_PERMISO_MESSAGE = 'Con tu rol solo podés ver el catálogo de servicios.';

function toJson(servicio: Servicio) {
  return {
    id: servicio.id,
    nombre: servicio.nombre,
    resumen: servicio.resumen,
    descripcion: servicio.descripcion,
    incluye: servicio.incluye,
    glosario: servicio.glosario,
    duracion: servicio.duracion,
    precioDesde: servicio.precioDesde,
    destacado: servicio.destacado,
    activo: servicio.activo,
    orden: servicio.orden,
    updatedAt: servicio.updatedAt,
  };
}

/** Un id con formato inválido no puede existir: se trata igual que uno inexistente (404). */
function parseId(value: unknown): string {
  const parsed = servicioIdSchema.safeParse(value);
  if (!parsed.success) throw AppError.notFound(NOT_FOUND_MESSAGE);
  return parsed.data;
}

/**
 * Catálogo de servicios en el panel. Detrás de requireSession. Permisos (domain/permisos.ts):
 *  - ver: todos los roles;
 *  - crear, editar y reordenar: superadmin y admin (empleado => 403, antes de validar el body).
 */
export function adminServiciosRouter(deps: { servicios: ServicioService }): Router {
  const { servicios } = deps;
  const router = Router();
  const soloEditores = requirePermiso(puedeEditarCatalogo, SIN_PERMISO_MESSAGE);

  // GET /api/admin/servicios => { servicios } (activos e inactivos, por orden y después por id)
  router.get('/', async (_req, res) => {
    res.json({ servicios: (await servicios.list()).map(toJson) });
  });

  // POST /api/admin/servicios { id, nombre, resumen, descripcion, incluye?, glosario?, duracion?, precioDesde?,
  // destacado?, activo? } => 201 { servicio }. orden se asigna solo (al final).
  router.post('/', soloEditores, async (req, res) => {
    const nuevo = parseOrThrow(createServicioSchema, req.body ?? {});
    const creado = await servicios.create(getUsuario(res), nuevo);
    res.status(201).json({ servicio: toJson(creado) });
  });

  // PUT /api/admin/servicios/orden { ids } => { servicios }. Antes de "/:id" por claridad (PATCH y PUT no chocan).
  router.put('/orden', soloEditores, async (req, res) => {
    const { ids } = parseOrThrow(ordenServiciosSchema, req.body ?? {});
    res.json({ servicios: (await servicios.reorder(getUsuario(res), ids)).map(toJson) });
  });

  // PATCH /api/admin/servicios/:id { nombre?, resumen?, ... } => { servicio }
  router.patch('/:id', soloEditores, async (req, res) => {
    const id = parseId(req.params.id);
    const cambios = parseOrThrow(updateServicioSchema, req.body ?? {});
    // zod no agrega las claves que no vinieron: un body vacío queda como {}.
    if (Object.keys(cambios).length === 0) {
      throw AppError.validation(
        undefined,
        'Indicá al menos un cambio: nombre, resumen, descripción, incluye, glosario, duración, precio, destacado o activo.',
      );
    }
    const actualizado = await servicios.update(getUsuario(res), id, cambios);
    res.json({ servicio: toJson(actualizado) });
  });

  return router;
}
