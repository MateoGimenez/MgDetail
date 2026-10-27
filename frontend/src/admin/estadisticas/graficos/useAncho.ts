import { useEffect, useRef, useState } from 'react';

/**
 * Ancho real (en px) de un contenedor, para dibujar el SVG con el viewBox del tamaño que tiene: así el texto del
 * gráfico mide lo mismo en un celular de 390 px que en una pantalla ancha, en vez de achicarse con el dibujo.
 * Hasta medir (o sin ResizeObserver) usa `inicial`.
 */
export function useAncho<T extends HTMLElement>(inicial = 320) {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(inicial);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const medir = () => {
      const w = Math.floor(elemento.getBoundingClientRect().width);
      if (w > 0) setAncho(w);
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => {
      observador.disconnect();
    };
  }, []);

  return [ref, ancho] as const;
}
