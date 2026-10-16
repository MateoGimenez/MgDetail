import { useMemo, useRef, type ReactNode } from 'react';
import { ID_SECCION_RESERVA, ReservaContexto, type ContextoReserva, type Preseleccion } from './reserva-contexto';

function prefiereMenosMovimiento(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ReservaProvider({ children }: { children: ReactNode }) {
  const aplicarRef = useRef<((p: Preseleccion) => void) | null>(null);

  const valor = useMemo<ContextoReserva>(
    () => ({
      registrar(aplicar) {
        aplicarRef.current = aplicar;
        return () => {
          if (aplicarRef.current === aplicar) aplicarRef.current = null;
        };
      },
      reservar(preseleccion = {}) {
        document.getElementById(ID_SECCION_RESERVA)?.scrollIntoView({
          behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth',
          block: 'start',
        });
        aplicarRef.current?.(preseleccion);
      },
    }),
    [],
  );

  return <ReservaContexto value={valor}>{children}</ReservaContexto>;
}
