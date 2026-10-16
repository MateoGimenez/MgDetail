import type { ServicioId } from './servicios.js';

export const VEHICULO_TIPOS = ['auto', 'camioneta', 'moto'] as const;
export const FRANJAS = ['manana', 'tarde'] as const;
export const ESTADOS = ['pendiente', 'confirmado', 'completado', 'cancelado'] as const;

export type VehiculoTipo = (typeof VEHICULO_TIPOS)[number];
export type Franja = (typeof FRANJAS)[number];
export type Estado = (typeof ESTADOS)[number];

/** Datos ya validados de una solicitud de turno (lo que se guarda). */
export interface NewBooking {
  nombre: string;
  /** Tal como lo escribió el cliente (con trim). */
  telefono: string;
  email: string | null;
  vehiculoTipo: VehiculoTipo;
  vehiculoModelo: string | null;
  servicioId: ServicioId;
  /** YYYY-MM-DD */
  fechaPreferida: string;
  franja: Franja;
  comentario: string | null;
}

/** Turno tal como lo devuelve la API de administración (camelCase, fechas ISO 8601). */
export interface Booking extends Omit<NewBooking, 'servicioId'> {
  id: string;
  /** string (no ServicioId): un turno viejo puede apuntar a un servicio que ya no está en el catálogo. */
  servicioId: string;
  /**
   * Teléfono listo para https://wa.me/<n>: solo dígitos, formato internacional, sin "+".
   * null si el teléfono no se puede interpretar. Se calcula al leer (no se guarda): ver domain/telefono.ts.
   */
  telefonoWhatsapp: string | null;
  estado: Estado;
  createdAt: string;
  updatedAt: string;
}

/** Lo único que se devuelve al público al crear un turno (sin datos personales). */
export interface PublicBooking {
  id: string;
  servicioId: ServicioId;
  fechaPreferida: string;
  franja: Franja;
  estado: 'pendiente';
}

export interface ListBookingsOptions {
  estado?: Estado;
  limit: number;
  offset: number;
}

/**
 * Puerto de persistencia de turnos. Los métodos son async para que la implementación pueda cambiar
 * (SQLite hoy, otra base mañana) sin tocar rutas ni servicios.
 */
export interface BookingRepository {
  /** Guarda un turno nuevo en estado "pendiente". */
  create(input: NewBooking, now: Date): Promise<Booking>;
  /** Más nuevas primero. `total` es la cantidad que cumple el filtro, sin paginar. */
  list(options: ListBookingsOptions): Promise<{ bookings: Booking[]; total: number }>;
  /** undefined si el turno no existe. */
  updateEstado(id: string, estado: Estado, now: Date): Promise<Booking | undefined>;
  /** true si existía y se borró. */
  delete(id: string): Promise<boolean>;
}
