import { useEffect, useState } from 'react';
import { listarTrabajadores } from '../../api/admin';
import { esAbortado } from '../../api/client';
import type { Trabajador } from '../../api/contract-panel';
import { esSesionPerdida } from '../../api/sesion';

type Resultado = { clave: number; lista: Trabajador[] } | { clave: number; error: string };

/**
 * Las personas activas a las que se puede asignar un trabajo (GET /api/admin/trabajadores). Se pide al abrir el
 * formulario de cobro, así la lista está al día; si falla, el formulario sigue funcionando (queda a nombre de quien
 * lo completa) y ofrece reintentar.
 */
export function useTrabajadores(alVencerSesion: (mensaje: string) => void) {
  const [intento, setIntento] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    const control = new AbortController();
    listarTrabajadores(control.signal)
      .then((lista) => {
        setResultado({ clave: intento, lista });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({ clave: intento, error: error instanceof Error ? error.message : 'No pudimos cargar la lista.' });
      });
    return () => {
      control.abort();
    };
  }, [intento, alVencerSesion]);

  const vigente = resultado?.clave === intento ? resultado : null;
  return {
    cargando: vigente === null,
    lista: vigente && 'lista' in vigente ? vigente.lista : null,
    error: vigente && 'error' in vigente ? vigente.error : null,
    reintentar: () => {
      setIntento((n) => n + 1);
    },
  };
}
