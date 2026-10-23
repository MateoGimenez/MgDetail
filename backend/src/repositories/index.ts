import type { SqlClient } from '../db/postgres.js';
import type { BookingRepository } from '../domain/booking.js';
import type { PerfilRepository } from '../domain/perfil.js';
import type { ServicioRepository } from '../domain/servicios.js';
import { PostgresBookingRepository } from './postgres/bookings.js';
import { PostgresPerfilRepository } from './postgres/perfiles.js';
import { PostgresServicioRepository } from './postgres/servicios.js';

export interface Repositories {
  bookings: BookingRepository;
  perfiles: PerfilRepository;
  servicios: ServicioRepository;
}

/** Los repositorios sobre Postgres (esquema mgdetailing ya migrado; ver supabase/migrations/). */
export function createPostgresRepositories(sql: SqlClient): Repositories {
  return {
    bookings: new PostgresBookingRepository(sql),
    perfiles: new PostgresPerfilRepository(sql),
    servicios: new PostgresServicioRepository(sql),
  };
}
