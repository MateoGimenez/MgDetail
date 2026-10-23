import { useEffect, useState } from 'react';
import { listarTurnos } from '../api/admin';
import { esAbortado } from '../api/client';
import type { Turno } from '../api/contract';
import { esSesionPerdida } from '../api/sesion';

export const POR_PAGINA_HISTORIAL = 20;

interface Pagina {
  turnos: Turno[];
  total: number;
}

/**
 * Turnos de un cliente (GET /api/admin/bookings?cliente=<telefonoWhatsapp>), más nuevos primero, de a una página.
 * "Ver turnos anteriores" pide la siguiente y la suma abajo. Si entre una página y otra entró un turno nuevo, el
 * corrimiento puede repetir uno: se descarta por id. Se monta uno por cliente (con `key`), así que al cambiar de
 * cliente arranca de cero y el pedido anterior se cancela.
 */
export function useHistorial(cliente: string, alVencerSesion: (mensaje: string) => void) {
  const [pedidas, setPedidas] = useState(1);
  const [intento, setIntento] = useState(0);
  const [paginas, setPaginas] = useState<readonly Pagina[]>([]);
  const [error, setError] = useState<{ clave: string; mensaje: string } | null>(null);

  const clave = `${String(pedidas)}|${String(intento)}`;

  useEffect(() => {
    const indice = pedidas - 1;
    const control = new AbortController();
    listarTurnos({ cliente, limit: POR_PAGINA_HISTORIAL, offset: indice * POR_PAGINA_HISTORIAL }, control.signal)
      .then((pagina) => {
        setPaginas((previas) => [...previas.slice(0, indice), pagina]);
      })
      .catch((problema: unknown) => {
        if (esAbortado(problema)) return;
        if (esSesionPerdida(problema)) {
          alVencerSesion(problema.message);
          return;
        }
        setError({
          clave,
          mensaje: problema instanceof Error ? problema.message : 'No pudimos cargar el historial.',
        });
      });
    return () => {
      control.abort();
    };
  }, [cliente, pedidas, clave, alVencerSesion]);

  const vistos = new Set<string>();
  const turnos = paginas
    .flatMap((p) => p.turnos)
    .filter((t) => {
      if (vistos.has(t.id)) return false;
      vistos.add(t.id);
      return true;
    });
  const total = paginas.at(-1)?.total ?? null;
  const errorVigente = error?.clave === clave ? error.mensaje : null;
  const cargando = paginas.length < pedidas && errorVigente === null;

  return {
    turnos,
    total,
    /** Cargando la primera página (sin nada que mostrar todavía). */
    cargando: cargando && paginas.length === 0,
    cargandoMas: cargando && paginas.length > 0,
    /** Falló la primera página. */
    error: paginas.length === 0 ? errorVigente : null,
    /** Falló "Ver turnos anteriores": lo ya cargado sigue a la vista. */
    errorMas: paginas.length > 0 ? errorVigente : null,
    hayMas: total !== null && paginas.length === pedidas && pedidas * POR_PAGINA_HISTORIAL < total,
    verMas: () => {
      setPedidas((n) => n + 1);
    },
    reintentar: () => {
      setIntento((n) => n + 1);
    },
  };
}
