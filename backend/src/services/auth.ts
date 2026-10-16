import { randomBytes } from 'node:crypto';
import type { AdminRepository } from '../domain/admin.js';
import type { SessionRepository } from '../domain/session.js';
import { type ScryptParams, hashPassword, verifyPassword } from '../lib/password.js';
import type { SessionTokens } from '../lib/session-token.js';

export interface AuthenticatedAdmin {
  adminId: number;
  email: string;
  sessionId: string;
}

export interface LoginSuccess {
  token: string;
  /** Segundos desde epoch. */
  expiresAt: number;
  admin: { email: string };
}

export interface AuthServiceDeps {
  admins: AdminRepository;
  sessions: SessionRepository;
  tokens: SessionTokens;
  /** Parámetros con los que se calcula el hash "señuelo" (deben ser los mismos que usan las contraseñas reales). */
  passwordParams: ScryptParams;
  now: () => Date;
}

const toSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

export class AuthService {
  /**
   * Hash de una contraseña aleatoria que nadie conoce. Cuando el email no existe, se verifica contra
   * este hash: el login hace el mismo trabajo de scrypt exista o no la cuenta, así el tiempo de respuesta
   * no revela qué emails están registrados.
   */
  private readonly decoyHash: Promise<string>;

  constructor(private readonly deps: AuthServiceDeps) {
    this.decoyHash = hashPassword(randomBytes(24).toString('base64url'), deps.passwordParams);
    // Se calcula en segundo plano al arrancar; si fallara, el error se reporta en el primer login.
    this.decoyHash.catch(() => undefined);
  }

  /** Devuelve null con credenciales inválidas (sin distinguir email inexistente de contraseña incorrecta). */
  async login(email: string, password: string): Promise<LoginSuccess | null> {
    const admin = await this.deps.admins.findByEmail(email);
    const hash = admin?.passwordHash ?? (await this.decoyHash);
    const passwordMatches = await verifyPassword(password, hash);
    if (!admin || !passwordMatches) return null;

    const now = this.deps.now();
    await this.deps.sessions.purgeExpired(toSeconds(now));

    const issued = await this.deps.tokens.issue(admin.id);
    await this.deps.sessions.create(issued.sessionId, admin.id, issued.expiresAt, now);
    return { token: issued.token, expiresAt: issued.expiresAt, admin: { email: admin.email } };
  }

  /** Valida el JWT (firma, algoritmo, vencimiento) Y que la sesión siga vigente. */
  async authenticate(token: string): Promise<AuthenticatedAdmin | null> {
    const verified = await this.deps.tokens.verify(token);
    if (!verified) return null;

    const session = await this.deps.sessions.findActive(
      verified.sessionId,
      verified.adminId,
      toSeconds(this.deps.now()),
    );
    if (!session) return null;
    return { adminId: session.adminId, email: session.email, sessionId: session.sessionId };
  }

  /** Revoca la sesión del token. Si el token no es válido no hace nada. */
  async logout(token: string): Promise<void> {
    const verified = await this.deps.tokens.verify(token);
    if (verified) {
      await this.deps.sessions.delete(verified.sessionId);
    }
  }
}
