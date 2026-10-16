import type { ReactNode } from 'react';
import { ETIQUETA_FRANJA, ETIQUETA_VEHICULO, esFranja, esVehiculoTipo } from '../api/contract';
import { Icono } from '../components/Icono';
import { whatsappUrl } from '../config/enlaces';
import { negocio } from '../config/sitio';
import { buscarServicio } from '../data/servicios';
import { fechaLarga } from '../lib/fechas';
import type { Envio, Errores, Valores } from './useFormularioTurno';

interface Props {
  valores: Valores;
  errores: Errores;
  validarEnVivo: boolean;
  envio: Envio;
}

const vacio = <span className="resumen__vacio">Sin elegir</span>;

/** Columna lateral: el pedido armándose en vivo, avisos, envío y aviso de privacidad. */
export function ResumenPedido({ valores, errores, validarEnVivo, envio }: Props) {
  const servicio = buscarServicio(valores.servicioId);
  const whatsappAyuda = whatsappUrl(`¡Hola ${negocio.nombre}! Quiero pedir un turno.`);
  const cantidadErrores = Object.keys(errores).length;

  const filas: [string, ReactNode][] = [
    ['Servicio', servicio ? servicio.nombre : vacio],
    [
      'Vehículo',
      esVehiculoTipo(valores.vehiculoTipo)
        ? [ETIQUETA_VEHICULO[valores.vehiculoTipo], valores.vehiculoModelo.trim()].filter(Boolean).join(' · ')
        : vacio,
    ],
    ['Día', valores.fechaPreferida ? fechaLarga(valores.fechaPreferida) : vacio],
    ['Horario', esFranja(valores.franja) ? ETIQUETA_FRANJA[valores.franja] : vacio],
  ];

  return (
    <div className="reserva__lateral">
      <div className="resumen">
        <h3 className="resumen__titulo">Tu pedido</h3>
        <dl className="resumen__lista">
          {filas.map(([dt, dd]) => (
            <div key={dt} className="resumen__fila">
              <dt>{dt}</dt>
              <dd>{dd}</dd>
            </div>
          ))}
        </dl>
        {servicio && (
          <p className="resumen__nota">
            <Icono nombre="reloj" tamano={18} />
            Duración estimada: {servicio.duracion}
          </p>
        )}
      </div>

      {envio.fase === 'error' && (
        <div className="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <div className="aviso__cuerpo">
            <p>{envio.mensaje}</p>
            {(envio.reintentable || whatsappAyuda) && (
              <p className="aviso__acciones">
                {envio.reintentable && (
                  <button type="submit" className="enlace aviso__boton">
                    Reintentar
                  </button>
                )}
                {whatsappAyuda && (
                  <a className="enlace" href={whatsappAyuda} target="_blank" rel="noopener noreferrer">
                    Pedilo por WhatsApp
                  </a>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {envio.fase !== 'error' && validarEnVivo && cantidadErrores > 0 && (
        <p className="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          {cantidadErrores === 1
            ? 'Revisá el campo marcado para poder enviar tu pedido.'
            : `Revisá los ${String(cantidadErrores)} campos marcados para poder enviar tu pedido.`}
        </p>
      )}

      <button
        type="submit"
        className="boton boton--primario boton--grande boton--bloque"
        disabled={envio.fase === 'enviando'}
      >
        {envio.fase === 'enviando' ? 'Enviando tu pedido…' : 'Reservá tu turno'}
        {envio.fase !== 'enviando' && <Icono nombre="flecha" />}
      </button>
      <p className="reserva__privacidad">
        Usamos tus datos solo para coordinar tu turno (Ley 25.326 de Protección de Datos Personales).
      </p>
    </div>
  );
}
