import { useState } from 'react';
import { listarGastos, type FiltroGastos, type Gasto, type ListaDeGastos } from '../../api/finanzas';
import { esSesionPerdida } from '../../api/sesion';
import { useCarga } from './useCarga';

interface Extra {
  /** La primera página a la que se le sumaron estos gastos: si cambia (otro filtro, otra recarga), se descartan. */
  para: ListaDeGastos | null;
  gastos: Gasto[];
  cargando: boolean;
  error: string | null;
}

const SIN_EXTRA: Extra = { para: null, gastos: [], cargando: false, error: null };

/**
 * Los gastos de un mes con su filtro (categoría y búsqueda). La primera página la pide `useCarga` (con el mes
 * anterior atenuado mientras llega el nuevo); "Ver más" suma las páginas siguientes a la lista. `suma` es el total en
 * pesos de todo el filtro (no solo de lo cargado) y `total`, la cantidad de gastos del filtro.
 */
export function useGastos(filtro: FiltroGastos, alVencerSesion: (mensaje: string) => void, version = 0) {
  const clave = `${filtro.desde}|${filtro.hasta}|${filtro.categoria ?? ''}|${filtro.q ?? ''}|${String(version)}`;
  const base = useCarga(listarGastos, filtro, clave, alVencerSesion);
  const [mas, setMas] = useState<Extra>(SIN_EXTRA);

  const extra = base.datos !== null && mas.para === base.datos ? mas : null;
  const gastos = base.datos ? [...base.datos.gastos, ...(extra?.gastos ?? [])] : [];
  const total = base.datos?.total ?? 0;

  const cargarMas = async () => {
    const origen = base.datos;
    if (!origen || extra?.cargando) return;
    setMas({ para: origen, gastos: extra?.gastos ?? [], cargando: true, error: null });
    try {
      const pagina = await listarGastos({ ...filtro, offset: gastos.length });
      setMas((previo) =>
        previo.para === origen ? { para: origen, gastos: [...previo.gastos, ...pagina.gastos], cargando: false, error: null } : previo,
      );
    } catch (error) {
      if (esSesionPerdida(error)) {
        alVencerSesion(error.message);
        return;
      }
      const mensaje = error instanceof Error ? error.message : 'No pudimos cargar más gastos.';
      setMas((previo) => (previo.para === origen ? { ...previo, cargando: false, error: mensaje } : previo));
    }
  };

  return {
    gastos,
    total,
    suma: base.datos?.suma ?? 0,
    hayMas: gastos.length < total,
    cargandoMas: extra?.cargando ?? false,
    errorMas: extra?.error ?? null,
    cargarMas,
    cargando: base.cargando,
    obsoleto: base.obsoleto,
    error: base.error,
    /** Ya llegó la primera página. */
    listo: base.datos !== null,
    recargar: base.recargar,
  };
}
