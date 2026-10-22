import { z } from 'zod';
import { AuthRateLimitedError, AuthUnavailableError, type FetchFn, SUPABASE_AUTH_TIMEOUT_MS } from './supabase-auth.js';

/** Ya hay un usuario de Auth con ese email (422 email_exists). */
export class EmailEnUsoError extends Error {
  constructor() {
    super('Ya existe un usuario con ese email.');
    this.name = 'EmailEnUsoError';
  }
}

/** Supabase rechazó la contraseña por su política (422 weak_password). */
export class ContrasenaDebilError extends Error {
  constructor() {
    super('La contraseña no cumple los requisitos de seguridad de Supabase. Probá con una más larga.');
    this.name = 'ContrasenaDebilError';
  }
}

/** Supabase rechazó el email (422 email_address_invalid). */
export class EmailInvalidoError extends Error {
  constructor() {
    super('Supabase no aceptó ese email. Revisalo.');
    this.name = 'EmailInvalidoError';
  }
}

/** Supabase rechazó los datos sin decir cuál (400/422 validation_failed u otro código de validación). */
export class DatosRechazadosError extends Error {
  constructor() {
    super('Supabase no aceptó los datos. Revisá el email y la contraseña.');
    this.name = 'DatosRechazadosError';
  }
}

const userResponseSchema = z.object({ id: z.uuid() });
const errorResponseSchema = z.object({ error_code: z.string().max(100).optional() });

export interface CambiosCuenta {
  email?: string;
  password?: string;
}

/**
 * Cliente mínimo de la API admin de Supabase Auth (/auth/v1/admin/users), del lado del servidor. La secret key va
 * SOLO en la cabecera `apikey` (no es un JWT: el gateway de Supabase arma el Authorization). Como en
 * SupabaseAuthClient, nada de lo que devuelve Supabase se loguea y los errores no llevan emails, tokens ni la URL.
 */
export class SupabaseAdminClient {
  constructor(
    private readonly config: { authUrl: string; secretKey: string },
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  /** Crea un usuario con email confirmado (no se manda ningún email). Devuelve su id. */
  async createUser(email: string, password: string): Promise<string> {
    const response = await this.request('POST', '/admin/users', { email, password, email_confirm: true });
    if (response.status === 200 || response.status === 201) return this.readUserId(response);
    throw await this.toError(response);
  }

  /** Cambia email y/o contraseña. El email nuevo queda confirmado. false = el usuario no existe. */
  async updateUser(id: string, cambios: CambiosCuenta): Promise<boolean> {
    const body: Record<string, unknown> = {};
    if (cambios.email !== undefined) {
      body.email = cambios.email;
      body.email_confirm = true;
    }
    if (cambios.password !== undefined) body.password = cambios.password;
    const response = await this.request('PUT', `/admin/users/${encodeURIComponent(id)}`, body);
    if (response.status === 404) {
      await response.body?.cancel();
      return false;
    }
    if (response.status === 200) {
      await this.readUserId(response);
      return true;
    }
    throw await this.toError(response);
  }

  /**
   * Borra el usuario (y, en cascada, su perfil y sus sesiones). false = no existía. Si lo frena un trigger de la base
   * (ej.: era el último superadmin activo), GoTrue responde 500 y esto lanza AuthUnavailableError.
   */
  async deleteUser(id: string): Promise<boolean> {
    const response = await this.request('DELETE', `/admin/users/${encodeURIComponent(id)}`, undefined);
    await response.body?.cancel();
    if (response.status === 404) return false;
    if (response.status === 200 || response.status === 204) return true;
    if (response.status === 429) throw new AuthRateLimitedError();
    throw new AuthUnavailableError(response.status);
  }

  private async request(method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown): Promise<Response> {
    try {
      return await this.fetchFn(`${this.config.authUrl}${path}`, {
        method,
        headers: {
          apikey: this.config.secretKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(SUPABASE_AUTH_TIMEOUT_MS),
      });
    } catch {
      // Red caída, DNS o timeout. El error original puede incluir la URL: no se propaga.
      throw new AuthUnavailableError(undefined);
    }
  }

  private async readUserId(response: Response): Promise<string> {
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new AuthUnavailableError(response.status);
    }
    const parsed = userResponseSchema.safeParse(json);
    if (!parsed.success) throw new AuthUnavailableError(response.status);
    return parsed.data.id;
  }

  /** Traduce un status de error de GoTrue. Solo se mira error_code: el resto del cuerpo se descarta. */
  private async toError(response: Response): Promise<Error> {
    if (response.status === 429) {
      await response.body?.cancel();
      return new AuthRateLimitedError();
    }
    if (response.status !== 400 && response.status !== 422) {
      await response.body?.cancel();
      return new AuthUnavailableError(response.status);
    }
    let code: string | undefined;
    try {
      code = errorResponseSchema.safeParse(await response.json()).data?.error_code;
    } catch {
      code = undefined;
    }
    if (code === 'email_exists' || code === 'user_already_exists') return new EmailEnUsoError();
    if (code === 'weak_password') return new ContrasenaDebilError();
    if (code === 'email_address_invalid') return new EmailInvalidoError();
    // validation_failed es genérico en GoTrue: no se puede saber qué campo fue.
    return new DatosRechazadosError();
  }
}
