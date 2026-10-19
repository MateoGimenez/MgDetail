import { type CambiosPerfil, type Perfil, type PerfilRepository, SinSuperadminError } from '../domain/perfil.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { UsuarioSesion } from './auth.js';

export interface UsuarioServiceDeps {
  perfiles: PerfilRepository;
  logger: Logger;
  now: () => Date;
}

/**
 * Gestión de usuarios del panel (solo superadmin; la ruta lo exige). Los usuarios se CREAN en Supabase
 * (Authentication > Add user): acá solo se cambia rol, activo y nombre de los perfiles que ya existen.
 * Reglas:
 *  - nadie se quita su propio rol de superadmin ni se desactiva a sí mismo (409 CONFLICT);
 *  - nunca queda el sistema sin un superadmin activo (lo garantiza un trigger de la base, también ante dos
 *    cambios simultáneos; 409 CONFLICT).
 */
export class UsuarioService {
  constructor(private readonly deps: UsuarioServiceDeps) {}

  list(): Promise<Perfil[]> {
    return this.deps.perfiles.list();
  }

  async update(actor: UsuarioSesion, id: string, cambios: CambiosPerfil): Promise<Perfil> {
    if (id === actor.id) {
      if (cambios.activo === false) {
        throw AppError.conflict('No podés desactivar tu propio usuario.');
      }
      if (cambios.rol !== undefined && cambios.rol !== actor.rol) {
        throw AppError.conflict('No podés cambiar tu propio rol. Pedile a otro superadmin que lo haga.');
      }
    }

    let updated: Perfil | undefined;
    try {
      updated = await this.deps.perfiles.update(id, cambios, this.deps.now());
    } catch (error) {
      if (error instanceof SinSuperadminError) throw AppError.conflict(error.message);
      throw error;
    }
    if (updated === undefined) {
      throw AppError.notFound('No encontramos ese usuario.');
    }

    // Solo ids y nombres de campos: ni emails ni valores de texto.
    const campos = Object.keys(cambios).join(',');
    this.deps.logger.info(`Usuario actualizado id=${id} por=${actor.id} campos=${campos}`);
    return updated;
  }
}
