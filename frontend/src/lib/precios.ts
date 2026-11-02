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

/** Duraciones por tipo de vehículo. Camioneta y moto en null = misma que auto. */
export interface ConDuraciones {
  readonly duracion: string | null;
  readonly duracionCamioneta: string | null;
  readonly duracionMoto: string | null;
}

/**
 * Duración del servicio para ese tipo de vehículo. A diferencia del precio, acá SÍ se cae a la de auto cuando
 * la del tipo no está cargada (vacío = misma que auto). null = "A confirmar".
 */
export function duracionPorVehiculo(servicio: ConDuraciones, tipo: VehiculoTipo): string | null {
  const propia = tipo === 'camioneta' ? servicio.duracionCamioneta : tipo === 'moto' ? servicio.duracionMoto : null;
  return propia ?? servicio.duracion;
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

/** Cuántos servicios se ofrecen para cada tipo (para el número de cada pestaña). */
export function contarPorVehiculo(servicios: readonly Pick<ConPrecios, 'vehiculos'>[]): Record<VehiculoTipo, number> {
  return {
    auto: serviciosPara(servicios, 'auto').length,
    camioneta: serviciosPara(servicios, 'camioneta').length,
    moto: serviciosPara(servicios, 'moto').length,
  };
}

/**
 * Los vehículos que quedan al quitar el servicio de uno. null si no se puede: un servicio tiene que ofrecerse para
 * al menos un vehículo (para dejar de mostrarlo en la web está «Ocultar», que no toca los vehículos).
 */
export function vehiculosSin(servicio: Pick<ConPrecios, 'vehiculos'>, tipo: VehiculoTipo): VehiculoTipo[] | null {
  const quedan = VEHICULO_TIPOS.filter((t) => t !== tipo && servicio.vehiculos.includes(t));
  return quedan.length > 0 ? quedan : null;
}
