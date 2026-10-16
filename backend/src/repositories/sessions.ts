import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { int, str } from '../db/rows.js';
import type { ActiveSession, SessionRepository } from '../domain/session.js';

/** Sesiones activas del panel sobre SQLite (ver el puerto SessionRepository para el modelo de sesiones). */
export class SqliteSessionRepository implements SessionRepository {
  private readonly insertStmt: StatementSync;
  private readonly findActiveStmt: StatementSync;
  private readonly deleteStmt: StatementSync;
  private readonly deleteForAdminStmt: StatementSync;
  private readonly purgeStmt: StatementSync;

  constructor(db: DatabaseSync) {
    this.insertStmt = db.prepare('INSERT INTO sessions (id, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)');
    this.findActiveStmt = db.prepare(`
      SELECT s.id AS session_id, a.id AS admin_id, a.email AS email
      FROM sessions AS s
      JOIN admins AS a ON a.id = s.admin_id
      WHERE s.id = ? AND s.admin_id = ? AND s.expires_at > ?
    `);
    this.deleteStmt = db.prepare('DELETE FROM sessions WHERE id = ?');
    this.deleteForAdminStmt = db.prepare('DELETE FROM sessions WHERE admin_id = ?');
    this.purgeStmt = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  }

  async create(sessionId: string, adminId: number, expiresAt: number, now: Date): Promise<void> {
    this.insertStmt.run(sessionId, adminId, expiresAt, now.toISOString());
  }

  async findActive(sessionId: string, adminId: number, nowSeconds: number): Promise<ActiveSession | undefined> {
    const row = this.findActiveStmt.get(sessionId, adminId, nowSeconds);
    if (!row) return undefined;
    return { sessionId: str(row, 'session_id'), adminId: int(row, 'admin_id'), email: str(row, 'email') };
  }

  async delete(sessionId: string): Promise<void> {
    this.deleteStmt.run(sessionId);
  }

  async deleteAllForAdmin(adminId: number): Promise<number> {
    return Number(this.deleteForAdminStmt.run(adminId).changes);
  }

  async purgeExpired(nowSeconds: number): Promise<number> {
    return Number(this.purgeStmt.run(nowSeconds).changes);
  }
}
