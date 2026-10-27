import { useEffect, useState } from 'react';
import { esAbortado } from '../../api/client';
import { esSesionPerdida } from '../../api/sesion';
import type { RangoFechas } from '../../lib/rangosEstadisticas';

type Resultado<T> = { clave: string; datos: T } | { clave: string; error: string };

/**
 * Pide los datos de un rango y los mantiene mientras se piden otros: al cambiar el período, el gráfico anterior
 * queda a la vista (atenuado, `obsoleto`) en vez de saltar a un esqueleto. La primera carga sí muestra esqueleto.
 * Una sesión vencida va a `alVencerSesion`; el resto de los errores se muestran con "Reintentar".
 * `pedir` tiene que ser una función de módulo (estable), por ejemplo `obtenerEstadisticas`.
 */
export function useEstadisticas<T>(
  pedir: (rango: RangoFechas, signal: AbortSignal) => Promise<T>,
  rango: RangoFechas,
  alVencerSesion: (mensaje: string) => void,
  activo = true,
) {
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<Resultado<T> | null>(null);
  const { desde, hasta } = rango;
  const clave = `${desde}|${hasta}|${String(recarga)}`;

  useEffect(() => {
    if (!activo) return;
    const control = new AbortController();
    // Una respuesta que llega tarde (de un rango que ya se cambió) no pisa a la nueva, aunque el pedido no se haya cortado.
    let vigente = true;
    pedir({ desde, hasta }, control.signal)
      .then((datos) => {
        if (!vigente) return;
        setResultado({ clave, datos });
      })
      .catch((error: unknown) => {
        if (!vigente || esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({ clave, error: error instanceof Error ? error.message : 'No pudimos cargar las estadísticas.' });
      });
    return () => {
      vigente = false;
      control.abort();
    };
  }, [pedir, desde, hasta, clave, alVencerSesion, activo]);

  const cargando = activo && resultado?.clave !== clave;
  const error = resultado && 'error' in resultado ? resultado.error : null;
  const datos = resultado && 'datos' in resultado ? resultado.datos : null;

  return {
    cargando,
    /** Hay datos de otro rango en pantalla mientras llegan los nuevos. */
    obsoleto: cargando && datos !== null,
    datos,
    error: cargando ? null : error,
    recargar: () => {
      setResultado((actual) => (actual && 'datos' in actual ? actual : null));
      setRecarga((n) => n + 1);
    },
  };
}
