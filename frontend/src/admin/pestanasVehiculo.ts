import { VEHICULO_TIPOS, type VehiculoTipo } from '../api/contract';

/** Pestaña a la que lleva una tecla de flecha (circular), Inicio o Fin; la misma si la tecla no navega. */
export function pestanaConTecla(actual: VehiculoTipo, tecla: string): VehiculoTipo {
  const i = VEHICULO_TIPOS.indexOf(actual);
  const n = VEHICULO_TIPOS.length;
  if (tecla === 'ArrowRight') return VEHICULO_TIPOS[(i + 1) % n] ?? actual;
  if (tecla === 'ArrowLeft') return VEHICULO_TIPOS[(i - 1 + n) % n] ?? actual;
  if (tecla === 'Home') return VEHICULO_TIPOS[0] ?? actual;
  if (tecla === 'End') return VEHICULO_TIPOS[n - 1] ?? actual;
  return actual;
}

/** Resumen de una pestaña: cuántos servicios hay para el vehículo y cuántos se ven en la web. */
export function resumenPestana(total: number, activos: number, vehiculo: string): string {
  if (total === 0) return `Ningún servicio para ${vehiculo}.`;
  const cuantos = total === 1 ? '1 servicio' : `${String(total)} servicios`;
  if (activos === total) return `${cuantos} para ${vehiculo} · ${total === 1 ? 'activo' : 'todos activos'}`;
  if (activos === 0) return `${cuantos} para ${vehiculo} · ninguno activo: la web no ofrece turnos online para ${vehiculo}`;
  return `${cuantos} para ${vehiculo} · ${String(activos)} ${activos === 1 ? 'activo' : 'activos'} en la web`;
}
