import type { Perfil, PerfilRepository, Rol } from '../domain/perfil.js';
import type { AccessTokenClaims, AccessTokenVerifier } from '../lib/access-token.js';
import type { SessionTokens } from '../lib/cookies.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { AuthRateLimitedError, AuthUnavailableError, type SupabaseAuthClient } from '../lib/supabase-auth.js';

/** Usuario del request actual (lo deja requireSession en res.locals). */
export interface UsuarioSesion {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: Rol;
  /** session_id de Supabase Auth. */
  sessionId: string;
}

export type SessionResult =
  | { status: 'ok'; usuario: UsuarioSesion; /** Tokens nuevos si hubo que refrescar: reescribir las cookies. */ renewed?: SessionTokens }
  /** No vino ninguna cookie. */
  | { status: 'none' }
  /** Token manipulado, refresh revocado o sesión cerrada: borrar las cookies. */
  | { status: 'invalid' }
  /** El access token venció y en este request no viaja el refresh token (su cookie es solo de /api/auth). */
  | { status: 'expired' }
  /** Autenticado, pero sin perfil o con el perfil inactivo: no entra al panel. */
  | { status: 'forbidden' };

export interface AuthServiceDeps {
  supabase: SupabaseAuthClient;
  verifyAccessToken: AccessTokenVerifier;
  perfiles: PerfilRepository;
  logger: Logger;
}

const AUTH_UNAVAILABLE_MESSAGE =
  'No pudimos conectarnos con el servicio de inicio de sesión. Probá de nuevo en unos minutos.';

function toUsuario(perfil: Perfil, sessionId: string): UsuarioSesion {
  return { id: perfil.id, email: perfil.email, nombre: perfil.nombre, rol: perfil.rol, sessionId };
}

