import { useId, useState, type CSSProperties } from 'react';
import { ManijaFilete } from '../components/Filete';
import type { ParAntesDespues } from '../types';

/**
 * Comparador antes/después. El control es un <input type="range"> nativo y
 * transparente que cubre la foto: se arrastra con el dedo o el mouse y se usa
 * con el teclado (flechas, Inicio, Fin, RePág y AvPág) sin código extra.
 */
export function Comparador({ par }: { par: ParAntesDespues }) {
  const [valor, setValor] = useState(50);
  const id = useId();
  const estilo = { '--v': valor } as CSSProperties;

  return (
    <figure className="comparador">
      <div className="comparador__marco" style={estilo}>
        <img className="comparador__foto" src={par.despues} alt={`Después: ${par.alt}`} loading="lazy" decoding="async" />
        <img
          className="comparador__foto comparador__foto--antes"
          src={par.antes}
          alt={`Antes: ${par.alt}`}
          loading="lazy"
          decoding="async"
        />
        <span className="comparador__etiqueta comparador__etiqueta--antes" aria-hidden="true">
          Antes
        </span>
        <span className="comparador__etiqueta comparador__etiqueta--despues" aria-hidden="true">
          Después
        </span>
        <div className="comparador__divisor" aria-hidden="true">
          <ManijaFilete />
        </div>
        <label className="visualmente-oculto" htmlFor={id}>
          Comparar antes y después: {par.alt}
        </label>
        <input
          id={id}
          className="comparador__control"
          type="range"
          min={0}
          max={100}
          step={1}
          value={valor}
          aria-valuetext={`${String(valor)} % antes, ${String(100 - valor)} % después`}
          onChange={(evento) => {
            setValor(Number(evento.target.value));
          }}
        />
      </div>
      {par.titulo && <figcaption className="comparador__pie">{par.titulo}</figcaption>}
    </figure>
  );
}
