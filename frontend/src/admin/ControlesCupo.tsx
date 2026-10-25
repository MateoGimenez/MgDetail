import { CUPO_MAXIMO } from '../api/contract-panel';
import { Icono } from '../components/Icono';

/**
 * Interruptor de sí/no (role="switch"): el estado se lee en la posición de la perilla y en el texto de al lado
 * ("Abierto" / "Cerrado"), no solo en el color.
 */
export function Interruptor({
  etiqueta,
  activo,
  textoSi,
  textoNo,
  deshabilitado = false,
  describe,
  alCambiar,
}: {
  etiqueta: string;
  activo: boolean;
  textoSi: string;
  textoNo: string;
  deshabilitado?: boolean;
  describe?: string;
  alCambiar: (activo: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-describedby={describe}
      className="interruptor"
      disabled={deshabilitado}
      onClick={() => {
        alCambiar(!activo);
      }}
    >
      <span className="interruptor__etiqueta">{etiqueta}</span>
      <span className="interruptor__estado" aria-hidden="true">
        {activo ? textoSi : textoNo}
      </span>
      <span className="interruptor__riel" aria-hidden="true">
        <span className="interruptor__perilla" />
      </span>
    </button>
  );
}

/**
 * Cupo con − y +: botones de 44 px (se usa con el pulgar) y el número en el medio. `minimo` 0 en el horario habitual
 * (0 = franja sin turnos) y 1 en el detalle del día, donde la franja se apaga con su interruptor.
 */
export function Pasos({
  nombre,
  valor,
  minimo,
  deshabilitado = false,
  alCambiar,
}: {
  /** "a la mañana del lunes": completa "Un turno menos …". */
  nombre: string;
  valor: number;
  minimo: number;
  deshabilitado?: boolean;
  alCambiar: (valor: number) => void;
}) {
  return (
    <div className="pasos" role="group" aria-label={`Cupo ${nombre}`}>
      <button
        type="button"
        className="pasos__boton"
        aria-label={`Un turno menos ${nombre}`}
        disabled={deshabilitado || valor <= minimo}
        onClick={() => {
          alCambiar(Math.max(minimo, valor - 1));
        }}
      >
        <Icono nombre="menos" tamano={18} />
      </button>
      <output className="pasos__valor" aria-live="polite">
        {valor}
      </output>
      <button
        type="button"
        className="pasos__boton"
        aria-label={`Un turno más ${nombre}`}
        disabled={deshabilitado || valor >= CUPO_MAXIMO}
        onClick={() => {
          alCambiar(Math.min(CUPO_MAXIMO, valor + 1));
        }}
      >
        <Icono nombre="mas" tamano={18} />
      </button>
    </div>
  );
}
