import { useCallback, useSyncExternalStore } from 'react';

/** Mismo corte que admin.css: desde acá las tarjetas de Turnos arrancan abiertas (debajo, plegadas). */
const CONSULTA = '(min-width: 760px)';

/** true mientras la media query se cumple (en el servidor o sin window, true: la vista ancha). */
export function useConsulta(consulta: string): boolean {
  const suscribir = useCallback(
    (avisar: () => void) => {
      const lista = window.matchMedia(consulta);
      lista.addEventListener('change', avisar);
      return () => {
        lista.removeEventListener('change', avisar);
      };
    },
    [consulta],
  );
  const ahora = useCallback(() => window.matchMedia(consulta).matches, [consulta]);
  return useSyncExternalStore(suscribir, ahora, () => true);
}

/** true en pantalla ancha (tablet apaisada, compu); false en el celular. */
export function usePantallaAncha(): boolean {
  return useConsulta(CONSULTA);
}
