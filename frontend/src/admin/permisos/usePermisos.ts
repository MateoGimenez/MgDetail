import { useEffect, useState } from 'react';
import { obtenerPermisos } from '../../api/admin';
import { esAbortado } from '../../api/client';
import type { Permisos } from '../../api/contract-panel';
import { esSesionPerdida } from '../../api/sesion';

type Resultado = { clave: number; permisos: Permisos } | { clave: number; error: string };

/**
 * La matriz de permisos por rol (GET /api/admin/permisos). Es la única fuente: el panel no repite listas de
 * permisos. `activo` en false no pide nada (el diálogo "Tu rol" la pide recién cuando se abre).
 */
export function usePermisos(alVencerSesion: (mensaje: string) => void, activo = true) {
  const [intento, setIntento] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    if (!activo) return;
    const control = new AbortController();
    obtenerPermisos(control.signal)
      .then((permisos) => {
        setResultado({ clave: intento, permisos });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({ clave: intento, error: error instanceof Error ? error.message : 'No pudimos cargar los permisos.' });
      });
    return () => {
      control.abort();
    };
  }, [intento, activo, alVencerSesion]);

  const vigente = resultado?.clave === intento ? resultado : null;
  return {
    cargando: activo && vigente === null,
    permisos: vigente && 'permisos' in vigente ? vigente.permisos : null,
    error: vigente && 'error' in vigente ? vigente.error : null,
    reintentar: () => {
      setIntento((n) => n + 1);
    },
  };
}

export type EstadoPermisos = ReturnType<typeof usePermisos>;
