import type { RefObject } from 'react';
import { ETIQUETA_FRANJA, ETIQUETA_VEHICULO, FRANJA_EN_FRASE, type TurnoNuevo } from '../api/contract';
import { Icono } from '../components/Icono';
import { whatsappUrl } from '../config/enlaces';
import { negocio } from '../config/sitio';
import { buscarServicio } from '../data/servicios';
import { fechaLarga } from '../lib/fechas';
import { referenciaDeTurno } from '../lib/turnos';

interface Props {
  refTitulo: RefObject<HTMLHeadingElement | null>;
  id: string | null;
  datos: TurnoNuevo;
  alPedirOtro: () => void;
}

/** Pedido enviado: resumen y aviso opcional por WhatsApp con el mensaje armado. */
export function ExitoTurno({ refTitulo, id, datos, alPedirOtro }: Props) {
  const nombreServicio = buscarServicio(datos.servicioId)?.nombre ?? datos.servicioId;
  const primerNombre = datos.nombre.split(/\s+/)[0] ?? datos.nombre;
  const referencia = id ? referenciaDeTurno(id) : null;
  const vehiculo = [ETIQUETA_VEHICULO[datos.vehiculoTipo].toLowerCase(), datos.vehiculoModelo].filter(Boolean).join(' ');

  const mensaje = [
    `¡Hola ${negocio.nombre}! Soy ${datos.nombre}.`,
    `Acabo de pedir un turno desde la web${referencia ? ` (solicitud #${referencia})` : ''}:`,
    `${nombreServicio} para mi ${vehiculo}, el ${fechaLarga(datos.fechaPreferida)} ${FRANJA_EN_FRASE[datos.franja]}.`,
  ].join(' ');
  const whatsapp = whatsappUrl(mensaje);

  const filas: [string, string][] = [
    ['Servicio', nombreServicio],
    ['Vehículo', [ETIQUETA_VEHICULO[datos.vehiculoTipo], datos.vehiculoModelo].filter(Boolean).join(' · ')],
    ['Día', fechaLarga(datos.fechaPreferida)],
    ['Horario', ETIQUETA_FRANJA[datos.franja]],
  ];
  if (referencia) filas.push(['Solicitud', `#${referencia}`]);

  return (
    <div className="exito" role="alert">
      <h3 ref={refTitulo} tabIndex={-1} className="exito__titulo">
        ¡Listo, {primerNombre}! Recibimos tu pedido.
      </h3>
      <p className="exito__texto">Te vamos a contactar para confirmar el día y el horario.</p>
      <dl className="exito__resumen">
        {filas.map(([dt, dd]) => (
          <div key={dt}>
            <dt>{dt}</dt>
            <dd>{dd}</dd>
          </div>
        ))}
      </dl>
      <div className="exito__acciones">
        {whatsapp && (
          <a className="boton boton--primario boton--grande" href={whatsapp} target="_blank" rel="noopener noreferrer">
            <Icono nombre="whatsapp" />
            Avisanos por WhatsApp
          </a>
        )}
        <button type="button" className="boton boton--fantasma" onClick={alPedirOtro}>
          Pedir otro turno
        </button>
      </div>
    </div>
  );
}
