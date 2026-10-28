import { useEffect, useState } from 'react';
import { listarAgenda, listarTurnos } from '../api/admin';
import { esAbortado } from '../api/client';
import type { CupoDia, Turno } from '../api/contract';
import { esSesionPerdida } from '../api/sesion';
import { contarSinCobro } from '../lib/cobro';
import { hoyEnLaRioja, sumarDias } from '../lib/fechas';
import { masViejos } from '../lib/hoy';

/** Cuántos pendientes se destacan en Hoy: los que más esperan. */
export const PENDIENTES_DESTACADOS = 3;

/** Los completados se revisan de a 100 (el máximo del backend), hasta 5 páginas: 500 trabajos, los más nuevos primero. */
const POR_PAGINA_COBRO = 100;
const PAGINAS_COBRO = 5;

export interface SinCobro {
  cantidad: number;
  /** Hay más completados de los que se revisaron: la cantidad real puede ser mayor. */
  aproximado: boolean;
}

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
  /** Solo para quien registra cobros; null si no se pidió o no se pudo contar (es un extra del resumen). */
  sinCobro: SinCobro | null;
}

type Resultado = ({ clave: number } & Datos) | { clave: number; error: string };

/**
 * Lo que muestra Hoy, con los endpoints de siempre: la agenda de hoy y mañana (`GET /admin/agenda`) y los
 * pendientes (`GET /admin/bookings?estado=pendiente`, que viene del más nuevo al más viejo: una consulta de a 3
 * para el total y otra, si hacen falta, para los 3 del final).
 */
export function useHoy(alVencerSesion: (mensaje: string) => void, contarCobros = false) {
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

    /*
     * Trabajos completados sin cobro cargado: el listado ya trae el monto de cada turno, así que se cuentan los de
     * las páginas más nuevas. Si hay más de las que se revisan, se avisa "al menos N". Si falla, el aviso no sale.
     */
    const sinCobro = async (): Promise<SinCobro | null> => {
      if (!contarCobros) return null;
      try {
        let cantidad = 0;
        for (let pagina = 0; pagina < PAGINAS_COBRO; pagina++) {
          const { turnos, total } = await listarTurnos(
            { estado: 'completado', limit: POR_PAGINA_COBRO, offset: pagina * POR_PAGINA_COBRO },
            control.signal,
          );
          cantidad += contarSinCobro(turnos);
          if ((pagina + 1) * POR_PAGINA_COBRO >= total) return { cantidad, aproximado: false };
        }
        return { cantidad, aproximado: true };
      } catch {
        return null;
      }
    };

    Promise.all([listarAgenda(hoy, manana, control.signal), pendientes(), sinCobro()])
      .then(([agenda, pend, cobro]) => {
        setResultado({
          clave: recarga,
          ahora,
          hoy,
          manana,
          turnos: agenda.turnos,
          cupos: new Map((agenda.cupos ?? []).map((c) => [c.fecha, c] as const)),
          pendientes: pend.total,
          viejos: masViejos(pend.turnos, PENDIENTES_DESTACADOS),
          sinCobro: cobro,
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
  }, [recarga, alVencerSesion, contarCobros]);

  const vigente = resultado?.clave === recarga ? resultado : null;

  return {
    /** Cambia con cada recarga: los extras de Hoy (finanzas, stock) lo usan para volver a pedir. */
    version: recarga,
    cargando: vigente === null,
    datos: vigente && 'hoy' in vigente ? vigente : null,
    error: vigente && 'error' in vigente ? vigente.error : null,
    recargar: () => {
      setRecarga((n) => n + 1);
    },
  };
}
