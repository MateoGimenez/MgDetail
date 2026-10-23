import { ETIQUETA_ESTADO, ETIQUETA_FRANJA, ETIQUETA_VEHICULO, type Turno } from '../api/contract';
import { lugarEnAgenda, textoPidio } from '../lib/agenda';
import { diaConMes } from '../lib/fechas';

interface Props {
  turno: Turno;
  nombreServicio: string;
  cambiada: boolean;
  alAbrir: () => void;
}

/**
 * Un turno dentro de la agenda: cliente, servicio, vehículo y estado. Toca y abre el detalle.
 * Los pendientes son tentativos: borde punteado, fondo rayado y el sello "Pendiente" (no solo color).
 */
export function FichaAgenda({ turno, nombreServicio, cambiada, alAbrir }: Props) {
  const lugar = lugarEnAgenda(turno);
  const pidio = textoPidio(turno);
  const vehiculo = [ETIQUETA_VEHICULO[turno.vehiculoTipo], turno.vehiculoModelo].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      className={['ficha', `ficha--${turno.estado}`, cambiada ? 'ficha--cambiada' : ''].filter(Boolean).join(' ')}
      aria-haspopup="dialog"
      data-turno={turno.id}
      onClick={alAbrir}
    >
      {/* Al recorrer con Tab, el botón solo no dice cuándo es: se lo anticipa al lector de pantalla. */}
      <span className="visualmente-oculto">
        {diaConMes(lugar.fecha)}, {ETIQUETA_FRANJA[lugar.franja].toLowerCase()}:{' '}
      </span>
      <span className="ficha__nombre">{turno.nombre}</span>
      <span className="ficha__servicio">{nombreServicio}</span>
      <span className="ficha__vehiculo">{vehiculo}</span>
      <span className="ficha__pie">
        <span className={`sello sello--chico sello--${turno.estado}`}>{ETIQUETA_ESTADO[turno.estado]}</span>
        {pidio && <span className="ficha__pidio">{pidio}</span>}
      </span>
    </button>
  );
}
