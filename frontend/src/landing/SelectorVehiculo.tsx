import { useId } from 'react';
import { ETIQUETA_VEHICULO, VEHICULO_PLURAL, VEHICULO_TIPOS } from '../api/contract';
import { SubrayadoFilete } from '../components/Filete';
import { useReserva } from './reserva-contexto';

/**
 * "Precios para: Auto / Camioneta / Moto". Es el mismo estado que el arranque del hero y el formulario de turno
 * (ReservaProvider): lo que se elige acá queda elegido en la reserva y al revés. Son radios nativos, así que las
 * flechas, el Tab y el foco funcionan sin código extra; el aviso en voz alta dice qué precios se están viendo.
 */
export function SelectorVehiculo({ cantidad }: { cantidad?: number }) {
  const { vehiculo, elegirVehiculo } = useReserva();
  const nombre = useId();

  return (
    <fieldset className="precios-para">
      <legend className="precios-para__etiqueta">Precios para</legend>
      <div className="selector selector--3 precios-para__selector">
        {VEHICULO_TIPOS.map((tipo) => (
          <label key={tipo} className="selector__opcion">
            <input
              className="selector__input"
              type="radio"
              name={nombre}
              value={tipo}
              checked={vehiculo === tipo}
              onChange={() => {
                elegirVehiculo(tipo);
              }}
            />
            <span className="selector__texto">{ETIQUETA_VEHICULO[tipo]}</span>
            <SubrayadoFilete className="selector__trazo" />
          </label>
        ))}
      </div>
      <p className="visualmente-oculto" role="status">
        {cantidad === undefined
          ? `Mostrando los precios para ${ETIQUETA_VEHICULO[vehiculo].toLowerCase()}.`
          : cantidad === 0
            ? `No hay servicios para ${VEHICULO_PLURAL[vehiculo]}.`
            : `Mostrando ${cantidad === 1 ? '1 servicio' : `${String(cantidad)} servicios`} para ${VEHICULO_PLURAL[vehiculo]}, con su precio.`}
      </p>
    </fieldset>
  );
}
