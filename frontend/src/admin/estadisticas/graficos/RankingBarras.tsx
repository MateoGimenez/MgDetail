import { useId, useState } from 'react';

export interface FilaRanking {
  id: string;
  etiqueta: string;
  /** Lo que mide la barra principal (completados). */
  valor: number;
  /** Barra de atrás, más grande (pedidos), si hay una segunda medida. */
  valorTotal?: number;
  /** Número a la derecha del nombre ("$ 600.000", "12"). */
  textoValor: string;
  /** Línea chica debajo de la barra, con lo que no entra arriba. */
  detalle: string;
  /** La que se marca en rojo (la primera del ranking). */
  enfasis?: boolean;
  /** "Sin asignar": no es una persona; se dibuja rayada. */
  sinAsignar?: boolean;
}

interface Props {
  filas: readonly FilaRanking[];
  idTitulo: string;
  idResumen: string;
  /** Leyenda de las dos barras ("Pedidos" y "Completados"); solo si hay `valorTotal`. */
  leyenda?: { total: string; valor: string };
  maxVisibles?: number;
  /** Cómo se llaman las filas escondidas en el botón ("servicios", "personas"). */
  nombrePlural: string;
}

/** Barra horizontal con el dato en el extremo redondeado y el origen recto. El ancho va en %, no en px. */
function BarraH({ porcentaje, clase, relleno }: { porcentaje: number; clase: string; relleno?: string }) {
  const ancho = Math.max(0, Math.min(100, porcentaje));
  if (ancho <= 0) return null;
  return (
    // El svg interno recorta lo que sobra a la izquierda: el rectángulo redondeado se estira 4 px de más y queda
    // recto del lado del origen.
    <svg x="0" y="0" width={`${String(ancho)}%`} height="100%" overflow="hidden">
      <rect className={clase} fill={relleno} x="-4" y="0" height="100%" rx="4" style={{ width: 'calc(100% + 4px)' }} />
    </svg>
  );
}

/**
 * Ranking de barras horizontales. El nombre va arriba de la barra (no a su izquierda) para que los nombres largos
 * no se corten en el celular, y todos los valores están escritos: no hace falta tocar nada. Si hay dos medidas, la
 * de atrás (pedidos) va rayada y la de adelante (completados) lisa, así no dependen del color.
 */
export function RankingBarras({ filas, idTitulo, idResumen, leyenda, maxVisibles = 8, nombrePlural }: Props) {
  const [todas, setTodas] = useState(false);
  const rayas = `est-rayas-${useId().replace(/:/g, '')}`;
  const visibles = todas ? filas : filas.slice(0, maxVisibles);
  const maximo = filas.reduce((m, f) => Math.max(m, f.valorTotal ?? f.valor, f.valor), 0);
  const pct = (n: number) => (maximo > 0 ? (n / maximo) * 100 : 0);

  return (
    <div className="est-ranking" role="group" aria-labelledby={idTitulo} aria-describedby={idResumen}>
      <svg width="0" height="0" className="est-defs" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={rayas} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect className="est-raya" width="1.6" height="5" />
          </pattern>
        </defs>
      </svg>
      {leyenda && (
        <ul className="est-leyenda" role="list">
          <li>
            <svg className="est-leyenda__muestra" width="18" height="12" aria-hidden="true">
              <rect className="est-barra-total" width="18" height="12" rx="2" />
              <rect fill={`url(#${rayas})`} width="18" height="12" rx="2" />
            </svg>
            {leyenda.total}
          </li>
          <li>
            <svg className="est-leyenda__muestra" width="18" height="12" aria-hidden="true">
              <rect className="est-barra" width="18" height="12" rx="2" />
            </svg>
            {leyenda.valor}
          </li>
        </ul>
      )}
      <ol className="est-filas" role="list">
        {visibles.map((fila) => (
          <li key={fila.id} className="est-fila">
            <div className="est-fila__cabecera">
              <span className="est-fila__nombre">{fila.etiqueta}</span>
              <span className="est-fila__valor">{fila.textoValor}</span>
            </div>
            <svg className="est-fila__barra" height="14" aria-hidden="true" focusable="false">
              <rect className="est-pista" width="100%" height="100%" />
              {fila.valorTotal !== undefined && <BarraH porcentaje={pct(fila.valorTotal)} clase="est-barra-total" />}
              {fila.valorTotal !== undefined && <BarraH porcentaje={pct(fila.valorTotal)} clase="est-barra-rayas" relleno={`url(#${rayas})`} />}
              <BarraH
                porcentaje={pct(fila.valor)}
                clase={fila.sinAsignar ? 'est-barra est-barra--sin' : fila.enfasis ? 'est-barra est-barra--maxima' : 'est-barra'}
              />
            </svg>
            {fila.detalle && <p className="est-fila__detalle">{fila.detalle}</p>}
          </li>
        ))}
      </ol>
      {filas.length > maxVisibles && (
        <button
          type="button"
          className="boton boton--secundario boton--chico est-ranking__mas"
          aria-expanded={todas}
          onClick={() => {
            setTodas((v) => !v);
          }}
        >
          {todas ? `Ver menos ${nombrePlural}` : `Ver los ${String(filas.length - maxVisibles)} ${nombrePlural} restantes`}
        </button>
      )}
    </div>
  );
}
