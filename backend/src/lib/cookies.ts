import { parseCookie } from 'cookie';
import type { CookieOptions, Request, Response } from 'express';
import type { AppConfig } from '../config.js';

/** Access token de Supabase (JWT, ~1 h). Viaja en todo /api: lo necesitan /api/admin y /api/auth. */
export const ACCESS_COOKIE = 'mg_at';
/** Refresh token de Supabase (rota en cada uso). Viaja SOLO a /api/auth: login, refresh, me y logout. */
export const REFRESH_COOKIE = 'mg_rt';

const ACCESS_PATH = '/api';
const REFRESH_PATH = '/api/auth';

const MAX_COOKIE_HEADER_LENGTH = 8192;
/** Un access token de Supabase ronda 1 kB; uno de varios kB no es nuestro. */
const MAX_ACCESS_TOKEN_LENGTH = 4096;
/** Los refresh tokens de Supabase son cortos (decenas de caracteres). */
const MAX_REFRESH_TOKEN_LENGTH = 512;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

function readCookie(req: Request, name: string, maxLength: number): string | undefined {
  const header = req.headers.cookie;
  if (header === undefined || header.length > MAX_COOKIE_HEADER_LENGTH) return undefined;
  // parseCookie devuelve un objeto sin prototipo y se queda con la primera aparición de cada nombre.
  const value = parseCookie(header)[name];
  return value !== undefined && value !== '' && value.length <= maxLength ? value : undefined;
}

export const readAccessToken = (req: Request): string | undefined =>
  readCookie(req, ACCESS_COOKIE, MAX_ACCESS_TOKEN_LENGTH);

export const readRefreshToken = (req: Request): string | undefined =>
  readCookie(req, REFRESH_COOKIE, MAX_REFRESH_TOKEN_LENGTH);

/**
 * Cookies de sesión del panel (BFF): los tokens de Supabase viven SOLO en cookies httpOnly (el JS de la página no
 * los ve), SameSite=Strict (no viajan en pedidos originados en otros sitios), Secure en producción.
 * Las dos duran lo mismo (8 h desde el último login o refresco): el access token vence antes (lo decide Supabase,
 * ~1 h), pero la cookie sigue para que el backend distinga "venció" (401 SESSION_EXPIRED, se puede refrescar) de
 * "no hay sesión" (401 UNAUTHORIZED).
 */
export class SessionCookies {
  private readonly access: CookieOptions;
  private readonly refresh: CookieOptions;
  private readonly maxAgeMs: number;

  constructor(config: Pick<AppConfig, 'isProduction' | 'sessionCookieMaxAgeSeconds'>) {
    const base = { httpOnly: true, secure: config.isProduction, sameSite: 'strict' } as const;
    this.access = { ...base, path: ACCESS_PATH };
    this.refresh = { ...base, path: REFRESH_PATH };
    this.maxAgeMs = config.sessionCookieMaxAgeSeconds * 1000;
  }

  set(res: Response, tokens: SessionTokens): void {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...this.access, maxAge: this.maxAgeMs });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...this.refresh, maxAge: this.maxAgeMs });
  }

  /** Para que el navegador las borre, los atributos (path, etc.) tienen que coincidir con los de set(). */
  clear(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, this.access);
    res.clearCookie(REFRESH_COOKIE, this.refresh);
  }
}
