import { useId, type PointerEvent } from 'react';
import { escalaLineal, indiceEnX, saltoDeEtiquetas, ticksLindos } from '../../../lib/estadisticas';
import { useAncho } from './useAncho';
import { useSeleccion } from './useSeleccion';

export interface ParDeColumnas {
  clave: string;
  ingresos: number;
  gastos: number;
  /** Lo que va debajo del par en el eje ("22", "1 oct", "oct"). */
  etiquetaEje: string;
  /** Nombre completo para la línea de lectura ("jueves 22 de octubre"). */
  titulo: string;
  /** Dato para la línea de lectura ("Ingresos $ 80.000 · Gastos $ 20.000 · Ganancia neta $ 60.000"). */
  detalle: string;
}

interface Props {
  pares: readonly ParDeColumnas[];
  idTitulo: string;
  idResumen: string;
  formatoEje: (n: number) => string;
  alto?: number;
}

const ANCHO_ETIQUETA = 44;
const HUECO = 2;

/** Camino de una columna con 4 px redondeados arriba (el dato) y base recta sobre el eje. */
function caminoDeColumna(x: number, y: number, ancho: number, alto: number): string {
  const r = Math.min(4, ancho / 2, alto);
  return `M${x},${y + alto}V${y + r}Q${x},${y} ${x + r},${y}H${x + ancho - r}Q${x + ancho},${y} ${x + ancho},${y + r}V${y + alto}Z`;
}

/**
 * Barras agrupadas: en cada día (o mes) van dos columnas finas, ingresos y gastos, sobre un solo eje. Los gastos
 * llevan rayas además del color rojo del panel, y la leyenda siempre está visible: la diferencia no depende del
 * color. Tocar un par, pasar el mouse o usar las flechas escribe el dato en la línea de abajo (sin tooltip que se
 * corte en el celular).
 */
export function GraficoIngresosGastos({ pares, idTitulo, idResumen, formatoEje, alto = 240 }: Props) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const { activa, elegir, alTeclear } = useSeleccion(pares.length);
  const rayas = `est-rayas-${useId().replace(/:/g, '')}`;

  const maximo = pares.reduce((m, p) => Math.max(m, p.ingresos, p.gastos), 0);
  const eje = ticksLindos(maximo, 4, false);
  const izquierda = Math.max(...eje.ticks.map((t) => formatoEje(t).length)) * 6.6 + 14;
  const derecha = 8;
  const arriba = 14;
  const abajo = 26;
  const util = Math.max(40, ancho - izquierda - derecha);
  const casillero = util / Math.max(1, pares.length);
  // El par entero mide como una columna de las otras gráficas (hasta 24 px) y cada una la mitad menos el hueco.
  const conjunto = Math.max(3, Math.min(24, casillero * 0.7));
  const columna = Math.max(1, (conjunto - HUECO) / 2);
  const y = escalaLineal([0, eje.techo], [alto - abajo, arriba]);
  const base = alto - abajo;
  const salto = saltoDeEtiquetas(pares.length, util, ANCHO_ETIQUETA);

  const elegirDesdeX = (evento: PointerEvent<SVGSVGElement>) => {
    const caja = evento.currentTarget.getBoundingClientRect();
    elegir(indiceEnX(evento.clientX - caja.left, izquierda, util, pares.length));
  };
  const elegida = activa === null ? null : pares[activa];

  return (
    <div className="est-columnas" ref={ref}>
      {/* Con dos series la leyenda siempre está: muestra el color y la trama de cada una. */}
      <ul className="est-leyenda" role="list">
        <li>
          <svg className="est-leyenda__muestra" width="18" height="12" aria-hidden="true">
            <rect className="est-barra" width="18" height="12" rx="2" />
          </svg>
          Ingresos
        </li>
        <li>
          <svg className="est-leyenda__muestra" width="18" height="12" aria-hidden="true">
            <rect className="est-barra--gastos" width="18" height="12" rx="2" />
            <rect fill={`url(#${rayas})`} width="18" height="12" rx="2" />
          </svg>
          Gastos
        </li>
      </ul>

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
          <defs>
            <pattern id={rayas} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect className="est-trama" width="1.6" height="5" />
            </pattern>
          </defs>
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
          {pares.map((p, i) => {
            const x0 = izquierda + i * casillero + (casillero - conjunto) / 2;
            const hIngresos = base - y(p.ingresos);
            const hGastos = base - y(p.gastos);
            return (
              <g key={p.clave}>
                {p.ingresos > 0 && <path className="est-barra" d={caminoDeColumna(x0, y(p.ingresos), columna, hIngresos)} />}
                {p.gastos > 0 && (
                  <>
                    <path className="est-barra--gastos" d={caminoDeColumna(x0 + columna + HUECO, y(p.gastos), columna, hGastos)} />
                    <path
                      className="est-trama-barra"
                      style={{ fill: `url(#${rayas})` }}
                      d={caminoDeColumna(x0 + columna + HUECO, y(p.gastos), columna, hGastos)}
                    />
                  </>
                )}
              </g>
            );
          })}
          {pares.map((p, i) =>
            i % salto === 0 ? (
              <text
                key={p.clave}
                className="est-texto-eje"
                x={izquierda + i * casillero + casillero / 2}
                y={base + 17}
                textAnchor="middle"
                aria-hidden="true"
              >
                {p.etiquetaEje}
              </text>
            ) : null,
          )}
        </svg>
        {pares.map((p, i) => (
          <span key={p.clave} id={`${idTitulo}-op-${String(i)}`} role="option" aria-selected={i === activa} className="visualmente-oculto">
            {p.titulo}: {p.detalle}
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
          <span className="est-lectura__ayuda">Tocá un par de columnas para ver el dato.</span>
        )}
      </p>
    </div>
  );
}
