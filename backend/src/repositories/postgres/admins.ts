import type { SqlClient } from '../../db/postgres.js';
import { int, str } from '../../db/rows.js';
import type { AdminRecord, AdminRepository } from '../../domain/admin.js';

/**
 * Administradores sobre Postgres. El email se guarda en minúsculas (lower() de Postgres, que es también lo que
 * exige el CHECK de la tabla) y se busca sin distinguir mayúsculas con el índice único sobre lower(email).
 */
export class PostgresAdminRepository implements AdminRepository {
  constructor(private readonly sql: SqlClient) {}

  async findByEmail(email: string): Promise<AdminRecord | undefined> {
    const { rows } = await this.sql.query(
      'SELECT id, email, password_hash FROM mgdetailing.admins WHERE lower(email) = lower($1)',
      [email],
    );
    const row = rows[0];
    return row ? { id: int(row, 'id'), email: str(row, 'email'), passwordHash: str(row, 'password_hash') } : undefined;
  }

  async save(email: string, passwordHash: string, now: Date): Promise<{ id: number; created: boolean }> {
    const timestamp = now.toISOString();
    // Dos intentos: si otro proceso crea el mismo email entre el UPDATE y el INSERT, el segundo UPDATE lo encuentra.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const updated = await this.sql.query(
        `UPDATE mgdetailing.admins SET password_hash = $2, updated_at = $3::timestamptz
         WHERE lower(email) = lower($1)
         RETURNING id`,
        [email, passwordHash, timestamp],
      );
      const existing = updated.rows[0];
      if (existing) return { id: int(existing, 'id'), created: false };

      const inserted = await this.sql.query(
        `INSERT INTO mgdetailing.admins (email, password_hash, created_at, updated_at)
         VALUES (lower($1), $2, $3::timestamptz, $3::timestamptz)
         ON CONFLICT ((lower(email))) DO NOTHING
         RETURNING id`,
        [email, passwordHash, timestamp],
      );
      const created = inserted.rows[0];
      if (created) return { id: int(created, 'id'), created: true };
    }
    throw new Error('No se pudo guardar el admin (conflicto concurrente con el mismo email)');
  }
}
