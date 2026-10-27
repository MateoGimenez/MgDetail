import { Router } from 'express';
import type { PerfilRepository } from '../domain/perfil.js';
import { CAPACIDADES } from '../domain/permisos.js';
import { getUsuario } from '../middleware/require-session.js';

/**
 * Qué puede hacer cada rol. Detrás de requireSession; lo ve cualquier rol (saber qué se puede y qué no no es un
 * secreto). La matriz sale de CAPACIDADES (domain/permisos.ts), la misma lista de la que salen las funciones con las
 * que la API decide; las descripciones de los roles, de mgdetailing.roles.
 */
export function adminPermisosRouter(deps: { perfiles: PerfilRepository }): Router {
  const { perfiles } = deps;
  const router = Router();

  // GET /api/admin/permisos => { roles: [{ id, nombre, descripcion }], capacidades: [...], tuRol }
  router.get('/', async (_req, res) => {
    const usuario = getUsuario(res);
    res.json({
      roles: await perfiles.roles(),
      capacidades: CAPACIDADES.map((capacidad) => ({
        id: capacidad.id,
        grupo: capacidad.grupo,
        texto: capacidad.texto,
        roles: capacidad.roles,
        ...('matiz' in capacidad && { matiz: capacidad.matiz }),
      })),
      tuRol: usuario.rol,
    });
  });

  return router;
}
