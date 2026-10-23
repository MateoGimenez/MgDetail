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
  /** id de un servicio del catálogo (mgdetailing.servicios) que estaba activo al pedir el turno. */
  servicioId: string;
  /** YYYY-MM-DD */
  fechaPreferida: string;
  franja: Franja;
  comentario: string | null;
}

/** Turno tal como lo devuelve la API de administración (camelCase, fechas ISO 8601). */
export interface Booking extends NewBooking {
  id: string;
  /**
   * Teléfono listo para https://wa.me/<n>: solo dígitos, formato internacional, sin "+".
   * null si el teléfono no se puede interpretar. Se guarda al crear el turno (columna telefono_whatsapp, la que
   * identifica al cliente); en un turno viejo todavía sin normalizar se calcula al leer: ver domain/telefono.ts.
   */
  telefonoWhatsapp: string | null;
  /**
   * Fecha (YYYY-MM-DD) que confirmó el taller, si es distinta de la pedida. null = se confirmó (o se confirmará)
   * para `fechaPreferida`. Va siempre junto con `franjaConfirmada` (las dos null o las dos con valor).
   */
  fechaConfirmada: string | null;
  franjaConfirmada: Franja | null;
  estado: Estado;
  /** Nota interna del taller (hasta 1000 caracteres). Nunca sale por la API pública ni en los avisos. */
  notasInternas: string | null;
  /**
   * Cuántos turnos tienen el mismo teléfono normalizado guardado (columna telefono_whatsapp), contando este y
   * todos los estados (1 = primer turno). null si el turno no tiene teléfono normalizado guardado.
   */
  turnosDelCliente: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Lo único que se devuelve al público al crear un turno (sin datos personales). */
export interface PublicBooking {
  id: string;
  servicioId: string;
  fechaPreferida: string;
  franja: Franja;
  estado: 'pendiente';
}

export interface ListBookingsOptions {
  estado?: Estado;
  /**
   * Texto de búsqueda (ya validado: trim, 2 a 80 caracteres). Coincide, sin mayúsculas ni acentos, con nombre,
   * email o modelo; o, si tiene al menos MIN_DIGITOS_BUSQUEDA dígitos, con los dígitos del teléfono o con
   * telefonoWhatsapp. Los comodines de LIKE (porcentaje, guion bajo, barra invertida) se buscan como texto.
   */
  q?: string;
  /** Un telefonoWhatsapp exacto: todos los turnos de ese cliente. */
  cliente?: string;
  limit: number;
  offset: number;
}

/** Mínimo de dígitos en `q` para buscar también por teléfono. */
export const MIN_DIGITOS_BUSQUEDA = 4;

/** Cambios de un turno que no tocan la fecha de agenda. undefined = no se toca; notasInternas null = borrar la nota. */
export interface ActualizacionTurno {
  estado?: Estado;
  notasInternas?: string | null;
}

/** Estados en los que un turno ya no se puede reprogramar. */
export const ESTADOS_CERRADOS: readonly Estado[] = ['cancelado', 'completado'];

/** Fecha y franja confirmadas por el taller (siempre juntas). */
export interface Confirmada {
  /** YYYY-MM-DD */
  fecha: string;
  franja: Franja;
}

/** Cambio de la fecha de agenda de un turno (PATCH /api/admin/bookings/:id con fechaConfirmada + franjaConfirmada). */
export interface Reprogramacion {
  /** null = volver a lo que pidió el cliente. */
  confirmada: Confirmada | null;
  /** Si viene, se cambia el estado en la misma escritura (p. ej. "confirmar para otra fecha"). */
  estado?: Estado;
  /** Si viene, se cambia la nota interna en la misma escritura (null = borrarla). */
  notasInternas?: string | null;
}

/** El turno está cancelado o completado: no se le puede cambiar la fecha. */
export class TurnoCerradoError extends Error {
  constructor(readonly estado: Estado) {
    super(`No se puede cambiar la fecha de un turno ${estado}.`);
    this.name = 'TurnoCerradoError';
  }
}

/**
 * Puerto de persistencia de turnos. Los métodos son async para que la implementación pueda cambiar sin tocar
 * rutas ni servicios.
 */
export interface BookingRepository {
  /** Guarda un turno nuevo en estado "pendiente". */
  create(input: NewBooking, now: Date): Promise<Booking>;
  /** Más nuevas primero. `total` es la cantidad que cumple el filtro, sin paginar. */
  list(options: ListBookingsOptions): Promise<{ bookings: Booking[]; total: number }>;
  /**
   * Cambia el estado y/o la nota interna en una sola escritura (también en un turno cancelado o completado).
   * undefined si el turno no existe.
   */
  actualizar(id: string, cambios: ActualizacionTurno, now: Date): Promise<Booking | undefined>;
  /** undefined si el turno no existe. */
  updateEstado(id: string, estado: Estado, now: Date): Promise<Booking | undefined>;
  /**
   * Cambia la fecha/franja confirmadas (y el estado, si viene) en una sola escritura. undefined si el turno no
   * existe; TurnoCerradoError si está cancelado o completado (se verifica en el mismo UPDATE, sin carreras).
   */
  reprogramar(id: string, cambios: Reprogramacion, now: Date): Promise<Booking | undefined>;
  /**
   * Turnos no cancelados cuya fecha de agenda (la confirmada si existe, si no la pedida) cae en [desde, hasta],
   * ambos inclusive. Orden: fecha de agenda, franja de agenda (mañana antes que tarde) y orden de llegada.
   */
  agenda(desde: string, hasta: string): Promise<Booking[]>;
  /** true si existía y se borró. */
  delete(id: string): Promise<boolean>;
}
