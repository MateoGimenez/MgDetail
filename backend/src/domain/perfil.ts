/** Roles del panel (mismos ids que mgdetailing.roles). */
export const ROLES = ['superadmin', 'admin', 'empleado'] as const;
export type Rol = (typeof ROLES)[number];

/** Perfil de un usuario de Supabase Auth (tabla mgdetailing.perfiles), tal como sale por la API. */
export interface Perfil {
  /** UUID de auth.users. */
  id: string;
  /** null si el usuario de Auth no tiene email (no pasa con usuarios creados por email). */
  email: string | null;
  nombre: string | null;
  rol: Rol;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tope ABSOLUTO de una sesión del panel desde el login, aunque se siga refrescando. En el plan Free de Supabase
 * el refresh token no vence: sin este tope, una sesión (o un refresh token robado) se renovaría para siempre.
 * Lo aplica la base (mgdetailing_private.sesion_vigente, contra auth.sessions.created_at). 12 h: una jornada del
 * taller sin volver a ingresar.
 */
export const SESION_MAX_SEGUNDOS = 12 * 60 * 60;

/** Una persona activa del panel, para elegir "quién hizo el trabajo". `nombre` es su nombre o, si no tiene, su email. */
export interface PersonaActiva {
  id: string;
  nombre: string;
  rol: Rol;
}

/** Un rol del panel tal como está en mgdetailing.roles. */
export interface RolInfo {
  id: Rol;
  nombre: string;
  descripcion: string;
}

/** Cambios que un superadmin puede hacer sobre un perfil. Lo que no viene, no cambia. */
export interface CambiosPerfil {
  rol?: Rol;
  activo?: boolean;
  /** null borra el nombre. */
  nombre?: string | null;
}

/** El cambio dejaría el sistema sin ningún superadmin activo (lo detecta un trigger de la base). */
export class SinSuperadminError extends Error {
  constructor() {
    super('No se puede dejar el sistema sin ningún superadmin activo.');
    this.name = 'SinSuperadminError';
  }
}

/**
 * Puerto de persistencia de perfiles. Los perfiles los crea un trigger sobre auth.users y se borran en cascada con el
 * usuario de Auth: acá no hay create ni delete (el alta y la baja pasan por la API admin de Supabase Auth).
 */
export interface PerfilRepository {
  /**
   * Perfil del usuario de la sesión y si la sesión de Supabase (session_id del JWT) sigue vigente en auth.sessions.
   * Una sola consulta por request. undefined si el usuario no tiene perfil.
   */
  findForSession(userId: string, sessionId: string): Promise<{ perfil: Perfil; sesionVigente: boolean } | undefined>;
  /** Todos los perfiles, los más viejos primero. */
  list(): Promise<Perfil[]>;
  /** Las personas ACTIVAS de cualquier rol, ordenadas por nombre (sin distinguir mayúsculas). */
  trabajadores(): Promise<PersonaActiva[]>;
  /** Los tres roles con su nombre y descripción, de más a menos permisos. */
  roles(): Promise<RolInfo[]>;
  /** undefined si no existe. */
  findById(id: string): Promise<Perfil | undefined>;
  /** undefined si no existe. Lanza SinSuperadminError si dejaría el sistema sin superadmin activo. */
  update(id: string, cambios: CambiosPerfil, now: Date): Promise<Perfil | undefined>;
}
