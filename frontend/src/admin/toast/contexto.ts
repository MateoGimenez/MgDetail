import { createContext, useContext } from 'react';

export interface Avisos {
  /** Aviso de éxito: se va solo a los ~4 s. */
  exito: (texto: string) => void;
  /** Aviso de error: queda hasta que se lo cierra. */
  error: (texto: string) => void;
}

const SIN_PROVEEDOR: Avisos = {
  exito: () => undefined,
  error: () => undefined,
};

export const ContextoAvisos = createContext<Avisos>(SIN_PROVEEDOR);

/** Avisos del panel ("Guardado", "Turno confirmado"). Fuera del proveedor no hacen nada. */
export function useAvisos(): Avisos {
  return useContext(ContextoAvisos);
}
