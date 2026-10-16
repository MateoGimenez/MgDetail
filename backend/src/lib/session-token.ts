import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

/** Nombre de la cookie de sesión. */
export const SESSION_COOKIE = 'mg_session';

export const JWT_ISSUER = 'mgdetailing-api';
export const JWT_AUDIENCE = 'mgdetailing-admin';
const ALGORITHM = 'HS256';

export interface IssuedToken {
  token: string;
  sessionId: string;
  /** Segundos desde epoch. */
  expiresAt: number;
}

export interface VerifiedToken {
  adminId: number;
  sessionId: string;
  expiresAt: number;
}

/**
 * Emite y verifica los JWT de sesión (HS256, firmados con jose).
 * Al verificar se FIJA el algoritmo (nunca se confía en el header `alg` del token), el emisor y la audiencia.
 */
export class SessionTokens {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
    private readonly now: () => Date,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async issue(adminId: number): Promise<IssuedToken> {
    const issuedAt = Math.floor(this.now().getTime() / 1000);
    const expiresAt = issuedAt + this.ttlSeconds;
    const sessionId = randomUUID();

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setSubject(String(adminId))
      .setJti(sessionId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(this.key);

    return { token, sessionId, expiresAt };
  }

  /** Devuelve los datos del token o null si es inválido, está vencido, mal firmado, etc. Nunca lanza. */
  async verify(token: string): Promise<VerifiedToken | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        requiredClaims: ['sub', 'jti', 'exp', 'iat'],
        currentDate: this.now(),
      });

      const { sub, jti, exp } = payload;
      if (typeof sub !== 'string' || !/^\d{1,15}$/.test(sub) || typeof jti !== 'string' || typeof exp !== 'number') {
        return null;
      }
      return { adminId: Number(sub), sessionId: jti, expiresAt: exp };
    } catch {
      return null;
    }
  }
}
