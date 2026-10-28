import { useEffect, useState } from 'react';

/** true cuando la página se desplazó más de `umbral` píxeles. Escucha el scroll sin bloquearlo y solo re-renderiza al cruzar el umbral. */
export function useDesplazado(umbral: number): boolean {
  const [desplazado, setDesplazado] = useState(false);
  useEffect(() => {
    const leer = () => {
      setDesplazado(window.scrollY > umbral);
    };
    leer();
    window.addEventListener('scroll', leer, { passive: true });
    return () => {
      window.removeEventListener('scroll', leer);
    };
  }, [umbral]);
  return desplazado;
}
