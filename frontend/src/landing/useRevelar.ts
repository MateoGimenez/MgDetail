import type { RefCallback } from 'react';

/**
 * Revelar al entrar en pantalla. El contenido es visible por defecto: este código solo marca con
 * `data-revelar="pendiente"` lo que está DEBAJO de la pantalla al montarse, y lo pasa a "visto" la primera vez que
 * entra (una sola vez por elemento). Lo que ya se ve al cargar no se toca, así que nada parpadea.
 * Si no hay IntersectionObserver o la persona pidió menos movimiento, no marca nada. Los estilos están en
 * revelar.css (solo transform y opacity, y solo con `prefers-reduced-motion: no-preference`).
 */

/** Cuánto del alto de la pantalla cuenta como "ya se ve" al montar. */
const YA_VISIBLE = 0.92;
/** El elemento se revela cuando su borde superior pasa este tramo inferior de la pantalla. */
const MARGEN_DE_ENTRADA = '0px 0px -8% 0px';

/** Ref callback sin estado: sirve igual para un elemento suelto que para cada ítem de una lista. */
export const revelar: RefCallback<HTMLElement> = (elemento) => {
  if (!elemento) return;
  if (typeof IntersectionObserver === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (elemento.getBoundingClientRect().top < window.innerHeight * YA_VISIBLE) return;

  elemento.dataset.revelar = 'pendiente';
  const observador = new IntersectionObserver(
    (entradas) => {
      if (!entradas.some((entrada) => entrada.isIntersecting)) return;
      elemento.dataset.revelar = 'visto';
      observador.disconnect();
    },
    { rootMargin: MARGEN_DE_ENTRADA },
  );
  observador.observe(elemento);

  return () => {
    observador.disconnect();
    delete elemento.dataset.revelar;
  };
};

/** Para el ref de un elemento (la función es estable, no cambia entre renders): `const ref = useRevelar(); <section ref={ref} className="revelar">`. */
export function useRevelar<T extends HTMLElement = HTMLElement>(): RefCallback<T> {
  return revelar;
}
