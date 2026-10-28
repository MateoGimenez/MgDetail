import { useId } from 'react';
import { anchoDeBarra, textoAvance } from '../../lib/finanzas';

interface Props {
  /** Qué mide: "Ingresos", "Trabajos". */
  nombre: string;
  /** Lo logrado sobre el objetivo, en palabras: "$ 1.096.000 de $ 1.500.000". */
  lectura: string;
  /** Proporción (1 = 100 %); puede pasar de 1. */
  proporcion: number | null;
  /** La meta ya se cumplió: la barra se llena con tinta, sin depender del color. */
  cumplida?: boolean;
}

/**
 * Barra de progreso de una meta. El dato está escrito (la lectura y el porcentaje) y la barra es un
 * `role="progressbar"`: nada depende del color ni de ver el dibujo. Una meta pasada de 100 % llena la barra y el
 * número dice cuánto.
 */
export function BarraDeMeta({ nombre, lectura, proporcion, cumplida = false }: Props) {
  const id = useId();
  const ancho = anchoDeBarra(proporcion);
  return (
    <div className="meta-barra">
      <div className="meta-barra__cabecera">
        <span id={`${id}-nombre`} className="meta-barra__nombre">
          {nombre}
        </span>
        <span className="meta-barra__avance">{textoAvance(proporcion)}</span>
      </div>
      <div
        className="meta-barra__pista"
        role="progressbar"
        aria-labelledby={`${id}-nombre`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ancho)}
        aria-valuetext={`${textoAvance(proporcion)}: ${lectura}`}
      >
        <span className={cumplida ? 'meta-barra__relleno meta-barra__relleno--cumplida' : 'meta-barra__relleno'} style={{ width: `${String(ancho)}%` }} />
      </div>
      <p className="meta-barra__lectura">{lectura}</p>
    </div>
  );
}
