import { useSyncExternalStore } from 'react';

/** Mismo corte que admin.css: desde acá las tarjetas de Turnos arrancan abiertas (debajo, plegadas). */
const CONSULTA = '(min-width: 760px)';

function suscribir(avisar: () => void) {
  const lista = window.matchMedia(CONSULTA);
  lista.addEventListener('change', avisar);
  return () => {
    lista.removeEventListener('change', avisar);
  };
}

const ahora = () => window.matchMedia(CONSULTA).matches;

/** true en pantalla ancha (tablet apaisada, compu); false en el celular. */
export function usePantallaAncha(): boolean {
  return useSyncExternalStore(suscribir, ahora, () => true);
}
