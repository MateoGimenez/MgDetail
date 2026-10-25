import { useSyncExternalStore } from 'react';
import { suscribirTema, TEMA_POR_DEFECTO, temaActual, type Tema } from './tema';

/** El tema que se ve ahora; se actualiza cuando alguien lo cambia con el botón. */
export function useTema(): Tema {
  return useSyncExternalStore(suscribirTema, temaActual, () => TEMA_POR_DEFECTO);
}
