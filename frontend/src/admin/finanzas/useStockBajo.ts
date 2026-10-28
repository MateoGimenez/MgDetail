import { contarInsumosConStockBajo } from '../../api/finanzas';
import { useCarga } from './useCarga';

const pedirStockBajo = (_: undefined, signal: AbortSignal) => contarInsumosConStockBajo(signal);

/**
 * Cuántos insumos tienen el stock en el mínimo o por debajo (de todo el inventario, no de una página). Es un extra
 * de Hoy para todos los roles: si falla (por ejemplo, Inventario todavía no está en el servidor) simplemente no
 * hay aviso. `version` lo vuelve a pedir con "Actualizar".
 */
export function useStockBajo(alVencerSesion: (mensaje: string) => void, version: number) {
  const carga = useCarga(pedirStockBajo, undefined, `stock-bajo|${String(version)}`, alVencerSesion);
  return carga.datos ?? 0;
}
