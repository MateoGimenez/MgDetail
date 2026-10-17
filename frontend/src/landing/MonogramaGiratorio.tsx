import { useEffect, useRef, useState } from 'react';
import { MarcoFilete } from '../components/Filete';
import { marca } from '../config/sitio';
import { MonogramaAnimado } from './MonogramaAnimado';

const VUELTA_SOLA_MS = 3000;
const menosMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Dorso() {
  return (
    <div className="monograma cara cara--dorso" aria-hidden="true">
      <MarcoFilete tamano="chico" />
      <img
        className="monograma__medio"
        src={marca.dorso}
        width={marca.posterLado}
        height={marca.posterLado}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

/**
 * El cuadro del monograma gira 180° en 3D: con el mouse al pasar por encima,
 * con un toque o con el teclado (Enter / Espacio) alterna, y vuelve solo a
 * los 3 s. El dorso muestra el logo 3D. Con "menos movimiento" no gira.
 */
export function MonogramaGiratorio() {
  const [quieto] = useState(menosMovimiento);
  const [girado, setGirado] = useState(false);
  const punteroRef = useRef<string>('');
  const temporizadorRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(temporizadorRef.current);
    },
    [],
  );

  const frente = (
    <div className="monograma cara cara--frente">
      <MarcoFilete tamano="chico" />
      <MonogramaAnimado />
    </div>
  );

  if (quieto) return <div className="monograma-giro">{frente}</div>;

  const alternar = () => {
    // Con mouse ya gira el :hover; el clic no fija el estado.
    if (punteroRef.current === 'mouse') return;
    window.clearTimeout(temporizadorRef.current);
    if (!girado) {
      temporizadorRef.current = window.setTimeout(() => {
        setGirado(false);
      }, VUELTA_SOLA_MS);
    }
    setGirado(!girado);
  };

  return (
    <div className="monograma-giro">
      <button
        type="button"
        className={girado ? 'monograma-tarjeta girada' : 'monograma-tarjeta'}
        aria-label="Girar el monograma de MgDetailing"
        aria-pressed={girado}
        onPointerDown={(evento) => {
          punteroRef.current = evento.pointerType;
        }}
        onKeyDown={() => {
          punteroRef.current = '';
        }}
        onClick={alternar}
      >
        {frente}
        <Dorso />
      </button>
    </div>
  );
}
