export interface AdminRecord {
  id: number;
  /** Siempre en minúsculas. */
  email: string;
  passwordHash: string;
}

/** Puerto de persistencia de administradores del panel. */
export interface AdminRepository {
  findByEmail(email: string): Promise<AdminRecord | undefined>;
  /** Crea el admin o, si el email ya existe, le actualiza la contraseña. */
  save(email: string, passwordHash: string, now: Date): Promise<{ id: number; created: boolean }>;
}
