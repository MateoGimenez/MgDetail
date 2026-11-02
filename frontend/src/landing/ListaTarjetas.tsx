import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { revelar } from './useRevelar';

/**
 * Las cards de servicios. Celular: carrusel horizontal con scroll-snap (la card siguiente se asoma). De 700 a
 * 1059 px: grilla de 2 columnas. Desde 1060 px: UNA sola fila (servicios.css reparte el ancho según `--n`, la
 * cantidad); si no entran con un ancho legible, esa fila se desplaza de costado. Siempre que la lista se
 * desplaza, es una región que se recorre con el teclado y "2 de 5" sigue al scroll.
 */
export function ListaTarjetas({ cantidad, children }: { cantidad: number; children: ReactNode }) {
  const vista = useRef<HTMLDivElement>(null);
  /** La lista se desplaza de costado (no entra entera): celular, o fila de escritorio con muchos servicios. */
  const [carrusel, setCarrusel] = useState(false);
  const [actual, setActual] = useState(0);
  const ref = useCallback((el: HTMLDivElement | null) => {
    vista.current = el;
    return revelar(el);
  }, []);

  useEffect(() => {
    const el = vista.current;
    if (!el) return;
    const medir = () => {
      setCarrusel(el.scrollWidth > el.clientWidth + 1);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    if (el.firstElementChild) observador.observe(el.firstElementChild);
    return () => {
      observador.disconnect();
    };
  }, [cantidad]);

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
        <ul className="tarjetas escalonado" role="list" style={{ '--n': cantidad } as CSSProperties}>
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
