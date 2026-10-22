import { type CambiosPerfil, type Perfil, type PerfilRepository, type Rol, SinSuperadminError } from '../domain/perfil.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import {
  type CambiosCuenta,
  ContrasenaDebilError,
  DatosRechazadosError,
  EmailEnUsoError,
  EmailInvalidoError,
  type SupabaseAdminClient,
} from '../lib/supabase-admin.js';
import { AuthRateLimitedError, AuthUnavailableError } from '../lib/supabase-auth.js';
import type { UsuarioSesion } from './auth.js';

export interface UsuarioServiceDeps {
  perfiles: PerfilRepository;
  /** Cliente de la API admin de Supabase Auth. undefined = falta SUPABASE_SECRET_KEY (alta, baja, email y contraseña => 503). */
  admin: SupabaseAdminClient | undefined;
  logger: Logger;
  now: () => Date;
}

export interface NuevoUsuario {
  email: string;
  password: string;
  nombre: string | null;
  rol: Rol;
  activo: boolean;
}

export type CambiosUsuario = CambiosPerfil & CambiosCuenta;

const NOT_FOUND_MESSAGE = 'No encontramos ese usuario.';
const SIN_CLAVE_ADMIN_MESSAGE =
  'El servidor no tiene configurada la clave de administración de Supabase (SUPABASE_SECRET_KEY): no se pueden crear ' +
  'ni eliminar usuarios, ni cambiarles el email o la contraseña.';
const AUTH_UNAVAILABLE_MESSAGE = 'No pudimos comunicarnos con el servicio de usuarios. Probá de nuevo en unos minutos.';

/**
 * Gestión de usuarios del panel (solo superadmin; la ruta lo exige).
 *  - Alta: crea el usuario en Supabase Auth (email confirmado, contraseña elegida por el superadmin). El trigger de
 *    auth.users crea su perfil (empleado, inactivo) y acá se le pone el rol, el nombre y si está activo.
 *  - Edición: rol, activo y nombre en el perfil; email y contraseña en Supabase Auth (el trigger copia el email).
 *    "Recuperar la contraseña" es esto: el superadmin le asigna una nueva.
 *  - Baja: borra el usuario de Supabase Auth; su perfil y sus sesiones se van en cascada.
 * Reglas:
 *  - nadie se quita su propio rol de superadmin, ni se desactiva ni se elimina a sí mismo (409 CONFLICT);
 *  - nunca queda el sistema sin un superadmin activo (lo garantiza un trigger de la base, también ante dos
 *    cambios simultáneos; 409 CONFLICT).
 */
export class UsuarioService {
  constructor(private readonly deps: UsuarioServiceDeps) {}

  /** true si están disponibles el alta, la baja y el cambio de email o contraseña. */
  get gestionCuentas(): boolean {
    return this.deps.admin !== undefined;
  }

  list(): Promise<Perfil[]> {
    return this.deps.perfiles.list();
  }

  async create(actor: UsuarioSesion, nuevo: NuevoUsuario): Promise<Perfil> {
    const admin = this.requireAdmin();
    const id = await this.callAuth(() => admin.createUser(nuevo.email, nuevo.password));

    let perfil: Perfil;
    try {
      perfil = await this.updatePerfil(id, { rol: nuevo.rol, activo: nuevo.activo, nombre: nuevo.nombre });
    } catch (error) {
      // Compensación: sin esto quedaría un usuario a medio configurar y el reintento chocaría con "email en uso".
      // Si el borrado también falla, el usuario queda como lo dejó el trigger: empleado e inactivo (no entra).
      try {
        await admin.deleteUser(id);
        this.deps.logger.warn(`Alta revertida id=${id}: no se pudo configurar el perfil`);
      } catch {
        this.deps.logger.error(`Alta a medias id=${id}: no se pudo configurar el perfil ni revertir (queda inactivo)`);
      }
      throw error;
    }
    this.deps.logger.info(`Usuario creado id=${id} por=${actor.id} rol=${perfil.rol} activo=${String(perfil.activo)}`);
    return perfil;
  }

