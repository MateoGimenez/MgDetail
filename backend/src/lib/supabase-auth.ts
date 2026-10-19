import { z } from 'zod';
import type { SupabaseAuthConfig } from '../config.js';
import type { SessionTokens } from './cookies.js';

export type FetchFn = typeof fetch;

/** Tope de cada llamada a Supabase Auth: el login no puede quedar colgado. */
export const SUPABASE_AUTH_TIMEOUT_MS = 5_000;

/** Supabase Auth no respondió, respondió 5xx o algo inesperado. Nunca incluye tokens, emails ni cuerpos. */
export class AuthUnavailableError extends Error {
  constructor(readonly status: number | undefined) {
    super(
      status === undefined
        ? 'Supabase Auth no respondió'
        : `Supabase Auth respondió ${String(status)}`,
    );
    this.name = 'AuthUnavailableError';
  }
}

/** Supabase limitó los pedidos (429). Todos los logins salen de la IP de este servidor. */
export class AuthRateLimitedError extends Error {
  constructor() {
    super('Supabase Auth limitó los pedidos (429)');
    this.name = 'AuthRateLimitedError';
  }
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(20).max(8192),
  refresh_token: z.string().min(1).max(512),
});

/**
 * Cliente mínimo de la API REST de Supabase Auth (GoTrue), del lado del servidor. Sin supabase-js: son tres
 * endpoints y así el navegador nunca recibe un token ni una clave. La cabecera `apikey` lleva la clave
 * publishable. Las respuestas de error se leen solo por su status: nada de lo que devuelve Supabase se loguea.
 */
export class SupabaseAuthClient {
  constructor(
    private readonly config: Pick<SupabaseAuthConfig, 'authUrl' | 'publishableKey'>,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  /** POST /token?grant_type=password. null = credenciales inválidas (o email sin confirmar: misma respuesta). */
  async signInWithPassword(email: string, password: string): Promise<SessionTokens | null> {
    const response = await this.request('/token?grant_type=password', { email, password });
    // 400 invalid_credentials / email_not_confirmed, 422 validación: para el usuario, todo es "credenciales inválidas".
    if (response.status === 400 || response.status === 401 || response.status === 422) return null;
    return this.readTokens(response);
  }

  /** POST /token?grant_type=refresh_token (rotación). null = refresh token revocado, usado o desconocido. */
  async refresh(refreshToken: string): Promise<SessionTokens | null> {
    const response = await this.request('/token?grant_type=refresh_token', { refresh_token: refreshToken });
    if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404) {
      return null;
    }
    return this.readTokens(response);
  }

  /** POST /logout?scope=local: cierra esta sesión (borra la fila de auth.sessions y revoca sus refresh tokens). */
  async logout(accessToken: string): Promise<void> {
    const response = await this.request('/logout?scope=local', undefined, accessToken);
    await response.body?.cancel();
    // 401/403/404: el token ya no valía o la sesión ya no existe. Para quien cierra sesión es lo mismo.
    if (response.status >= 500) throw new AuthUnavailableError(response.status);
    if (response.status === 429) throw new AuthRateLimitedError();
  }

  private async request(path: string, body: unknown, bearer?: string): Promise<Response> {
    const headers: Record<string, string> = {
      apikey: this.config.publishableKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (bearer !== undefined) headers.Authorization = `Bearer ${bearer}`;
    try {
      return await this.fetchFn(`${this.config.authUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body ?? {}),
        redirect: 'error',
        signal: AbortSignal.timeout(SUPABASE_AUTH_TIMEOUT_MS),
      });
    } catch {
      // Red caída, DNS o timeout. El error original puede incluir la URL: no se propaga.
      throw new AuthUnavailableError(undefined);
    }
  }

  private async readTokens(response: Response): Promise<SessionTokens> {
    if (response.status === 429) {
      await response.body?.cancel();
      throw new AuthRateLimitedError();
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new AuthUnavailableError(response.status);
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new AuthUnavailableError(response.status);
    }
    const parsed = tokenResponseSchema.safeParse(json);
    if (!parsed.success) throw new AuthUnavailableError(response.status);
    return { accessToken: parsed.data.access_token, refreshToken: parsed.data.refresh_token };
  }
}
