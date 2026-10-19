import type { SqlClient } from '../db/postgres.js';
import type { BookingRepository } from '../domain/booking.js';
import type { PerfilRepository } from '../domain/perfil.js';
import { PostgresBookingRepository } from './postgres/bookings.js';
import { PostgresPerfilRepository } from './postgres/perfiles.js';

export interface Repositories {
  bookings: BookingRepository;
  perfiles: PerfilRepository;
}

/** Los repositorios sobre Postgres (esquema mgdetailing ya migrado; ver supabase/migrations/). */
export function createPostgresRepositories(sql: SqlClient): Repositories {
  return {
    bookings: new PostgresBookingRepository(sql),
    perfiles: new PostgresPerfilRepository(sql),
  };
}
