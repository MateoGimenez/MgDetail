import type { RequestHandler, Response } from 'express';
import type { Rol } from '../domain/perfil.js';
import { type SessionCookies, readAccessToken, readRefreshToken } from '../lib/cookies.js';
import { AppError } from '../lib/errors.js';
import type { AuthService, UsuarioSesion } from '../services/auth.js';

/**
 * Exige una sesión válida de Supabase Auth con un perfil activo. En cada request:
 *  - verifica el access token (cookie mg_at) contra el JWKS;
 *  - si venció y en el request viaja el refresh token (cookie mg_rt, solo en /api/auth/*), refresca y reescribe
 *    las cookies; en /api/admin/* no viaja: responde 401 SESSION_EXPIRED y el frontend llama a /api/auth/refresh;
 *  - carga el perfil desde la base (rol y activo) y comprueba que la sesión siga en auth.sessions.
 * Respuestas: 401 UNAUTHORIZED (sin sesión, token inválido, sesión cerrada), 401 SESSION_EXPIRED, 403 NO_ACCESS
 * (usuario sin perfil o inactivo; se borran las cookies y se cierra la sesión en Supabase).
 */
export function requireSession(auth: AuthService, cookies: SessionCookies): RequestHandler {
  return async (req, res, next) => {
    const accessToken = readAccessToken(req);
    const refreshToken = readRefreshToken(req);
    const result = await auth.authenticate({
      ...(accessToken !== undefined && { accessToken }),
      ...(refreshToken !== undefined && { refreshToken }),
    });

    switch (result.status) {
      case 'ok':
        if (result.renewed) cookies.set(res, result.renewed);
        res.locals.usuario = result.usuario;
        next();
        return;
      case 'expired':
        next(AppError.sessionExpired());
        return;
      case 'forbidden':
        cookies.clear(res);
        next(AppError.noAccess());
        return;
      case 'invalid':
        cookies.clear(res); // vencida, revocada o manipulada: que el navegador deje de mandarla
        next(AppError.unauthorized());
        return;
      case 'none':
        next(AppError.unauthorized());
        return;
    }
  };
}

/**
 * Autorización por rol: deja pasar solo si `permitido(rol)`. Siempre detrás de requireSession.
 * 403 FORBIDDEN con un mensaje en español apto para mostrar.
 */
export function requirePermiso(permitido: (rol: Rol) => boolean, message: string): RequestHandler {
  return (_req, res, next) => {
    next(permitido(getUsuario(res).rol) ? undefined : AppError.forbidden(message));
  };
}

/** Usuario autenticado del request actual. Solo usar detrás de requireSession. */
export function getUsuario(res: Response): UsuarioSesion {
  const usuario = res.locals.usuario;
  if (!usuario) {
    throw new Error('getUsuario() se usó en una ruta que no pasa por requireSession');
  }
  return usuario;
}
