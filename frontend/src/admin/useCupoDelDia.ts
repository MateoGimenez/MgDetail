import { useEffect, useState } from 'react';
import { listarAgenda } from '../api/admin';
import type { CupoDia } from '../api/contract';

/**
 * Cupos y ocupados de un día (GET /api/admin/agenda de ese solo día), para avisar al confirmar o reprogramar si la
 * franja elegida está llena o cerrada. Es solo un aviso: si falla (o la sesión venció) no se muestra nada y el
 * cambio se manda igual; el que avisa del 401 es el pedido del cambio.
 */
export function useCupoDelDia(fecha: string | null): CupoDia | null {
  const [resultado, setResultado] = useState<{ fecha: string; cupo: CupoDia | null } | null>(null);

  useEffect(() => {
    if (fecha === null) return;
    const control = new AbortController();
    listarAgenda(fecha, fecha, control.signal)
      .then(({ cupos }) => {
        setResultado({ fecha, cupo: cupos?.find((c) => c.fecha === fecha) ?? null });
      })
      .catch(() => {
        if (!control.signal.aborted) setResultado({ fecha, cupo: null });
      });
    return () => {
      control.abort();
    };
  }, [fecha]);

  return fecha !== null && resultado?.fecha === fecha ? resultado.cupo : null;
}
