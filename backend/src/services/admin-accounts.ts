import type { AdminRepository } from '../domain/admin.js';
import type { SessionRepository } from '../domain/session.js';
import { type ScryptParams, DEFAULT_SCRYPT_PARAMS, hashPassword } from '../lib/password.js';

export interface SaveAdminResult {
  created: boolean;
  /** Sesiones que se cerraron (solo al actualizar la contraseña de una cuenta existente). */
  revokedSessions: number;
}

/**
 * Crea un admin o, si el email ya existe, le cambia la contraseña. Al cambiarla se cierran todas sus
 * sesiones abiertas: si la contraseña estaba comprometida, los tokens ya emitidos dejan de servir.
 * La validación de email/contraseña es responsabilidad de quien llama (ver schemas/auth.ts).
 */
export async function saveAdmin(
  repositories: { admins: AdminRepository; sessions: SessionRepository },
  input: { email: string; password: string },
  options: { params?: ScryptParams; now?: Date } = {},
): Promise<SaveAdminResult> {
  const passwordHash = await hashPassword(input.password, options.params ?? DEFAULT_SCRYPT_PARAMS);
  const { id, created } = await repositories.admins.save(input.email, passwordHash, options.now ?? new Date());
  const revokedSessions = created ? 0 : await repositories.sessions.deleteAllForAdmin(id);
  return { created, revokedSessions };
}
