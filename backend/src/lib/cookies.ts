import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../config.js';
import { SESSION_COOKIE } from './session-token.js';

/**
 * Cookie de sesión: httpOnly (el JS de la página no puede leerla), SameSite=Strict (no viaja en pedidos
 * originados desde otros sitios), Secure en producción (solo HTTPS), path "/".
 */
export class SessionCookies {
  private readonly attributes: CookieOptions;
  private readonly maxAgeMs: number;

  constructor(config: Pick<AppConfig, 'isProduction' | 'sessionTtlSeconds'>) {
    this.attributes = { httpOnly: true, secure: config.isProduction, sameSite: 'strict', path: '/' };
    this.maxAgeMs = config.sessionTtlSeconds * 1000;
  }

  set(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, { ...this.attributes, maxAge: this.maxAgeMs });
  }

  /** Para que el navegador la borre, los atributos (path, etc.) tienen que coincidir con los de set(). */
  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.attributes);
  }
}
