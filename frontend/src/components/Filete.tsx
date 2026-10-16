import { ESQUINA, SEPARADOR, SUBRAYADO } from './filete-geometria';

/**
 * Ornamentos de filete: línea roja con su sombra y su brillo, volutas, rombos
 * y bolitas. Son decorativos (aria-hidden). Los trazos con la clase `trazo`
 * se pueden dibujar de un solo pincelazo con CSS (ver base.css).
 */

function Trazo({ d }: { d: string }) {
  return (
    <>
      <path className="filete__sombra" d={d} />
      <path className="filete__color trazo" d={d} pathLength={1} />
      <path className="filete__brillo trazo" d={d} pathLength={1} />
    </>
  );
}

export function EsquinaFilete({ className }: { className?: string }) {
  const [ax, ay] = ESQUINA.finArriba;
  const [ix, iy] = ESQUINA.finIzquierda;
  return (
    <svg className={className} viewBox="0 0 140 140" aria-hidden="true" focusable="false">
      <Trazo d={ESQUINA.arriba} />
      <Trazo d={ESQUINA.izquierda} />
      <path className="filete__luz trazo" d={ESQUINA.luzArriba} pathLength={1} />
      <path className="filete__luz trazo" d={ESQUINA.luzIzquierda} pathLength={1} />
      <circle className="filete__punto-luz" cx="85" cy="14.5" r="1.4" />
      <circle className="filete__punto-luz" cx="14.5" cy="85" r="1.4" />
      <circle className="filete__bolita" cx={ax} cy={ay} r="2.3" />
      <circle className="filete__bolita" cx={ix} cy={iy} r="2.3" />
      <path className="filete__rombo" d={ESQUINA.rombo} fillRule="evenodd" />
      <circle className="filete__bolita" cx="45" cy="45" r="1.9" />
    </svg>
  );
}

const ESQUINAS = ['ai', 'ad', 'bi', 'bd'] as const;

/**
 * Marco de cartel: cuatro esquinas con volutas unidas por un filete doble.
 * `trazar` lo dibuja al aparecer (solo si la persona no pidió menos movimiento).
 */
export function MarcoFilete({ tamano = 'grande', trazar = false }: { tamano?: 'grande' | 'mediano' | 'chico'; trazar?: boolean }) {
  return (
    <div className={`marco-filete marco-filete--${tamano}${trazar ? ' marco-filete--trazar' : ''}`} aria-hidden="true">
      <span className="marco-filete__borde marco-filete__borde--arriba" />
      <span className="marco-filete__borde marco-filete__borde--abajo" />
      <span className="marco-filete__borde marco-filete__borde--izq" />
      <span className="marco-filete__borde marco-filete__borde--der" />
      {ESQUINAS.map((posicion) => (
        <EsquinaFilete key={posicion} className={`marco-filete__esquina marco-filete__esquina--${posicion}`} />
      ))}
    </div>
  );
}

export function SeparadorFilete({ className }: { className?: string }) {
  const [ix, iy] = SEPARADOR.finIzquierda;
  const [dx, dy] = SEPARADOR.finDerecha;
  return (
    <div className={className ? `separador ${className}` : 'separador'} aria-hidden="true">
      <svg className="separador__adorno" viewBox="0 0 320 44" focusable="false">
        <Trazo d={SEPARADOR.izquierda} />
        <Trazo d={SEPARADOR.derecha} />
        <path className="filete__luz" d={SEPARADOR.luzIzquierda} />
        <path className="filete__luz" d={SEPARADOR.luzDerecha} />
        <circle className="filete__bolita" cx={ix} cy={iy} r="2.1" />
        <circle className="filete__bolita" cx={dx} cy={dy} r="2.1" />
        <path className="filete__rombo" d={SEPARADOR.rombo} fillRule="evenodd" />
      </svg>
    </div>
  );
}

/** Filete corto que se dibuja debajo de lo elegido (vehículo, franja, servicio). */
export function SubrayadoFilete({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `subrayado ${className}` : 'subrayado'}
      viewBox="0 0 48 12"
      aria-hidden="true"
      focusable="false"
    >
      <path className="subrayado__trazo" d={SUBRAYADO.derecha} pathLength={1} />
      <path className="subrayado__trazo" d={SUBRAYADO.izquierda} pathLength={1} />
    </svg>
  );
}

/** Rombo chico, para viñetas. */
export function Rombo({ className }: { className?: string }) {
  return (
    <svg className={className ? `rombo ${className}` : 'rombo'} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M6 1 11 6 6 11 1 6Z" />
    </svg>
  );
}

/** Manija del comparador antes/después: medallón con filete doble. */
export function ManijaFilete() {
  return (
    <svg className="manija" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
      <circle className="manija__fondo" cx="28" cy="28" r="25" />
      <circle className="manija__aro" cx="28" cy="28" r="25" />
      <circle className="manija__luz" cx="28" cy="28" r="20.5" />
      <path className="manija__flechas" d="M23 21.5 16.5 28l6.5 6.5M33 21.5l6.5 6.5-6.5 6.5" />
    </svg>
  );
}
