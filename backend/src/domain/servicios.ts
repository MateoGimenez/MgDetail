/**
 * Catálogo de servicios del taller. La fuente de verdad es la tabla mgdetailing.servicios (editable desde el panel):
 * de ahí salen los servicios que se pueden reservar, los textos de la landing y los nombres de los avisos y logs.
 * Contrato: reportes/2026-10-22_07_catalogo-editable.md.
 */

/** Slug del id: minúsculas, números y guiones simples, hasta 64 caracteres. Inmutable después de crearlo. */
export const SERVICIO_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SERVICIO_ID_MAX = 64;

/** Topes del contrato (los mismos que los CHECK de la migración catalogo_editable). */
export const LIMITES_SERVICIO = {
  nombre: 80,
  resumen: 200,
  descripcion: 1500,
  incluyeItems: 15,
  incluyeItem: 120,
  glosarioItems: 10,
  termino: 60,
  significado: 300,
  duracion: 60,
  precioMax: 99_999_999,
} as const;

/** Una palabra técnica del servicio, explicada en una línea. */
export interface TerminoGlosario {
  termino: string;
  significado: string;
}

/** Servicio tal como sale por la API del panel (camelCase, fechas ISO 8601). */
export interface Servicio {
  id: string;
  nombre: string;
  resumen: string;
  descripcion: string;
  incluye: string[];
  glosario: TerminoGlosario[];
  /** Texto libre ("2 a 3 h"). null = sin confirmar. */
  duracion: string | null;
  /** Entero en ARS. null = "Consultá". */
  precioDesde: number | null;
  /** A lo sumo uno en true. */
  destacado: boolean;
  /** false = ya no se ofrece (no se borra: hay turnos que lo referencian). */
  activo: boolean;
  /** Orden de presentación (menor primero). */
  orden: number;
  updatedAt: string;
}

/** Lo que ve la landing (GET /api/servicios): sin activo, orden ni updatedAt. */
export type ServicioPublico = Omit<Servicio, 'activo' | 'orden' | 'updatedAt'>;

/** Datos ya validados de un servicio nuevo. `orden` lo asigna el repositorio (al final). */
export type NuevoServicio = Omit<Servicio, 'orden' | 'updatedAt'>;

/** Cambios sobre un servicio. Lo que no viene, no cambia. El id no se puede cambiar. */
export type CambiosServicio = Partial<Omit<NuevoServicio, 'id'>>;

/** Ya existe un servicio con ese id (activo o no). */
export class ServicioExisteError extends Error {
  constructor(readonly id: string) {
    super('Ya existe un servicio con ese identificador.');
    this.name = 'ServicioExisteError';
  }
}

/** Mensaje (en el campo destacado) cuando se intenta destacar un servicio inactivo. */
export const DESTACADO_INACTIVO_MSG = 'No se puede destacar un servicio inactivo. Activalo primero.';

/** Se pidió destacar un servicio que queda inactivo: el destacado se ve en la landing y un inactivo no. */
export class DestacadoInactivoError extends Error {
  constructor() {
    super(DESTACADO_INACTIVO_MSG);
    this.name = 'DestacadoInactivoError';
  }
}

/** La lista del reordenamiento no tiene exactamente los ids del catálogo (faltan o sobran). */
export class OrdenInvalidoError extends Error {
  constructor() {
    super('La lista tiene que tener todos los servicios del catálogo, cada uno una sola vez.');
    this.name = 'OrdenInvalidoError';
  }
}

/**
 * Puerto de persistencia del catálogo. Las escrituras que tocan más de una fila (destacado, orden) son atómicas:
 * se hacen en una transacción y se serializan entre sí.
 */
export interface ServicioRepository {
  /** Todos (o solo los activos), ordenados por `orden` y después por `id`. */
  list(options?: { soloActivos?: boolean }): Promise<Servicio[]>;
  /** undefined si no existe. */
  findById(id: string): Promise<Servicio | undefined>;
  /**
   * Crea el servicio al final del orden. Si viene destacado, desmarca al anterior en la misma transacción.
   * Lanza ServicioExisteError si el id ya existe y DestacadoInactivoError si viene destacado e inactivo.
   */
  create(nuevo: NuevoServicio, now: Date): Promise<Servicio>;
  /**
   * undefined si no existe. destacado: true desmarca al anterior en la misma transacción. Desactivar el servicio lo
   * desmarca (destacado = false) en la misma operación. Lanza DestacadoInactivoError si el servicio quedaría
   * inactivo y destacado (ya estaba inactivo, o se desactiva y se destaca en el mismo cambio).
   */
  update(id: string, cambios: CambiosServicio, now: Date): Promise<Servicio | undefined>;
  /**
   * Guarda `orden = posición × 10` (1, 2, 3... × 10) en una transacción y devuelve el catálogo completo.
   * `ids` tiene que ser exactamente el conjunto de ids del catálogo; si no, OrdenInvalidoError.
   */
  reorder(ids: readonly string[], now: Date): Promise<Servicio[]>;
}

/** Proyección pública de un servicio (los campos marcados "Público" en el contrato). */
export function servicioPublico(servicio: Servicio): ServicioPublico {
  return {
    id: servicio.id,
    nombre: servicio.nombre,
    resumen: servicio.resumen,
    descripcion: servicio.descripcion,
    incluye: servicio.incluye,
    glosario: servicio.glosario,
    duracion: servicio.duracion,
    precioDesde: servicio.precioDesde,
    destacado: servicio.destacado,
  };
}
