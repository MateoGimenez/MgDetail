import {
  type CambiosServicio,
  DestacadoInactivoError,
  type NuevoServicio,
  OrdenInvalidoError,
  type Servicio,
  ServicioExisteError,
  type ServicioRepository,
} from '../domain/servicios.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { UsuarioSesion } from './auth.js';

export interface ServicioServiceDeps {
  servicios: ServicioRepository;
  logger: Logger;
  now: () => Date;
}

const NOT_FOUND_MESSAGE = 'No encontramos ese servicio.';

/** 400 en el campo destacado: no se puede destacar un servicio inactivo. */
const destacadoInactivo = (error: DestacadoInactivoError): AppError =>
  AppError.validation({ destacado: error.message }, error.message);

/**
 * Casos de uso del catálogo editable (contrato: reportes/2026-10-22_07_catalogo-editable.md). Los permisos los
 * exige la ruta (domain/permisos.ts, puedeEditarCatalogo); acá se traducen los errores del dominio a la API y se
 * deja constancia en el log (solo ids, quién y qué campos: nunca los textos).
 */
export class ServicioService {
  constructor(private readonly deps: ServicioServiceDeps) {}

  /** Catálogo completo para el panel (activos e inactivos). */
  list(): Promise<Servicio[]> {
    return this.deps.servicios.list();
  }

  /** Lo que ve la landing: solo los activos. */
  listActivos(): Promise<Servicio[]> {
    return this.deps.servicios.list({ soloActivos: true });
  }

  async create(actor: UsuarioSesion, nuevo: NuevoServicio): Promise<Servicio> {
    let creado: Servicio;
    try {
      creado = await this.deps.servicios.create(nuevo, this.deps.now());
    } catch (error) {
      if (error instanceof ServicioExisteError) throw AppError.servicioExiste();
      if (error instanceof DestacadoInactivoError) throw destacadoInactivo(error);
      throw error;
    }
    this.deps.logger.info(`Servicio creado id=${creado.id} por=${actor.id}`);
    return creado;
  }

  async update(actor: UsuarioSesion, id: string, cambios: CambiosServicio): Promise<Servicio> {
    let actualizado: Servicio | undefined;
    try {
      actualizado = await this.deps.servicios.update(id, cambios, this.deps.now());
    } catch (error) {
      if (error instanceof DestacadoInactivoError) throw destacadoInactivo(error);
      throw error;
    }
    if (actualizado === undefined) throw AppError.notFound(NOT_FOUND_MESSAGE);
    this.deps.logger.info(`Servicio actualizado id=${id} por=${actor.id} campos=${Object.keys(cambios).join(',')}`);
    return actualizado;
  }

  async reorder(actor: UsuarioSesion, ids: readonly string[]): Promise<Servicio[]> {
    let servicios: Servicio[];
    try {
      servicios = await this.deps.servicios.reorder(ids, this.deps.now());
    } catch (error) {
      if (error instanceof OrdenInvalidoError) throw AppError.validation({ ids: error.message }, error.message);
      throw error;
    }
    this.deps.logger.info(`Catálogo reordenado por=${actor.id}`);
    return servicios;
  }
}
