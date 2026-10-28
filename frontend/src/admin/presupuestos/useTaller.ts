import { useEffect, useState } from 'react';
import { ApiError, esAbortado } from '../../api/client';
import { esSesionPerdida } from '../../api/sesion';
import { guardarTaller, obtenerTaller } from '../../api/taller';
import type { DatosTaller } from '../../lib/taller';
import { useAvisos } from '../toast/contexto';
import type { Problema } from '../useUsuarios';

type Estado = { clave: number; taller: DatosTaller } | { clave: number; error: string };

/** Datos del taller que salen en los PDF (GET/PUT /api/admin/taller). */
export function useTaller(alVencerSesion: (mensaje: string) => void) {
  const [recarga, setRecarga] = useState(0);
  const [estado, setEstado] = useState<Estado | null>(null);
  const avisos = useAvisos();

  useEffect(() => {
    const control = new AbortController();
    obtenerTaller(control.signal)
      .then((taller) => {
        setEstado({ clave: recarga, taller });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setEstado({ clave: recarga, error: error instanceof Error ? error.message : 'No pudimos cargar los datos del taller.' });
      });
    return () => {
      control.abort();
    };
  }, [recarga, alVencerSesion]);

  /** null = se guardó (o la sesión se perdió). */
  const guardar = async (datos: DatosTaller): Promise<Problema | null> => {
    try {
      const guardado = await guardarTaller(datos);
      setEstado({ clave: recarga, taller: guardado });
      avisos.exito('Listo: los PDF nuevos salen con estos datos.');
      return null;
    } catch (error) {
      if (esSesionPerdida(error)) {
        alVencerSesion(error.message);
        return null;
      }
      if (error instanceof ApiError) return { mensaje: error.message, campos: error.fields };
      return { mensaje: 'No se pudieron guardar los datos del taller.' };
    }
  };

  const vigente = estado?.clave === recarga ? estado : null;
  return {
    cargando: vigente === null,
    taller: vigente && 'taller' in vigente ? vigente.taller : null,
    error: vigente && 'error' in vigente ? vigente.error : null,
    guardar,
    reintentar: () => {
      setRecarga((r) => r + 1);
    },
  };
}
