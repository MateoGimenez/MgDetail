import { useEffect, useState } from 'react';
import { esAbortado } from '../../api/client';
import { esSesionPerdida } from '../../api/sesion';

type Resultado<T> = { clave: string; datos: T } | { clave: string; error: string };

/**
 * Pide un dato y lo mantiene mientras se pide otro (`obsoleto`): al cambiar de mes o de filtro, lo que se veía queda
 * atenuado en vez de saltar a un esqueleto. La primera carga sí muestra esqueleto (`datos` es null).
 *
 * - `clave` resume todo lo que identifica al pedido (mes, filtros…): si cambia, se pide de nuevo; una respuesta que
 *   llega tarde (de una clave que ya se cambió) no pisa a la nueva.
 * - Una sesión vencida va a `alVencerSesion`; el resto de los errores se devuelve como texto, para "Reintentar".
 * - `pedir` tiene que ser una función de módulo (estable), por ejemplo `obtenerMetaActual`.
 */
export function useCarga<P, T>(
  pedir: (param: P, signal: AbortSignal) => Promise<T>,
  param: P,
  clave: string,
  alVencerSesion: (mensaje: string) => void,
  activo = true,
) {
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<Resultado<T> | null>(null);
  const claveCompleta = `${clave}|${String(recarga)}`;

  useEffect(() => {
    if (!activo) return;
    const control = new AbortController();
    let vigente = true;
    pedir(param, control.signal)
      .then((datos) => {
        if (vigente) setResultado({ clave: claveCompleta, datos });
      })
      .catch((error: unknown) => {
        if (!vigente || esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({ clave: claveCompleta, error: error instanceof Error ? error.message : 'No pudimos cargar los datos.' });
      });
    return () => {
      vigente = false;
      control.abort();
    };
    // `param` está resumido en `clave`: depender del objeto lo volvería a pedir en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedir, claveCompleta, alVencerSesion, activo]);

  const cargando = activo && resultado?.clave !== claveCompleta;
  const datos = resultado && 'datos' in resultado ? resultado.datos : null;
  const error = resultado && 'error' in resultado ? resultado.error : null;

  return {
    cargando,
    /** Hay datos de otra clave en pantalla mientras llegan los nuevos. */
    obsoleto: cargando && datos !== null,
    datos,
    error: cargando ? null : error,
    recargar: () => {
      setResultado((actual) => (actual && 'datos' in actual ? actual : null));
      setRecarga((n) => n + 1);
    },
  };
}
