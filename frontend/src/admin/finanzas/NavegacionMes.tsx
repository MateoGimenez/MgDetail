import { Icono } from '../../components/Icono';
import { etiquetaDelMes, sumarMeses } from '../../lib/finanzas';

interface Props {
  mes: string;
  /** El mes de hoy. */
  mesActual: string;
  /** El último mes al que se puede ir (el actual en Gastos; hasta un año adelante en Metas). */
  mesMaximo: string;
  alCambiar: (mes: string) => void;
}

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** Mes anterior / mes siguiente con el nombre del mes en el medio. El nombre se anuncia al cambiar (`aria-live`). */
export function NavegacionMes({ mes, mesActual, mesMaximo, alCambiar }: Props) {
  const anterior = sumarMeses(mes, -1);
  const siguiente = sumarMeses(mes, 1);
  const hayMasAdelante = siguiente <= mesMaximo;
  return (
    <div className="fin-mes" role="group" aria-label="Mes que estás mirando">
      <button
        type="button"
        className="fin-flecha"
        aria-label={`Ver ${etiquetaDelMes(anterior)}`}
        onClick={() => {
          alCambiar(anterior);
        }}
      >
        <Icono nombre="izquierda" tamano={22} />
      </button>
      <p className="fin-mes__nombre" aria-live="polite" aria-atomic="true">
        {conMayuscula(etiquetaDelMes(mes))}
      </p>
      <button
        type="button"
        className="fin-flecha"
        aria-label={hayMasAdelante ? `Ver ${etiquetaDelMes(siguiente)}` : 'No hay un mes siguiente para ver'}
        disabled={!hayMasAdelante}
        onClick={() => {
          alCambiar(siguiente);
        }}
      >
        <Icono nombre="derecha" tamano={22} />
      </button>
      {mes !== mesActual && (
        <button
          type="button"
          className="boton boton--secundario boton--chico fin-mes__hoy"
          onClick={() => {
            alCambiar(mesActual);
          }}
        >
          Ir a este mes
        </button>
      )}
    </div>
  );
}
