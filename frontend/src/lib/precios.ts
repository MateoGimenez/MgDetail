import type { VehiculoTipo } from '../api/contract';

/**
 * Precios por tipo de vehículo (reportes/2026-11-01_19_precios-por-vehiculo.md).
 * `precioDesde` es el de auto; camioneta y moto tienen su propia columna. null = "Consultá": nunca se cae al
 * precio de auto cuando falta el del tipo elegido (sería engañoso).
 */
export interface ConPrecios {
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

/** El menor precio cargado entre los tres tipos, o null si no hay ninguno (para el JSON-LD). */
export function menorPrecio(servicio: ConPrecios): number | null {
  const cargados = [servicio.precioDesde, servicio.precioDesdeCamioneta, servicio.precioDesdeMoto].filter(
    (precio): precio is number => precio !== null,
  );
  return cargados.length > 0 ? Math.min(...cargados) : null;
}

/** Para que el CSS marque con "Consultá" lo que falta: ¿hay al menos un precio cargado? */
export const hayPrecios = (servicio: ConPrecios): boolean => menorPrecio(servicio) !== null;
