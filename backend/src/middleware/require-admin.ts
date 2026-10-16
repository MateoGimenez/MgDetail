import { parseCookie } from 'cookie';
import type { Request, RequestHandler, Response } from 'express';
import type { SessionCookies } from '../lib/cookies.js';
import { AppError } from '../lib/errors.js';
import { SESSION_COOKIE } from '../lib/session-token.js';
import type { AuthService, AuthenticatedAdmin } from '../services/auth.js';

const MAX_COOKIE_HEADER_LENGTH = 8192;
const MAX_TOKEN_LENGTH = 4096;

/**
 * Lee el token de la cookie de sesión directamente del header `Cookie` (sin cookie-parser).
 * `parseCookie` devuelve un objeto sin prototipo y se queda con la primera aparición de cada nombre; el valor
 * siempre es un string, así que no hay cookies "JSON" que se conviertan en objetos.
 */
export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (header === undefined || header.length > MAX_COOKIE_HEADER_LENGTH) return undefined;
  const value = parseCookie(header)[SESSION_COOKIE];
  return value !== undefined && value !== '' && value.length <= MAX_TOKEN_LENGTH ? value : undefined;
}

/** Exige una sesión válida (JWT bien firmado y vigente + sesión no revocada). Si no: 401 UNAUTHORIZED. */
export function requireAdmin(auth: AuthService, cookies: SessionCookies): RequestHandler {
  return async (req, res, next) => {
    const token = readSessionToken(req);
    const admin = token === undefined ? null : await auth.authenticate(token);

    if (!admin) {
      if (token !== undefined) {
        cookies.clear(res); // cookie vencida, revocada o manipulada: que el navegador deje de mandarla
      }
      next(AppError.unauthorized());
      return;
    }

    res.locals.admin = admin;
    next();
  };
}

/** Admin autenticado del request actual. Solo usar detrás de requireAdmin. */
export function getAdmin(res: Response): AuthenticatedAdmin {
  const admin = res.locals.admin;
  if (!admin) {
    throw new Error('getAdmin() se usó en una ruta que no pasa por requireAdmin');
  }
  return admin;
}
