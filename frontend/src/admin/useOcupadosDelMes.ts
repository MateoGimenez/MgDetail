import { useEffect, useState } from 'react';
import { listarAgenda } from '../api/admin';
import { esAbortado } from '../api/client';
import type { CupoDia } from '../api/contract';
import { esSesionPerdida } from '../api/sesion';

type Resultado = { clave: string; cupos: CupoDia[] } | { clave: string; error: string };

/**
 * Cupos y ocupados de cada día de la grilla del calendario (GET /api/admin/agenda, hasta 42 días). Si no carga, el
 * calendario se ve igual con lo guardado en Disponibilidad, solo que sin saber cuántos turnos hay.
 */
export function useOcupadosDelMes(desde: string, hasta: string, recarga: number, alVencerSesion: (mensaje: string) => void) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const clave = `${desde}|${hasta}|${String(recarga)}`;

  useEffect(() => {
    const control = new AbortController();
    listarAgenda(desde, hasta, control.signal)
      .then(({ cupos }) => {
        if (cupos) setResultado({ clave, cupos });
        else setResultado({ clave, error: 'El servidor no mandó los turnos de cada día.' });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({ clave, error: error instanceof Error ? error.message : 'No pudimos traer los turnos del mes.' });
      });
    return () => {
      control.abort();
    };
  }, [clave, desde, hasta, alVencerSesion]);

  const vigente = resultado?.clave === clave ? resultado : null;
  return {
    cargando: vigente === null,
    cupos: new Map(vigente && 'cupos' in vigente ? vigente.cupos.map((c) => [c.fecha, c] as const) : []),
    error: vigente && 'error' in vigente ? vigente.error : null,
  };
}
