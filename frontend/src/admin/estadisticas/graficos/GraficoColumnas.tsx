import type { PointerEvent } from 'react';
import { anchoDeBarra, escalaLineal, indiceEnX, saltoDeEtiquetas, ticksLindos } from '../../../lib/estadisticas';
import { useAncho } from './useAncho';
import { useSeleccion } from './useSeleccion';

export interface Columna {
  clave: string;
  valor: number;
  /** Lo que va debajo de la columna en el eje ("22", "1 oct", "oct"). */
  etiquetaEje: string;
  /** Nombre completo para la línea de lectura ("jueves 22 de octubre"). */
  titulo: string;
  /** Dato para la línea de lectura ("$ 80.000 · 2 trabajos"). */
  detalle: string;
}

interface Props {
  columnas: readonly Columna[];
  idTitulo: string;
  idResumen: string;
  /** Formato de los números del eje y de la etiqueta de la columna más alta. */
  formatoEje: (n: number) => string;
  soloEnteros?: boolean;
  /** Para armar la frase "El mejor día: …" bajo el gráfico; si falta, no se muestra. */
  fraseDelMaximo?: (columna: Columna) => string;
  alto?: number;
}

const ANCHO_ETIQUETA = 44;

/** Camino de una columna con 4 px redondeados arriba (el dato) y base recta sobre el eje. */
function caminoDeColumna(x: number, y: number, ancho: number, alto: number): string {
  const r = Math.min(4, ancho / 2, alto);
  return `M${x},${y + alto}V${y + r}Q${x},${y} ${x + r},${y}H${x + ancho - r}Q${x + ancho},${y} ${x + ancho},${y + r}V${y + alto}Z`;
}

/**
 * Columnas en el tiempo con ceros. Una sola serie, así que sin leyenda: en gris tinta, y en rojo la más alta (énfasis);
 * la elegida (tocándola, con el mouse o con las flechas) se oscurece y su dato aparece en la línea de abajo.
 */
export function GraficoColumnas({ columnas, idTitulo, idResumen, formatoEje, soloEnteros = false, fraseDelMaximo, alto = 220 }: Props) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const { activa, elegir, alTeclear } = useSeleccion(columnas.length);

  const maximo = columnas.reduce((m, c) => Math.max(m, c.valor), 0);
  const eje = ticksLindos(maximo, 4, soloEnteros);
  const izquierda = Math.max(...eje.ticks.map((t) => formatoEje(t).length)) * 6.6 + 14;
  const derecha = 8;
  const arriba = 22;
  const abajo = 26;
  const util = Math.max(40, ancho - izquierda - derecha);
  const casillero = util / Math.max(1, columnas.length);
  const barra = anchoDeBarra(casillero);
  const y = escalaLineal([0, eje.techo], [alto - abajo, arriba]);
  const base = alto - abajo;
  const salto = saltoDeEtiquetas(columnas.length, util, ANCHO_ETIQUETA);
  const iMax = maximo > 0 ? columnas.findIndex((c) => c.valor === maximo) : -1;

  const elegirDesdeX = (evento: PointerEvent<SVGSVGElement>) => {
    const caja = evento.currentTarget.getBoundingClientRect();
    elegir(indiceEnX(evento.clientX - caja.left, izquierda, util, columnas.length));
  };

  const elegida = activa === null ? null : columnas[activa];
  const mejor = iMax >= 0 ? columnas[iMax] : undefined;

  return (
    <div className="est-columnas" ref={ref}>
      {/* Lista de opciones (una por columna) que se recorre con las flechas: el lector de pantalla lee la columna activa. */}
      <div
        className="est-enfocable"
        role="listbox"
        aria-labelledby={idTitulo}
        aria-describedby={idResumen}
        aria-orientation="horizontal"
        aria-activedescendant={activa === null ? undefined : `${idTitulo}-op-${String(activa)}`}
        tabIndex={0}
        onKeyDown={alTeclear}
      >
        <svg
          className="est-svg"
          width={ancho}
          height={alto}
          viewBox={`0 0 ${String(ancho)} ${String(alto)}`}
          aria-hidden="true"
          onPointerDown={elegirDesdeX}
          onPointerMove={(evento) => {
            if (evento.pointerType === 'mouse') elegirDesdeX(evento);
          }}
        >
          {eje.ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'est-eje' : 'est-grilla'} x1={izquierda} x2={ancho - derecha} y1={y(t)} y2={y(t)} />
              <text className="est-texto-eje" x={izquierda - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {formatoEje(t)}
              </text>
            </g>
          ))}
          {activa !== null && (
            <rect className="est-casillero-activo" x={izquierda + activa * casillero} y={arriba - 4} width={casillero} height={base - arriba + 4} />
          )}
          {columnas.map((c, i) => {
            if (c.valor <= 0) return null;
            const x = izquierda + i * casillero + (casillero - barra) / 2;
            const h = base - y(c.valor);
            const clase = i === activa ? 'est-barra est-barra--activa' : i === iMax ? 'est-barra est-barra--maxima' : 'est-barra';
            return <path key={c.clave} className={clase} d={caminoDeColumna(x, y(c.valor), barra, h)} />;
          })}
          {mejor && iMax >= 0 && (
            <text
              className="est-texto-dato"
              x={Math.min(ancho - derecha - 2, Math.max(izquierda + 14, izquierda + iMax * casillero + casillero / 2))}
              y={y(mejor.valor) - 6}
              textAnchor="middle"
              aria-hidden="true"
            >
              {formatoEje(mejor.valor)}
            </text>
          )}
          {columnas.map((c, i) =>
            i % salto === 0 ? (
              <text
                key={c.clave}
                className="est-texto-eje"
                x={izquierda + i * casillero + casillero / 2}
                y={base + 17}
                textAnchor="middle"
                aria-hidden="true"
              >
                {c.etiquetaEje}
              </text>
            ) : null,
          )}
        </svg>
        {columnas.map((c, i) => (
          <span key={c.clave} id={`${idTitulo}-op-${String(i)}`} role="option" aria-selected={i === activa} className="visualmente-oculto">
            {c.titulo}: {c.detalle}
          </span>
        ))}
      </div>
      <p className="est-lectura" aria-hidden="true">
        {elegida ? (
          <>
            <span className="est-lectura__titulo">{elegida.titulo}</span>
            <strong className="est-lectura__dato">{elegida.detalle}</strong>
          </>
        ) : (
          <span className="est-lectura__ayuda">Tocá una columna para ver el dato.</span>
        )}
      </p>
      {mejor && fraseDelMaximo && (
        <p className="est-nota">
          <span className="est-nota__marca est-nota__marca--enfasis" aria-hidden="true" />
          {fraseDelMaximo(mejor)}
        </p>
      )}
    </div>
  );
}
