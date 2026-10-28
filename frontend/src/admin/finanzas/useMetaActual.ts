import { obtenerMetaActual } from '../../api/finanzas';
import { useCarga } from './useCarga';

const pedirMetaActual = (_: undefined, signal: AbortSignal) => obtenerMetaActual(signal);

/** La meta de este mes, con el mismo pedido para Hoy y para Estadísticas. `version` vuelve a pedirla (Actualizar). */
export function useMetaActual(alVencerSesion: (mensaje: string) => void, version = 0, activo = true) {
  return useCarga(pedirMetaActual, undefined, `meta-actual|${String(version)}`, alVencerSesion, activo);
}
