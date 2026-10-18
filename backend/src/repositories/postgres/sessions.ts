import type { SqlClient } from '../../db/postgres.js';
import { int, str } from '../../db/rows.js';
import type { ActiveSession, SessionRepository } from '../../domain/session.js';
import { isUuid } from './uuid.js';

/**
 * Sesiones activas del panel sobre Postgres (ver el puerto SessionRepository). El puerto habla en segundos desde
 * epoch (como el claim `exp` del JWT); la tabla guarda timestamptz y se convierte con to_timestamp().
 */
export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly sql: SqlClient) {}

  async create(sessionId: string, adminId: number, expiresAt: number, now: Date): Promise<void> {
    await this.sql.query(
      `INSERT INTO mgdetailing.sessions (id, admin_id, expires_at, created_at)
       VALUES ($1::uuid, $2, to_timestamp($3), $4::timestamptz)`,
      [sessionId, adminId, expiresAt, now.toISOString()],
    );
  }

  async findActive(sessionId: string, adminId: number, nowSeconds: number): Promise<ActiveSession | undefined> {
    if (!isUuid(sessionId)) return undefined;
    const { rows } = await this.sql.query(
      `SELECT s.id::text AS session_id, a.id AS admin_id, a.email AS email
       FROM mgdetailing.sessions AS s
       JOIN mgdetailing.admins AS a ON a.id = s.admin_id
       WHERE s.id = $1::uuid AND s.admin_id = $2 AND s.expires_at > to_timestamp($3)`,
      [sessionId, adminId, nowSeconds],
    );
    const row = rows[0];
    if (!row) return undefined;
    return { sessionId: str(row, 'session_id'), adminId: int(row, 'admin_id'), email: str(row, 'email') };
  }

  async delete(sessionId: string): Promise<void> {
    if (!isUuid(sessionId)) return;
    await this.sql.query('DELETE FROM mgdetailing.sessions WHERE id = $1::uuid', [sessionId]);
  }

  async deleteAllForAdmin(adminId: number): Promise<number> {
    const { rowCount } = await this.sql.query('DELETE FROM mgdetailing.sessions WHERE admin_id = $1', [adminId]);
    return rowCount;
  }

  async purgeExpired(nowSeconds: number): Promise<number> {
    const { rowCount } = await this.sql.query(
      'DELETE FROM mgdetailing.sessions WHERE expires_at <= to_timestamp($1)',
      [nowSeconds],
    );
    return rowCount;
  }
}
