import { useEffect, useRef, type SyntheticEvent } from 'react';

/**
 * Ayudas de los <dialog> con formulario del panel (usuarios y servicios).
 *
 * Mientras hay una petición en curso el diálogo no se cierra con Escape (y Cancelar está deshabilitado): si se
 * cerrara, la respuesta tardía cerraría o ensuciaría el diálogo siguiente, que puede ser de otro registro.
 */
export const bloquearEscape = (ocupado: boolean) => (evento: SyntheticEvent<HTMLDialogElement>) => {
  if (ocupado) evento.preventDefault();
};

/** false después de desmontarse: una respuesta que llega tarde no toca un formulario que ya no está. */
export function useMontado() {
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  return montado;
}
