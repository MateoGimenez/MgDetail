import type { Taller, TallerRepository } from '../domain/taller.js';
import type { Logger } from '../lib/logger.js';
import type { UsuarioSesion } from './auth.js';

export interface TallerServiceDeps {
  taller: TallerRepository;
  logger: Logger;
  now: () => Date;
}

/**
 * Datos del taller que salen en los PDF (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md). Los
 * permisos los exige la ruta (domain/permisos.ts, puedeEditarTaller). El generador de PDF usa `obtener()`.
 */
export class TallerService {
  constructor(private readonly deps: TallerServiceDeps) {}

  /** Nombre, teléfono, dirección, Instagram, CUIT y leyenda del taller (los opcionales pueden ser null). */
  obtener(): Promise<Taller> {
    return this.deps.taller.obtener();
  }

  async guardar(actor: UsuarioSesion, datos: Taller): Promise<Taller> {
    const guardado = await this.deps.taller.guardar(datos, this.deps.now());
    this.deps.logger.info(`Datos del taller actualizados por=${actor.id}`);
    return guardado;
  }
}
