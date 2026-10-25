import { useCallback, useEffect, useRef, useState } from 'react';
import { esAbortado } from '../api/client';
import type { DiaDisponible } from '../api/contract';
import { consultarDisponibilidad } from '../api/turnos';

export type DiasDisponibles = ReadonlyMap<string, DiaDisponible>;

/**
 * - cargando: todavía no llegó (el calendario muestra su lugar);
 * - lista: días de hoy a hoy + 60 con lugar por franja;
 * - fallo: la API no respondió o mandó algo que no cierra → el formulario vuelve al campo de fecha de antes
 *   (el backend valida igual al recibir el pedido).
 */
export type Disponibilidad = { fase: 'cargando' } | { fase: 'lista'; dias: DiasDisponibles } | { fase: 'fallo' };

/** Sin ningún día no hay calendario que mostrar: mejor el campo de fecha de siempre. */
const aMapa = (dias: readonly DiaDisponible[]): DiasDisponibles | null =>
  dias.length === 0 ? null : new Map(dias.map((dia) => [dia.fecha, dia]));

/** Pide la disponibilidad al abrir el formulario y deja recargarla (después de un 409 o un 400 de día cerrado). */
export function useDisponibilidad() {
  const [estado, setEstado] = useState<Disponibilidad>({ fase: 'cargando' });
  const recarga = useRef<AbortController | null>(null);

  useEffect(() => {
    const control = new AbortController();
    consultarDisponibilidad(null, control.signal)
      .then((dias) => {
        const mapa = aMapa(dias);
        setEstado(mapa ? { fase: 'lista', dias: mapa } : { fase: 'fallo' });
      })
      .catch((error: unknown) => {
        if (!esAbortado(error)) setEstado({ fase: 'fallo' });
      });
    return () => {
      control.abort();
      recarga.current?.abort();
    };
  }, []);

  /** Vuelve a pedirla y devuelve los días nuevos (null si falló: se queda lo que había). */
  const recargar = useCallback(async (): Promise<DiasDisponibles | null> => {
    recarga.current?.abort();
    const control = new AbortController();
    recarga.current = control;
    try {
      const mapa = aMapa(await consultarDisponibilidad(null, control.signal));
      if (mapa) setEstado({ fase: 'lista', dias: mapa });
      return mapa;
    } catch {
      return null;
    }
  }, []);

  return { disponibilidad: estado, recargar };
}
