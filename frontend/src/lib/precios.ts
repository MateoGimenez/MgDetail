import { VEHICULO_TIPOS, type VehiculoTipo } from '../api/contract';

/**
 * Precios por tipo de vehículo (reportes/2026-11-01_19_precios-por-vehiculo.md).
 * `precioDesde` es el de auto; camioneta y moto tienen su propia columna. null = "Consultá": nunca se cae al
 * precio de auto cuando falta el del tipo elegido (sería engañoso).
 */
export interface ConPrecios {
  /** Para qué vehículos se ofrece el servicio. */
  readonly vehiculos: readonly VehiculoTipo[];
  readonly precioDesde: number | null;
  readonly precioDesdeCamioneta: number | null;
  readonly precioDesdeMoto: number | null;
}

/** Precio del servicio para ese tipo de vehículo (null = "Consultá"). */
export function precioPorVehiculo(servicio: ConPrecios, tipo: VehiculoTipo): number | null {
  switch (tipo) {
    case 'auto':
      return servicio.precioDesde;
    case 'camioneta':
      return servicio.precioDesdeCamioneta;
    case 'moto':
      return servicio.precioDesdeMoto;
  }
}

/**
 * El menor precio cargado entre los tipos que el servicio ofrece, o null si no hay ninguno (para el JSON-LD).
 * Un precio de un tipo que no se ofrece no cuenta: en la web no se ve.
 */
export function menorPrecio(servicio: ConPrecios): number | null {
  const cargados = VEHICULO_TIPOS.filter((tipo) => servicio.vehiculos.includes(tipo))
    .map((tipo) => precioPorVehiculo(servicio, tipo))
    .filter((precio): precio is number => precio !== null);
  return cargados.length > 0 ? Math.min(...cargados) : null;
}

/** ¿El servicio se ofrece para ese tipo de vehículo? */
export const seOfrecePara = (servicio: Pick<ConPrecios, 'vehiculos'>, tipo: VehiculoTipo): boolean =>
  servicio.vehiculos.includes(tipo);

/** Los servicios de la lista que se ofrecen para ese tipo, en el mismo orden. */
export function serviciosPara<T extends Pick<ConPrecios, 'vehiculos'>>(servicios: readonly T[], tipo: VehiculoTipo): T[] {
  return servicios.filter((servicio) => seOfrecePara(servicio, tipo));
}

/** Los tipos para los que se ofrece, en orden canónico (auto, camioneta, moto). */
export const tiposOfrecidos = (servicio: Pick<ConPrecios, 'vehiculos'>): VehiculoTipo[] =>
  VEHICULO_TIPOS.filter((tipo) => servicio.vehiculos.includes(tipo));
