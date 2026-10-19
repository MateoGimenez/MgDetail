import { Router } from 'express';
import type { Perfil } from '../domain/perfil.js';
import { puedeGestionarUsuarios } from '../domain/permisos.js';
import { AppError } from '../lib/errors.js';
import { getUsuario, requirePermiso } from '../middleware/require-session.js';
import { parseOrThrow } from '../schemas/common.js';
import { updateUsuarioSchema, usuarioIdSchema } from '../schemas/usuarios.js';
import type { UsuarioService } from '../services/usuarios.js';

const NOT_FOUND_MESSAGE = 'No encontramos ese usuario.';

function toJson(perfil: Perfil) {
  return {
    id: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre,
    rol: perfil.rol,
    activo: perfil.activo,
    createdAt: perfil.createdAt,
    updatedAt: perfil.updatedAt,
  };
}

/** Gestión de usuarios del panel. Detrás de requireSession; todas las rutas exigen rol superadmin. */
export function adminUsuariosRouter(deps: { usuarios: UsuarioService }): Router {
  const { usuarios } = deps;
  const router = Router();

  router.use(requirePermiso(puedeGestionarUsuarios, 'Solo un superadmin puede gestionar usuarios.'));

  // GET /api/admin/usuarios => { usuarios: [...] } (los más viejos primero)
  router.get('/', async (_req, res) => {
    res.json({ usuarios: (await usuarios.list()).map(toJson) });
  });

  // PATCH /api/admin/usuarios/:id { rol?, activo?, nombre? } => { usuario }
  router.patch('/:id', async (req, res) => {
    const parsedId = usuarioIdSchema.safeParse(req.params.id);
    if (!parsedId.success) throw AppError.notFound(NOT_FOUND_MESSAGE);
    const cambios = parseOrThrow(updateUsuarioSchema, req.body ?? {});
    if (cambios.rol === undefined && cambios.activo === undefined && cambios.nombre === undefined) {
      throw AppError.validation(undefined, 'Indicá al menos un cambio: rol, activo o nombre.');
    }
    const updated = await usuarios.update(getUsuario(res), parsedId.data.toLowerCase(), {
      ...(cambios.rol !== undefined && { rol: cambios.rol }),
      ...(cambios.activo !== undefined && { activo: cambios.activo }),
      ...(cambios.nombre !== undefined && { nombre: cambios.nombre }),
    });
    res.json({ usuario: toJson(updated) });
  });

  return router;
}
