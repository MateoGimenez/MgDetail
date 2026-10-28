import { useCallback, useEffect, useRef, useState } from 'react';
import { elegirSeccionActiva, type PosicionSeccion } from '../lib/seccionActiva';

/** Cuánto antes de que termine el scroll animado se deja de ignorar al observador (por si no llega `scrollend`). */
const ESPERA_DE_SCROLL = 1200;
/** Margen entre el borde de la cabecera y la línea de lectura. */
const AIRE = 16;

/**
 * Scrollspy: devuelve el id de la sección que se está viendo (o null en el hero) y `activarYa`, para marcar un enlace
 * en el mismo instante en que se toca, sin que parpadee la sección del medio mientras la página se desplaza.
 *
 * Un IntersectionObserver vigila una franja finita pegada debajo de la cabecera fija (la "línea de lectura"); cuando una
 * sección entra o sale de esa franja se vuelve a medir y `elegirSeccionActiva` (lib/seccionActiva.ts) decide. Sin
 * IntersectionObserver no se marca nada: el nav funciona igual.
 */
export function useSeccionActiva(ids: readonly string[]): { activa: string | null; activarYa: (id: string) => void } {
  const [activa, setActiva] = useState<string | null>(null);
  const bloqueado = useRef(false);
  const medir = useRef<() => void>(() => undefined);
  const temporizador = useRef<number | undefined>(undefined);
  const clave = ids.join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const secciones = clave === '' ? [] : clave.split('|');
    let observador: IntersectionObserver | null = null;

    const linea = () => (document.querySelector('.cabecera')?.getBoundingClientRect().bottom ?? 64) + AIRE;

    const calcular = () => {
      if (bloqueado.current) return;
      const posiciones: PosicionSeccion[] = [];
      for (const id of secciones) {
        const elemento = document.getElementById(id);
        if (!elemento) continue;
        const caja = elemento.getBoundingClientRect();
        posiciones.push({ id, top: caja.top, bottom: caja.bottom });
      }
      setActiva(elegirSeccionActiva(posiciones, linea()));
    };
    medir.current = calcular;

    const observar = () => {
      observador?.disconnect();
      const arriba = Math.round(linea());
      const abajo = Math.max(0, window.innerHeight - arriba - 1);
      observador = new IntersectionObserver(calcular, { rootMargin: `-${String(arriba)}px 0px -${String(abajo)}px 0px` });
      for (const id of secciones) {
        const elemento = document.getElementById(id);
        if (elemento) observador.observe(elemento);
      }
      calcular();
    };

    observar();
    window.addEventListener('resize', observar);
    return () => {
      window.removeEventListener('resize', observar);
      observador?.disconnect();
    };
  }, [clave]);

  const activarYa = useCallback((id: string) => {
    setActiva(id);
    bloqueado.current = true;
    window.clearTimeout(temporizador.current);
    const soltar = () => {
      window.clearTimeout(temporizador.current);
      window.removeEventListener('scrollend', soltar);
      window.removeEventListener('wheel', soltar);
      window.removeEventListener('touchstart', soltar);
      bloqueado.current = false;
      medir.current();
    };
    window.addEventListener('scrollend', soltar, { once: true });
    window.addEventListener('wheel', soltar, { once: true, passive: true });
    window.addEventListener('touchstart', soltar, { once: true, passive: true });
    temporizador.current = window.setTimeout(soltar, ESPERA_DE_SCROLL);
  }, []);

  return { activa, activarYa };
}
