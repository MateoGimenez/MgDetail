import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { revelar } from './useRevelar';

const CONSULTA = '(max-width: 699px)';

function suscribir(avisar: () => void) {
  const consulta = window.matchMedia(CONSULTA);
  consulta.addEventListener('change', avisar);
  return () => {
    consulta.removeEventListener('change', avisar);
  };
}

/** true en el celular (< 700 px), donde las cards van en un carrusel horizontal. */
function useEsCarrusel(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}

/**
 * Las cards de servicios. Desde 700 px, una grilla de 2 y 3 columnas. En el celular, un carrusel horizontal con
 * scroll-snap: la card siguiente se asoma, solo la lista se desplaza de costado (no la página), la región se
 * recorre con el teclado y "2 de 5" sigue al scroll.
 */
export function ListaTarjetas({ cantidad, children }: { cantidad: number; children: ReactNode }) {
  const carrusel = useEsCarrusel();
  const vista = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);
  const ref = useCallback((el: HTMLDivElement | null) => {
    vista.current = el;
    return revelar(el);
  }, []);

  /** La card más cercana al borde izquierdo de la lista es la "actual". */
  const alDesplazar = () => {
    const lista = vista.current?.firstElementChild;
    if (!vista.current || !lista) return;
    const izquierda = vista.current.scrollLeft;
    const origen = (lista.children[0] as HTMLElement | undefined)?.offsetLeft ?? 0;
    let mejor = 0;
    let distancia = Infinity;
    Array.from(lista.children).forEach((card, i) => {
      const d = Math.abs((card as HTMLElement).offsetLeft - origen - izquierda);
      if (d < distancia) {
        distancia = d;
        mejor = i;
      }
    });
    setActual(mejor);
  };

  return (
    <>
      <div
        ref={ref}
        className="tarjetas-vista revelar revelar--tarjeta"
        {...(carrusel
          ? { role: 'region', 'aria-label': 'Servicios: deslizá para ver los demás', tabIndex: 0, onScroll: alDesplazar }
          : {})}
      >
        <ul className="tarjetas escalonado" role="list">
          {children}
        </ul>
      </div>
      {carrusel && cantidad > 1 && (
        <p className="tarjetas__indicador" aria-live="polite">
          {Math.min(actual + 1, cantidad)} de {cantidad}
        </p>
      )}
    </>
  );
}
