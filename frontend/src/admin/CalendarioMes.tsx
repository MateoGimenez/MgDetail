import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Rombo, SubrayadoFilete } from '../components/Filete';
import { fechaConTecla, nombreDelDia, type EstadoDelDia, type FranjaDelDia } from '../lib/calendarioPanel';
import { numeroDelDia } from '../lib/fechas';

const COLUMNAS = [
  ['lun', 'lunes'],
  ['mar', 'martes'],
  ['mié', 'miércoles'],
  ['jue', 'jueves'],
  ['vie', 'viernes'],
  ['sáb', 'sábado'],
  ['dom', 'domingo'],
] as const;

/** Hasta este cupo la franja se dibuja con un segmento por turno; arriba, como una barra que se llena. */
const SEGMENTOS_MAXIMOS = 8;

/** Una franja dentro de la celda: la cifra "1/2" (en pantalla ancha) y la barra de lugares. Decorativa. */
function Franja({ nombre, franja }: { nombre: string; franja: FranjaDelDia }) {
  const { cupo, ocupados } = franja;
  if (cupo === 0) {
    return (
      <span className="cal__franja cal__franja--sin">
        <span className="cal__cifra">
          <span className="cal__franja-nombre">{nombre}</span> —
        </span>
        <span className="cal__barra cal__barra--sin" />
      </span>
    );
  }
  const llenos = Math.min(ocupados ?? 0, cupo);
  return (
    <span className={ocupados !== null && ocupados >= cupo ? 'cal__franja cal__franja--completa' : 'cal__franja'}>
      <span className="cal__cifra">
        <span className="cal__franja-nombre">{nombre}</span> {ocupados === null ? cupo : `${String(ocupados)}/${String(cupo)}`}
      </span>
      {cupo <= SEGMENTOS_MAXIMOS ? (
        <span className="cal__barra">
          {Array.from({ length: cupo }, (_, i) => (
            <span key={i} className={i < llenos ? 'cal__lugar cal__lugar--ocupado' : 'cal__lugar'} />
          ))}
        </span>
      ) : (
        <span className="cal__barra cal__barra--continua">
          <span className="cal__relleno" style={{ width: `${String((llenos / cupo) * 100)}%` }} />
        </span>
      )}
    </span>
  );
}

interface Props {
  /** "2026-10": los días de otros meses se ven más claros. */
  mes: string;
  idTitulo: string;
  estados: readonly EstadoDelDia[];
  /** El día que tiene el tab (tabindex 0). */
  foco: string;
  /** Días elegidos: el del detalle o los de "Elegir varios días". */
  elegidos: ReadonlySet<string>;
  /** Elegir varios días: la grilla es de selección múltiple. */
  varios: boolean;
  /** Primera punta de un rango, esperando la segunda. */
  ancla: string | null;
  alMoverFoco: (fecha: string) => void;
  alTocar: (fecha: string) => void;
}

/**
 * Grilla del mes (patrón grid de fechas de WAI-ARIA): un solo día en el orden de tabulación; flechas, Inicio, Fin,
 * Re Pág y Av Pág lo mueven (si sale de la grilla, cambia el mes). Cada día es un botón con el nombre completo.
 */
export function CalendarioMes({ mes, idTitulo, estados, foco, elegidos, varios, ancla, alMoverFoco, alTocar }: Props) {
  const grillaRef = useRef<HTMLDivElement>(null);
  /** Solo se mueve el foco del navegador después de una tecla (no al cambiar de mes con los botones). */
  const enfocar = useRef(false);

  useEffect(() => {
    if (!enfocar.current) return;
    enfocar.current = false;
    grillaRef.current?.querySelector<HTMLButtonElement>(`[data-fecha="${foco}"]`)?.focus();
  }, [foco, mes]);

  const alTeclear = (evento: KeyboardEvent<HTMLDivElement>) => {
    const nueva = fechaConTecla(foco, evento.key);
    if (nueva === null) return;
    evento.preventDefault();
    enfocar.current = true;
    alMoverFoco(nueva);
  };

  const semanas = Array.from({ length: Math.ceil(estados.length / 7) }, (_, i) => estados.slice(i * 7, i * 7 + 7));

  return (
    <div
      ref={grillaRef}
      role="grid"
      // El tab entra al día con tabindex 0 (foco itinerante); la grilla solo recibe el foco por código.
      tabIndex={-1}
      className={varios ? 'cal cal--varios' : 'cal'}
      aria-labelledby={idTitulo}
      aria-multiselectable={varios || undefined}
      onKeyDown={alTeclear}
    >
      <div role="row" className="cal__fila cal__fila--cabeza">
        {COLUMNAS.map(([corto, largo]) => (
          <span key={corto} role="columnheader" className="cal__columna" aria-label={largo}>
            {corto}
          </span>
        ))}
      </div>
      {semanas.map((semana) => (
        <div key={semana[0]?.fecha} role="row" className="cal__fila">
          {semana.map((e) => {
            const elegido = elegidos.has(e.fecha);
            const clases = [
              'cal__dia',
              e.fecha.slice(0, 7) !== mes ? 'cal__dia--otro-mes' : '',
              e.pasado ? 'cal__dia--pasado' : '',
              e.hoy ? 'cal__dia--hoy' : '',
              e.abierto ? '' : 'cal__dia--cerrado',
              elegido ? 'cal__dia--elegido' : '',
              ancla === e.fecha ? 'cal__dia--ancla' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const bloqueado = varios && e.pasado;
            return (
              <div key={e.fecha} role="gridcell" className="cal__celda" aria-selected={elegido}>
                <button
                  type="button"
                  className={clases}
                  data-fecha={e.fecha}
                  tabIndex={e.fecha === foco ? 0 : -1}
                  aria-label={nombreDelDia(e)}
                  aria-disabled={bloqueado || undefined}
                  onClick={() => {
                    if (bloqueado) return;
                    alMoverFoco(e.fecha);
                    alTocar(e.fecha);
                  }}
                >
                  <span className="cal__cabeza" aria-hidden="true">
                    <span className="cal__numero">{numeroDelDia(e.fecha)}</span>
                    {e.aMano && <Rombo className="cal__mano" />}
                  </span>
                  <span className="cal__cuerpo" aria-hidden="true">
                    {e.feriado && <span className="cal__feriado">Feriado</span>}
                    {e.abierto ? (
                      <>
                        <Franja nombre="Mañana" franja={e.manana} />
                        <Franja nombre="Tarde" franja={e.tarde} />
                      </>
                    ) : (
                      <span className="cal__cerrado">Cerrado</span>
                    )}
                  </span>
                  {elegido && !varios && <SubrayadoFilete className="cal__trazo" />}
                  {elegido && varios && <span className="cal__tilde" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