/**
 * Sesiones del panel con Supabase Auth, en modo BFF: el backend habla con Supabase, verifica los tokens contra el
 * JWKS y los guarda en cookies httpOnly; el navegador nunca los ve. En cada request se lee el perfil (rol, activo)
 * y se comprueba que la sesión de Supabase siga existiendo, así un cambio de rol, una desactivación o un logout
 * tienen efecto en el request siguiente.
 * En los logs solo aparece el id del usuario: nunca tokens ni emails.
 */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  /** Lanza AppError: 401 credenciales inválidas (también si el usuario no tiene acceso al panel), 429 o 503 si Supabase no responde. */
  async login(email: string, password: string): Promise<{ usuario: UsuarioSesion; tokens: SessionTokens }> {
    const tokens = await this.guard(() => this.deps.supabase.signInWithPassword(email, password));
    if (tokens === null) {
      throw AppError.invalidCredentials();
    }

    const claims = await this.verifyFresh(tokens.accessToken);
    const found = await this.deps.perfiles.findForSession(claims.userId, claims.sessionId);
    if (!found?.perfil.activo) {
      // Credenciales correctas pero sin acceso: se cierra en Supabase la sesión que se acaba de abrir. La respuesta es
      // IGUAL a la de credenciales inválidas (mismo 401, mismo mensaje) y la revocación va en segundo plano (no
      // demora la respuesta): si no, el login confirmaría que la contraseña de un usuario inactivo es correcta.
      void this.revokeQuietly(tokens.accessToken);
      this.deps.logger.warn(`Inicio de sesión rechazado: usuario sin acceso al panel usuario=${claims.userId}`);
      throw AppError.invalidCredentials();
    }
    if (!found.sesionVigente) {
      this.deps.logger.error(`Supabase devolvió una sesión que no figura en auth.sessions usuario=${claims.userId}`);
      throw AppError.serviceUnavailable(AUTH_UNAVAILABLE_MESSAGE);
    }

    this.deps.logger.info(`Inicio de sesión usuario=${claims.userId} rol=${found.perfil.rol}`);
    return { usuario: toUsuario(found.perfil, claims.sessionId), tokens };
  }

  /**
   * Valida la sesión del request: el access token y, si venció y viaja el refresh token, lo refresca (rotación).
   * Lanza AppError 503/429 solo si Supabase no responde.
   */
  async authenticate(tokens: { accessToken?: string; refreshToken?: string }): Promise<SessionResult> {
    const { accessToken, refreshToken } = tokens;
    if (accessToken === undefined) {
      // Las dos cookies se emiten y se borran juntas: un refresh token suelto no viene de un navegador legítimo. No se
      // canjea (cada canje gasta el cupo de Supabase Auth, que comparten TODOS los logins: ver refreshFromCookies).
      return refreshToken === undefined ? { status: 'none' } : { status: 'invalid' };
    }

    const verified = await this.guard(() => this.deps.verifyAccessToken(accessToken));
    if (verified.status === 'valid') return this.resolve(verified.claims, accessToken);
    if (verified.status === 'expired') {
      return refreshToken === undefined ? { status: 'expired' } : this.refresh(refreshToken);
    }
    return { status: 'invalid' };
  }

  /**
   * POST /api/auth/refresh. Solo se llama a Supabase si el access token de la cookie es AUTÉNTICO (firma válida del
   * proyecto, vigente o vencido). Todos los canjes salen de la IP de este servidor y comparten el límite de Supabase
   * Auth por IP (el mismo que usa el login): sin esta comprobación, cualquiera podría mandar cookies mg_rt inventadas
   * desde una sola IP, vaciar ese cupo y dejar al dueño sin poder ingresar.
   */
  async refreshFromCookies(tokens: { accessToken?: string; refreshToken?: string }): Promise<SessionResult> {
    const { accessToken, refreshToken } = tokens;
    if (refreshToken === undefined) return { status: 'none' };
    if (accessToken === undefined) return { status: 'invalid' };
    const verified = await this.guard(() => this.deps.verifyAccessToken(accessToken));
    return verified.status === 'invalid' ? { status: 'invalid' } : this.refresh(refreshToken);
  }

  /** Canjea el refresh token por un par nuevo (Supabase rota el refresh token en cada uso). */
  private async refresh(refreshToken: string): Promise<SessionResult> {
    const renewed = await this.guard(() => this.deps.supabase.refresh(refreshToken));
    if (renewed === null) return { status: 'invalid' };
    const claims = await this.verifyFresh(renewed.accessToken);
    const result = await this.resolve(claims, renewed.accessToken);
    return result.status === 'ok' ? { ...result, renewed } : result;
  }

  /** Cierra la sesión en Supabase (revoca el refresh token y borra la sesión). Nunca lanza. */
  async logout(tokens: { accessToken?: string; refreshToken?: string }): Promise<void> {
    try {
      let accessToken = tokens.accessToken;
      const verified = accessToken === undefined ? undefined : await this.deps.verifyAccessToken(accessToken);
      if (verified?.status !== 'valid') {
        // Supabase solo acepta el logout con un access token vigente: si venció (pero es auténtico), se refresca
        // primero. Sin access token auténtico no se llama a Supabase (mismo motivo que en refreshFromCookies).
        accessToken = undefined;
        if (verified?.status === 'expired' && tokens.refreshToken !== undefined) {
          accessToken = (await this.deps.supabase.refresh(tokens.refreshToken))?.accessToken;
        }
      }
      if (accessToken !== undefined) await this.deps.supabase.logout(accessToken);
    } catch (error) {
      this.deps.logger.warn(`No se pudo cerrar la sesión en Supabase (${describeAuthError(error)})`);
    }
  }

  private async resolve(claims: AccessTokenClaims, accessToken: string): Promise<SessionResult> {
    const found = await this.deps.perfiles.findForSession(claims.userId, claims.sessionId);
    if (found !== undefined && !found.sesionVigente) {
      // Logout, "cerrar sesiones", usuario borrado en Supabase o tope absoluto de la sesión (SESION_MAX_SEGUNDOS).
      // En el último caso la sesión sigue viva en Supabase: se cierra allá también (si ya no existía, no pasa nada).
      await this.revokeQuietly(accessToken);
      return { status: 'invalid' };
    }
    if (!found?.perfil.activo) {
      await this.revokeQuietly(accessToken);
      this.deps.logger.warn(`Sesión rechazada: usuario sin acceso al panel usuario=${claims.userId}`);
      return { status: 'forbidden' };
    }
    return { status: 'ok', usuario: toUsuario(found.perfil, claims.sessionId) };
  }

  /** Un token recién emitido por Supabase TIENE que verificar; si no, la config (JWKS, algoritmo) está mal. */
  private async verifyFresh(accessToken: string): Promise<AccessTokenClaims> {
    const verified = await this.guard(() => this.deps.verifyAccessToken(accessToken));
    if (verified.status !== 'valid') {
      await this.revokeQuietly(accessToken);
      this.deps.logger.error(
        'Supabase devolvió un access token que no se pudo verificar: revisá SUPABASE_URL y el algoritmo de las JWT Signing Keys.',
      );
      throw AppError.serviceUnavailable(AUTH_UNAVAILABLE_MESSAGE);
    }
    return verified.claims;
  }

  private async revokeQuietly(accessToken: string): Promise<void> {
    try {
      await this.deps.supabase.logout(accessToken);
    } catch (error) {
      this.deps.logger.warn(`No se pudo revocar la sesión en Supabase (${describeAuthError(error)})`);
    }
  }

  /** Traduce "Supabase no responde" a errores HTTP (503 / 429). Lo demás se propaga tal cual. */
  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AuthRateLimitedError) {
        this.deps.logger.warn('Supabase Auth limitó los pedidos (429)');
        throw AppError.rateLimited('Hay demasiados intentos de inicio de sesión. Esperá unos minutos y probá de nuevo.');
      }
      if (error instanceof AuthUnavailableError) {
        this.deps.logger.warn(`Supabase Auth no disponible (${describeAuthError(error)})`);
        throw AppError.serviceUnavailable(AUTH_UNAVAILABLE_MESSAGE);
      }
      throw error;
    }
  }
}

/** Solo el tipo y el status: nunca el mensaje completo (podría traer URLs). */
function describeAuthError(error: unknown): string {
  if (error instanceof AuthUnavailableError || error instanceof AuthRateLimitedError) return error.message;
  return error instanceof Error ? error.name : 'error desconocido';
}
