import { Router } from 'express';
import type { Perfil } from '../domain/perfil.js';
import { puedeGestionarUsuarios } from '../domain/permisos.js';
import { AppError } from '../lib/errors.js';
import { getUsuario, requirePermiso } from '../middleware/require-session.js';
import { parseOrThrow } from '../schemas/common.js';
import { createUsuarioSchema, updateUsuarioSchema, usuarioIdSchema } from '../schemas/usuarios.js';
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

function parseId(value: string | undefined): string {
  const parsed = usuarioIdSchema.safeParse(value);
  if (!parsed.success) throw AppError.notFound(NOT_FOUND_MESSAGE);
  return parsed.data.toLowerCase();
}

/** Gestión de usuarios del panel. Detrás de requireSession; todas las rutas exigen rol superadmin. */
export function adminUsuariosRouter(deps: { usuarios: UsuarioService }): Router {
  const { usuarios } = deps;
  const router = Router();

  router.use(requirePermiso(puedeGestionarUsuarios, 'Solo un superadmin puede gestionar usuarios.'));

  // GET /api/admin/usuarios => { usuarios: [...], gestionCuentas } (los más viejos primero).
  // gestionCuentas = false: falta SUPABASE_SECRET_KEY (no hay alta, baja ni cambio de email o contraseña).
  router.get('/', async (_req, res) => {
    res.json({ usuarios: (await usuarios.list()).map(toJson), gestionCuentas: usuarios.gestionCuentas });
  });

  // POST /api/admin/usuarios { email, password, nombre?, rol, activo } => 201 { usuario }
  router.post('/', async (req, res) => {
    const nuevo = parseOrThrow(createUsuarioSchema, req.body ?? {});
    const created = await usuarios.create(getUsuario(res), nuevo);
    res.status(201).json({ usuario: toJson(created) });
  });

  // PATCH /api/admin/usuarios/:id { rol?, activo?, nombre?, email?, password? } => { usuario }
  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const cambios = parseOrThrow(updateUsuarioSchema, req.body ?? {});
    // zod no agrega las claves que no vinieron: un body vacío queda como {}.
    if (Object.keys(cambios).length === 0) {
      throw AppError.validation(undefined, 'Indicá al menos un cambio: rol, activo, nombre, email o contraseña.');
    }
    const updated = await usuarios.update(getUsuario(res), id, cambios);
    res.json({ usuario: toJson(updated) });
  });

  // DELETE /api/admin/usuarios/:id => 204
  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    await usuarios.remove(getUsuario(res), id);
    res.status(204).end();
  });

  return router;
}
