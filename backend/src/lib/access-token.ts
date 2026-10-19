import { type JWTVerifyGetKey, createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { AuthUnavailableError } from './supabase-auth.js';

/**
 * Algoritmo de firma de los access tokens del proyecto (JWT Signing Keys de Supabase, clave asimétrica P-256).
 * Se FIJA al verificar: nunca se confía en el `alg` del header (descarta "none" y la confusión con HS256).
 * Si el proyecto rota a una clave RSA, hay que cambiarlo por 'RS256' (ver README, "Supabase Auth").
 */
export const SUPABASE_JWT_ALGORITHM = 'ES256';
/** Audiencia de los tokens de usuarios autenticados. */
export const SUPABASE_JWT_AUDIENCE = 'authenticated';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
  /** Segundos desde epoch. */
  expiresAt: number;
}

export type VerifyResult =
  | { status: 'valid'; claims: AccessTokenClaims }
  /** Firma correcta (es un token de este proyecto) pero venció: se puede intentar refrescar. */
  | { status: 'expired' }
  | { status: 'invalid' };

/**
 * JWKS del proyecto con caché: jose guarda las claves 10 min y no vuelve a pedirlas más de una vez cada 30 s
 * aunque llegue un `kid` desconocido (un atacante no puede usarlo para martillar a Supabase). Timeout de 5 s.
 */
export function createSupabaseJwks(jwksUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(jwksUrl), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  });
}

export interface AccessTokenVerifierOptions {
  /** Claves públicas (createSupabaseJwks en producción; un JWKS local en los tests). */
  getKey: JWTVerifyGetKey;
  /** `iss` exacto: https://<ref>.supabase.co/auth/v1 */
  issuer: string;
  now: () => Date;
}

/**
 * Verifica un access token de Supabase Auth: firma contra el JWKS, algoritmo, emisor, audiencia y vencimiento
 * fijados; además exige `sub` y `session_id` con formato UUID, `role = authenticated` y que no sea un usuario
 * anónimo. Nunca lanza por un token malo: devuelve 'invalid'. Si no se pudieron obtener las claves (Supabase
 * caído, timeout, JWKS inválido) lanza AuthUnavailableError: el llamador responde 503 y NO borra la sesión.
 */
export function createAccessTokenVerifier(options: AccessTokenVerifierOptions) {
  return async function verifyAccessToken(token: string): Promise<VerifyResult> {
    try {
      const { payload } = await jwtVerify(token, options.getKey, {
        algorithms: [SUPABASE_JWT_ALGORITHM],
        issuer: options.issuer,
        audience: SUPABASE_JWT_AUDIENCE,
        requiredClaims: ['sub', 'exp', 'iat', 'session_id'],
        currentDate: options.now(),
        // Tolerancia por diferencias de reloj entre este servidor y Supabase.
        clockTolerance: 5,
      });
      const { sub, exp, session_id: sessionId, role, is_anonymous: isAnonymous } = payload;
      if (
        typeof sub !== 'string' ||
        !UUID.test(sub) ||
        typeof sessionId !== 'string' ||
        !UUID.test(sessionId) ||
        typeof exp !== 'number' ||
        role !== 'authenticated' ||
        isAnonymous === true
      ) {
        return { status: 'invalid' };
      }
      return { status: 'valid', claims: { userId: sub.toLowerCase(), sessionId: sessionId.toLowerCase(), expiresAt: exp } };
    } catch (error) {
      // jose verifica la firma ANTES que los claims: JWTExpired implica un token auténtico de este proyecto.
      if (error instanceof errors.JWTExpired) return { status: 'expired' };
      if (isTokenProblem(error)) return { status: 'invalid' };
      throw new AuthUnavailableError(undefined);
    }
  };
}

export type AccessTokenVerifier = ReturnType<typeof createAccessTokenVerifier>;

/** Errores atribuibles al token (mal formado, mal firmado, claims ajenos, kid desconocido, alg no permitido). */
function isTokenProblem(error: unknown): boolean {
  return (
    error instanceof errors.JWTClaimValidationFailed ||
    error instanceof errors.JWTInvalid ||
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWSSignatureVerificationFailed ||
    error instanceof errors.JOSEAlgNotAllowed ||
    error instanceof errors.JOSENotSupported ||
    error instanceof errors.JWKSNoMatchingKey ||
    error instanceof errors.JWKSMultipleMatchingKeys
  );
}
