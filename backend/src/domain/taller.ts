/**
 * Datos del taller que salen en los PDF (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md,
 * "Datos del taller"). Una sola fila (mgdetailing.taller, id = 1), sembrada por la migración.
 */

export interface Taller {
  nombre: string;
  /** Solo dígitos, formato internacional (8 a 15): 5493804781737. */
  telefono: string | null;
  direccion: string | null;
  /** Usuario de Instagram, sin @. */
  instagram: string | null;
  /** 11 dígitos o NN-NNNNNNNN-N. */
  cuit: string | null;
  /** Texto extra al pie de los PDF. */
  leyendaPdf: string | null;
}

export const TALLER_NOMBRE_MAX = 80;
export const TALLER_DIRECCION_MAX = 160;
export const TALLER_LEYENDA_MAX = 300;

export interface TallerRepository {
  /** La fila del taller (la migración la siembra: si falta, lanza un error). */
  obtener(): Promise<Taller>;
  guardar(taller: Taller, ahora: Date): Promise<Taller>;
}
