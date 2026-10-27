import { useId } from 'react';
import { entero, porcentaje, segmentosApilados, type EstadoBarra, type PartesDelEstado } from '../../../lib/estadisticas';
import { useAncho } from './useAncho';

interface Props {
  partes: readonly PartesDelEstado[];
  idTitulo: string;
  idResumen: string;
}

const ALTO = 28;
const HUECO = 2;

/** Relleno extra de cada estado, encima del color: sin él los cuatro dependerían solo del tono. */
function Patrones({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-pendiente`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect className="est-trama" width="2" height="7" />
      </pattern>
      <pattern id={`${id}-confirmado`} width="7" height="7" patternUnits="userSpaceOnUse">
        <circle className="est-trama" cx="3.5" cy="3.5" r="1.3" />
      </pattern>
      <pattern id={`${id}-cancelado`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <rect className="est-trama" width="2" height="7" />
      </pattern>
    </defs>
  );
}

const rellenoDe = (id: string, estado: EstadoBarra) => (estado === 'completado' ? undefined : `url(#${id}-${estado})`);

/**
 * Barra apilada (parte de un todo) con los estados de los turnos. Cada segmento tiene tono y trama propios (rayas,
 * puntos, liso, rayas al revés) y la leyenda de abajo escribe cantidad y porcentaje de cada uno: nada depende del
 * color. Un segmento sin lugar para su número lo deja a la leyenda.
 */
export function EstadoDeTurnos({ partes, idTitulo, idResumen }: Props) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const id = `est-trama-${useId().replace(/:/g, '')}`;
  const segmentos = segmentosApilados(partes, ancho, HUECO);
  const total = partes.reduce((suma, p) => suma + p.cantidad, 0);

  return (
    <div className="est-estados" ref={ref}>
      <svg
        className="est-svg"
        width={ancho}
        height={ALTO}
        viewBox={`0 0 ${String(ancho)} ${String(ALTO)}`}
        role="img"
        aria-labelledby={idTitulo}
        aria-describedby={idResumen}
      >
        <Patrones id={id} />
        {segmentos.map((s, i) => {
          const parte = partes.find((p) => p.estado === s.estado);
          const redondeo = i === 0 || i === segmentos.length - 1 ? 4 : 0;
          const relleno = rellenoDe(id, s.estado);
          return (
            <g key={s.estado}>
              <rect className={`est-estado est-estado--${s.estado}`} x={s.x} y={0} width={s.ancho} height={ALTO} rx={redondeo} />
              {relleno && <rect fill={relleno} x={s.x} y={0} width={s.ancho} height={ALTO} rx={redondeo} />}
              {parte && s.ancho >= 30 && (
                <text className="est-estado-numero" x={s.x + s.ancho / 2} y={ALTO / 2} textAnchor="middle" dominantBaseline="central" aria-hidden="true">
                  {entero(parte.cantidad)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="est-estados__leyenda" role="list">
        {partes.map((p) => {
          const idLeyenda = `${id}-l${p.estado}`;
          const relleno = rellenoDe(idLeyenda, p.estado);
          return (
            <li key={p.estado} className="est-estados__fila">
              <svg className="est-leyenda__muestra" width="18" height="14" aria-hidden="true" focusable="false">
                <Patrones id={idLeyenda} />
                <rect className={`est-estado est-estado--${p.estado}`} width="18" height="14" rx="2" />
                {relleno && <rect fill={relleno} width="18" height="14" rx="2" />}
              </svg>
              <span className="est-estados__nombre">{p.etiqueta}</span>
              <span className="est-estados__cantidad">{entero(p.cantidad)}</span>
              <span className="est-estados__pct">{total > 0 ? porcentaje(p.proporcion) : '—'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
