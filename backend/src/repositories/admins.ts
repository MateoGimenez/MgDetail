import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { type Row, int, str } from '../db/rows.js';
import type { AdminRecord, AdminRepository } from '../domain/admin.js';

function toAdmin(row: Row): AdminRecord {
  return { id: int(row, 'id'), email: str(row, 'email'), passwordHash: str(row, 'password_hash') };
}

/** Administradores sobre SQLite. Los emails se guardan siempre normalizados a minúsculas. */
export class SqliteAdminRepository implements AdminRepository {
  private readonly findByEmailStmt: StatementSync;
  private readonly insertStmt: StatementSync;
  private readonly updatePasswordStmt: StatementSync;

  constructor(db: DatabaseSync) {
    this.findByEmailStmt = db.prepare('SELECT * FROM admins WHERE email = ?');
    this.insertStmt = db.prepare(
      'INSERT INTO admins (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id',
    );
    this.updatePasswordStmt = db.prepare(
      'UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ? RETURNING id',
    );
  }

  async findByEmail(email: string): Promise<AdminRecord | undefined> {
    return this.findByEmailSync(email);
  }

  async save(email: string, passwordHash: string, now: Date): Promise<{ id: number; created: boolean }> {
    const normalized = email.toLowerCase();
    const timestamp = now.toISOString();
    const existing = this.findByEmailSync(normalized);

    if (existing) {
      this.updatePasswordStmt.get(passwordHash, timestamp, existing.id);
      return { id: existing.id, created: false };
    }
    const row = this.insertStmt.get(normalized, passwordHash, timestamp, timestamp);
    if (!row) {
      throw new Error('INSERT de admin no devolvió la fila creada');
    }
    return { id: int(row, 'id'), created: true };
  }

  private findByEmailSync(email: string): AdminRecord | undefined {
    const row = this.findByEmailStmt.get(email.toLowerCase());
    return row ? toAdmin(row) : undefined;
  }
}
