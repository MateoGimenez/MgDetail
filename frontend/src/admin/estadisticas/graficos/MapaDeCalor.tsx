import { ETIQUETA_FRANJA, type Franja } from '../../../api/contract';
import { DIAS_SEMANA_BACKEND, DIAS_SEMANA_CORTOS, nivelDeCalor, pedidos } from '../../../lib/estadisticas';
import { useSeleccion } from './useSeleccion';

interface FilaCalor {
  dia: number;
  manana: number;
  tarde: number;
}

interface Props {
  filas: readonly FilaCalor[];
  idTitulo: string;
  idResumen: string;
}

const FRANJAS_COLUMNA: readonly Franja[] = ['manana', 'tarde'];
const ANCHO = 320;
const ETIQUETA = 52;
const ENCABEZADO = 26;
const ALTO_FILA = 36;
const HUECO = 2;

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/**
 * Cuándo vienen: día de la semana (filas, de lunes a domingo) por franja (columnas). Cada casillero lleva el número
 * escrito, así que el color es un refuerzo y no la única señal; cuatro niveles de un solo tono (el rojo del panel),
 * con el texto en tinta o en blanco según el fondo para mantener el contraste.
 */
export function MapaDeCalor({ filas, idTitulo, idResumen }: Props) {
  const { activa, elegir, alTeclear } = useSeleccion(filas.length * 2, 2);
  const maximo = filas.reduce((m, f) => Math.max(m, f.manana, f.tarde), 0);
  const alto = ENCABEZADO + filas.length * ALTO_FILA;
  const ancho = (ANCHO - ETIQUETA) / 2;

  const lectura = (i: number) => {
    const fila = filas[Math.floor(i / 2)];
    const franja = FRANJAS_COLUMNA[i % 2] ?? 'manana';
    const dia = conMayuscula(DIAS_SEMANA_BACKEND[fila?.dia ?? 0] ?? '');
    return { titulo: `${dia}, ${ETIQUETA_FRANJA[franja].toLowerCase()}`, dato: pedidos(fila ? fila[franja] : 0) };
  };
  const elegida = activa === null ? null : lectura(activa);

  return (
    <div className="est-calor">
      <div
        className="est-enfocable"
        role="listbox"
        aria-labelledby={idTitulo}
        aria-describedby={idResumen}
        aria-activedescendant={activa === null ? undefined : `${idTitulo}-op-${String(activa)}`}
        tabIndex={0}
        onKeyDown={alTeclear}
      >
        <svg
          className="est-svg est-svg--calor"
          viewBox={`0 0 ${String(ANCHO)} ${String(alto)}`}
          aria-hidden="true"
        >
          {FRANJAS_COLUMNA.map((franja, c) => (
            <text
              key={franja}
              className="est-texto-eje est-texto-eje--fuerte"
              x={ETIQUETA + c * ancho + ancho / 2}
              y={ENCABEZADO - 9}
              textAnchor="middle"
              aria-hidden="true"
            >
              {ETIQUETA_FRANJA[franja]}
            </text>
          ))}
          {filas.map((fila, r) => (
            <g key={fila.dia}>
              <text
                className="est-texto-eje est-texto-eje--fuerte"
                x={0}
                y={ENCABEZADO + r * ALTO_FILA + ALTO_FILA / 2}
                dominantBaseline="middle"
                aria-hidden="true"
              >
                {conMayuscula(DIAS_SEMANA_CORTOS[fila.dia] ?? '')}
              </text>
              {FRANJAS_COLUMNA.map((franja, c) => {
                const i = r * 2 + c;
                const valor = fila[franja];
                const nivel = nivelDeCalor(valor, maximo);
                const x = ETIQUETA + c * ancho;
                const y = ENCABEZADO + r * ALTO_FILA;
                return (
                  <g
                    key={franja}
                    onPointerDown={() => {
                      elegir(i);
                    }}
                    onPointerEnter={(evento) => {
                      if (evento.pointerType === 'mouse') elegir(i);
                    }}
                  >
                    <rect
                      className={`est-celda est-calor--n${String(nivel)}`}
                      x={x + HUECO / 2}
                      y={y + HUECO / 2}
                      width={ancho - HUECO}
                      height={ALTO_FILA - HUECO}
                      rx="4"
                    />
                    {activa === i && (
                      <rect
                        className="est-celda-activa"
                        x={x + HUECO / 2 + 1}
                        y={y + HUECO / 2 + 1}
                        width={ancho - HUECO - 2}
                        height={ALTO_FILA - HUECO - 2}
                        rx="3"
                      />
                    )}
                    <text
                      className={nivel === 4 ? 'est-celda-numero est-celda-numero--claro' : 'est-celda-numero'}
                      x={x + ancho / 2}
                      y={y + ALTO_FILA / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      aria-hidden="true"
                    >
                      {valor}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
        {Array.from({ length: filas.length * 2 }, (_, i) => {
          const { titulo, dato } = lectura(i);
          return (
            <span key={i} id={`${idTitulo}-op-${String(i)}`} role="option" aria-selected={i === activa} className="visualmente-oculto">
              {titulo}: {dato}
            </span>
          );
        })}
      </div>
      <p className="est-lectura" aria-hidden="true">
        {elegida ? (
          <>
            <span className="est-lectura__titulo">{elegida.titulo}</span>
            <strong className="est-lectura__dato">{elegida.dato}</strong>
          </>
        ) : (
          <span className="est-lectura__ayuda">Tocá un casillero para ver el dato.</span>
        )}
      </p>
      <div className="est-escala" aria-hidden="true">
        <span>Menos</span>
        {[0, 1, 2, 3, 4].map((n) => (
          <span key={n} className={`est-escala__celda est-calor--n${String(n)}`} />
        ))}
        <span>Más</span>
      </div>
    </div>
  );
}
