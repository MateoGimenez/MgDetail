import { useEffect, useState } from 'react';
import { listarAgenda, listarTurnos } from '../api/admin';
import { esAbortado } from '../api/client';
import type { CupoDia, Turno } from '../api/contract';
import { esSesionPerdida } from '../api/sesion';
import { hoyEnLaRioja, sumarDias } from '../lib/fechas';
import { masViejos } from '../lib/hoy';

/** Cuántos pendientes se destacan en Hoy: los que más esperan. */
export const PENDIENTES_DESTACADOS = 3;

interface Datos {
  ahora: Date;
  hoy: string;
  manana: string;
  /** Turnos de hoy y mañana (no cancelados), de la agenda. */
  turnos: Turno[];
  cupos: ReadonlyMap<string, CupoDia>;
  /** Cantidad total de pendientes (de cualquier fecha). */
  pendientes: number;
  /** Los que llegaron primero, el más viejo arriba. */
  viejos: Turno[];
}

type Resultado = ({ clave: number } & Datos) | { clave: number; error: string };

/**
 * Lo que muestra Hoy, con los endpoints de siempre: la agenda de hoy y mañana (`GET /admin/agenda`) y los
 * pendientes (`GET /admin/bookings?estado=pendiente`, que viene del más nuevo al más viejo: una consulta de a 3
 * para el total y otra, si hacen falta, para los 3 del final).
 */
export function useHoy(alVencerSesion: (mensaje: string) => void) {
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    const control = new AbortController();
    const ahora = new Date();
    const hoy = hoyEnLaRioja(ahora);
    const manana = sumarDias(hoy, 1);

    const pendientes = async () => {
      const primera = await listarTurnos({ estado: 'pendiente', limit: PENDIENTES_DESTACADOS, offset: 0 }, control.signal);
      if (primera.total <= PENDIENTES_DESTACADOS) return { total: primera.total, turnos: primera.turnos };
      const ultimos = await listarTurnos(
        { estado: 'pendiente', limit: PENDIENTES_DESTACADOS, offset: primera.total - PENDIENTES_DESTACADOS },
        control.signal,
      );
      return { total: primera.total, turnos: ultimos.turnos };
    };

    Promise.all([listarAgenda(hoy, manana, control.signal), pendientes()])
      .then(([agenda, pend]) => {
        setResultado({
          clave: recarga,
          ahora,
          hoy,
          manana,
          turnos: agenda.turnos,
          cupos: new Map((agenda.cupos ?? []).map((c) => [c.fecha, c] as const)),
          pendientes: pend.total,
          viejos: masViejos(pend.turnos, PENDIENTES_DESTACADOS),
        });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({ clave: recarga, error: error instanceof Error ? error.message : 'No pudimos cargar el resumen de hoy.' });
      });
    return () => {
      control.abort();
    };
  }, [recarga, alVencerSesion]);

  const vigente = resultado?.clave === recarga ? resultado : null;

  return {
    cargando: vigente === null,
    datos: vigente && 'hoy' in vigente ? vigente : null,
    error: vigente && 'error' in vigente ? vigente.error : null,
    recargar: () => {
      setRecarga((n) => n + 1);
    },
  };
}
