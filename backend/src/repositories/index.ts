import type { SqlClient } from '../db/postgres.js';
import type { BookingRepository } from '../domain/booking.js';
import type { DisponibilidadRepository } from '../domain/disponibilidad.js';
import type { PerfilRepository } from '../domain/perfil.js';
import type { PushRepository } from '../domain/push.js';
import type { ServicioRepository } from '../domain/servicios.js';
import { PostgresBookingRepository } from './postgres/bookings.js';
import { PostgresDisponibilidadRepository } from './postgres/disponibilidad.js';
import { PostgresPerfilRepository } from './postgres/perfiles.js';
import { PostgresPushRepository } from './postgres/push.js';
import { PostgresServicioRepository } from './postgres/servicios.js';

export interface Repositories {
  bookings: BookingRepository;
  perfiles: PerfilRepository;
  servicios: ServicioRepository;
  disponibilidad: DisponibilidadRepository;
  push: PushRepository;
}

/** Los repositorios sobre Postgres (esquema mgdetailing ya migrado; ver supabase/migrations/). */
export function createPostgresRepositories(sql: SqlClient): Repositories {
  return {
    bookings: new PostgresBookingRepository(sql),
    perfiles: new PostgresPerfilRepository(sql),
    servicios: new PostgresServicioRepository(sql),
    disponibilidad: new PostgresDisponibilidadRepository(sql),
    push: new PostgresPushRepository(sql),
  };
}
