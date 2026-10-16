export interface ActiveSession {
  sessionId: string;
  adminId: number;
  email: string;
}

/**
 * Puerto de persistencia de sesiones activas del panel. El JWT firmado es la credencial; este registro es la
 * lista de sesiones vigentes (allowlist): sin sesión registrada, el token no sirve aunque la firma y el
 * vencimiento sean válidos. Eso permite que "cerrar sesión" revoque de verdad y que cambiar la contraseña
 * cierre todas las sesiones.
 */
export interface SessionRepository {
  /** `expiresAt` en segundos desde epoch (igual que el claim `exp` del JWT). */
  create(sessionId: string, adminId: number, expiresAt: number, now: Date): Promise<void>;
  findActive(sessionId: string, adminId: number, nowSeconds: number): Promise<ActiveSession | undefined>;
  delete(sessionId: string): Promise<void>;
  /** Cierra todas las sesiones de un admin. Devuelve cuántas había. */
  deleteAllForAdmin(adminId: number): Promise<number>;
  /** Borra las sesiones vencidas. Devuelve cuántas. */
  purgeExpired(nowSeconds: number): Promise<number>;
}
