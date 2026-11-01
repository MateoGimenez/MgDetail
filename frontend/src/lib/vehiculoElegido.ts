import { VEHICULO_TIPOS, type VehiculoTipo } from '../api/contract';

/** Tipo de vehículo con el que arranca la landing: el del enlace (?vehiculo=moto), el último elegido o "auto". */
export function vehiculoInicial(busqueda: string, recordado: VehiculoTipo | null): VehiculoTipo {
  const delEnlace = new URLSearchParams(busqueda).get('vehiculo');
  const tipo = VEHICULO_TIPOS.find((t) => t === delEnlace);
  return tipo ?? recordado ?? 'auto';
}
