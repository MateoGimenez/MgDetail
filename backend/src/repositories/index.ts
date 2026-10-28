import type { SqlClient } from '../db/postgres.js';
import type { BookingRepository } from '../domain/booking.js';
import type { ComprobanteRepository } from '../domain/comprobantes.js';
import type { DisponibilidadRepository } from '../domain/disponibilidad.js';
import type { EstadisticasRepository } from '../domain/estadisticas.js';
import type { GastoRepository } from '../domain/gastos.js';
import type { InventarioRepository } from '../domain/inventario.js';
import type { MetaRepository } from '../domain/metas.js';
import type { PerfilRepository } from '../domain/perfil.js';
import type { PresupuestoRepository } from '../domain/presupuestos.js';
import type { PushRepository } from '../domain/push.js';
import type { ServicioRepository } from '../domain/servicios.js';
import type { TallerRepository } from '../domain/taller.js';
import { PostgresBookingRepository } from './postgres/bookings.js';
import { PostgresComprobanteRepository } from './postgres/comprobantes.js';
import { PostgresDisponibilidadRepository } from './postgres/disponibilidad.js';
import { PostgresEstadisticasRepository } from './postgres/estadisticas.js';
import { PostgresGastoRepository } from './postgres/gastos.js';
import { PostgresInventarioRepository } from './postgres/inventario.js';
import { PostgresMetaRepository } from './postgres/metas.js';
import { PostgresPerfilRepository } from './postgres/perfiles.js';
import { PostgresPresupuestoRepository } from './postgres/presupuestos.js';
import { PostgresPushRepository } from './postgres/push.js';
import { PostgresServicioRepository } from './postgres/servicios.js';
import { PostgresTallerRepository } from './postgres/taller.js';

export interface Repositories {
  bookings: BookingRepository;
  perfiles: PerfilRepository;
  servicios: ServicioRepository;
  disponibilidad: DisponibilidadRepository;
  push: PushRepository;
  estadisticas: EstadisticasRepository;
  gastos: GastoRepository;
  metas: MetaRepository;
  taller: TallerRepository;
  inventario: InventarioRepository;
  presupuestos: PresupuestoRepository;
  comprobantes: ComprobanteRepository;
}

/** Los repositorios sobre Postgres (esquema mgdetailing ya migrado; ver supabase/migrations/). */
export function createPostgresRepositories(sql: SqlClient): Repositories {
  return {
    bookings: new PostgresBookingRepository(sql),
    perfiles: new PostgresPerfilRepository(sql),
    servicios: new PostgresServicioRepository(sql),
    disponibilidad: new PostgresDisponibilidadRepository(sql),
    push: new PostgresPushRepository(sql),
    estadisticas: new PostgresEstadisticasRepository(sql),
    gastos: new PostgresGastoRepository(sql),
    metas: new PostgresMetaRepository(sql),
    taller: new PostgresTallerRepository(sql),
    inventario: new PostgresInventarioRepository(sql),
    presupuestos: new PostgresPresupuestoRepository(sql),
    comprobantes: new PostgresComprobanteRepository(sql),
  };
}