  async update(actor: UsuarioSesion, id: string, cambios: CambiosUsuario): Promise<Perfil> {
    if (id === actor.id) {
      if (cambios.activo === false) {
        throw AppError.conflict('No podés desactivar tu propio usuario.');
      }
      if (cambios.rol !== undefined && cambios.rol !== actor.rol) {
        throw AppError.conflict('No podés cambiar tu propio rol. Pedile a otro superadmin que lo haga.');
      }
    }

    const { email, password, ...perfil } = cambios;
    const cambiaCuenta = email !== undefined || password !== undefined;
    const admin = cambiaCuenta ? this.requireAdmin() : undefined;

    // Primero el perfil: es lo que puede chocar con una regla (sin superadmin) y es reversible. Así, si falla, Auth no
    // se tocó. Siempre se actualiza (aunque solo cambien email o contraseña) para dejar constancia en updated_at.
    let updated = await this.updatePerfil(id, perfil);

    if (admin !== undefined) {
      const existe = await this.callAuth(() => admin.updateUser(id, { email, password }));
      if (!existe) throw AppError.notFound(NOT_FOUND_MESSAGE);
      // El trigger de auth.users copió el email nuevo al perfil.
      if (email !== undefined) updated = (await this.deps.perfiles.findById(id)) ?? updated;
    }

    // Solo ids y nombres de campos: ni emails, ni contraseñas, ni valores de texto.
    const campos = Object.keys(cambios).join(',');
    this.deps.logger.info(`Usuario actualizado id=${id} por=${actor.id} campos=${campos}`);
    return updated;
  }

  async remove(actor: UsuarioSesion, id: string): Promise<void> {
    if (id === actor.id) {
      throw AppError.conflict('No podés eliminar tu propio usuario.');
    }
    const admin = this.requireAdmin();
    const perfil = await this.deps.perfiles.findById(id);
    if (perfil === undefined) throw AppError.notFound(NOT_FOUND_MESSAGE);
    let existia: boolean;
    try {
      existia = await this.callAuth(() => admin.deleteUser(id));
    } catch (error) {
      // GoTrue responde 500 si lo frena el trigger "nunca sin superadmin" (dos superadmins borrándose a la vez).
      if (perfil.rol === 'superadmin' && perfil.activo && !(await this.quedaOtroSuperadmin(id))) {
        throw AppError.conflict(new SinSuperadminError().message);
      }
      throw error;
    }
    if (!existia) throw AppError.notFound(NOT_FOUND_MESSAGE);
    this.deps.logger.info(`Usuario eliminado id=${id} por=${actor.id}`);
  }

  private async quedaOtroSuperadmin(id: string): Promise<boolean> {
    return (await this.deps.perfiles.list()).some((p) => p.id !== id && p.rol === 'superadmin' && p.activo);
  }

  private requireAdmin(): SupabaseAdminClient {
    if (this.deps.admin === undefined) throw AppError.serviceUnavailable(SIN_CLAVE_ADMIN_MESSAGE);
    return this.deps.admin;
  }

  private async updatePerfil(id: string, cambios: CambiosPerfil): Promise<Perfil> {
    let updated: Perfil | undefined;
    try {
      updated = await this.deps.perfiles.update(id, cambios, this.deps.now());
    } catch (error) {
      if (error instanceof SinSuperadminError) throw AppError.conflict(error.message);
      throw error;
    }
    if (updated === undefined) throw AppError.notFound(NOT_FOUND_MESSAGE);
    return updated;
  }

  /** Traduce los errores de la API admin a respuestas de la API. Nunca loguea emails ni contraseñas. */
  private async callAuth<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof EmailEnUsoError) throw AppError.conflict(error.message, { email: error.message });
      if (error instanceof ContrasenaDebilError) throw AppError.validation({ password: error.message }, error.message);
      if (error instanceof EmailInvalidoError) throw AppError.validation({ email: error.message }, error.message);
      if (error instanceof DatosRechazadosError) throw AppError.validation(undefined, error.message);
      if (error instanceof AuthRateLimitedError) {
        this.deps.logger.warn(error.message);
        throw AppError.rateLimited('Supabase limitó los pedidos. Esperá unos minutos y probá de nuevo.');
      }
      if (error instanceof AuthUnavailableError) {
        this.deps.logger.warn(error.message);
        throw AppError.serviceUnavailable(AUTH_UNAVAILABLE_MESSAGE);
      }
      throw error;
    }
  }
}
