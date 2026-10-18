import type { DatabaseSync } from 'node:sqlite';
import type { SqlClient } from '../db/postgres.js';
import type { AdminRepository } from '../domain/admin.js';
import type { BookingRepository } from '../domain/booking.js';
import type { SessionRepository } from '../domain/session.js';
import { SqliteAdminRepository } from './admins.js';
import { SqliteBookingRepository } from './bookings.js';
import { PostgresAdminRepository } from './postgres/admins.js';
import { PostgresBookingRepository } from './postgres/bookings.js';
import { PostgresSessionRepository } from './postgres/sessions.js';
import { SqliteSessionRepository } from './sessions.js';

export interface Repositories {
  bookings: BookingRepository;
  admins: AdminRepository;
  sessions: SessionRepository;
}

/** Los tres repositorios sobre una misma base SQLite (ya abierta y migrada). */
export function createSqliteRepositories(db: DatabaseSync): Repositories {
  return {
    bookings: new SqliteBookingRepository(db),
    admins: new SqliteAdminRepository(db),
    sessions: new SqliteSessionRepository(db),
  };
}

/** Los tres repositorios sobre Postgres (esquema mgdetailing ya migrado; ver supabase/migrations/). */
export function createPostgresRepositories(sql: SqlClient): Repositories {
  return {
    bookings: new PostgresBookingRepository(sql),
    admins: new PostgresAdminRepository(sql),
    sessions: new PostgresSessionRepository(sql),
  };
}
