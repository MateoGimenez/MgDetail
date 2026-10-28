import { useEffect } from 'react';

/** Hasta cuántos píxeles se corre el botón hacia el puntero. */
const RECORRIDO_MAXIMO = 4;
const SELECTOR = '.boton--primario:not(:disabled):not([aria-disabled="true"])';

/**
 * Desplazamiento "magnético" y sutil de los botones principales (rojos): el botón se corre hasta 4 px hacia el
 * puntero mientras está encima y vuelve al salir. Solo con mouse (`hover: hover` y `pointer: fine`) y sin
 * `prefers-reduced-motion`; usa `translate` (la transición vive en efectos.css), no toca el layout y no afecta al
 * teclado ni al táctil. Un solo listener delegado para toda la página.
 */
export function useMagnetico(): void {
  useEffect(() => {
    const permitido = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    if (!permitido.matches) return;
    let actual: HTMLElement | null = null;

    const soltar = () => {
      actual?.style.removeProperty('--mx');
      actual?.style.removeProperty('--my');
      actual = null;
    };

    const alMover = (evento: PointerEvent) => {
      if (evento.pointerType !== 'mouse') return;
      const boton = evento.target instanceof Element ? evento.target.closest<HTMLElement>(SELECTOR) : null;
      if (boton !== actual) soltar();
      if (!boton) return;
      actual = boton;
      const caja = boton.getBoundingClientRect();
      const dx = (evento.clientX - (caja.left + caja.width / 2)) / (caja.width / 2);
      const dy = (evento.clientY - (caja.top + caja.height / 2)) / (caja.height / 2);
      boton.style.setProperty('--mx', `${(dx * RECORRIDO_MAXIMO).toFixed(2)}px`);
      boton.style.setProperty('--my', `${(dy * RECORRIDO_MAXIMO).toFixed(2)}px`);
    };

    document.addEventListener('pointermove', alMover, { passive: true });
    document.documentElement.addEventListener('pointerleave', soltar);
    return () => {
      document.removeEventListener('pointermove', alMover);
      document.documentElement.removeEventListener('pointerleave', soltar);
      soltar();
    };
  }, []);
}
