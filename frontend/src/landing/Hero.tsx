import { useState, type FormEvent } from 'react';
import { ETIQUETA_VEHICULO, VEHICULO_TIPOS, esServicioId, type ServicioId, type VehiculoTipo } from '../api/contract';
import { MarcoFilete, SubrayadoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { whatsappUrl } from '../config/enlaces';
import { negocio } from '../config/sitio';
import { servicios } from '../data/servicios';
import { useReserva } from './reserva-contexto';

/**
 * Primer viewport: el cartel del taller. Adentro, el arranque del turno ya
 * funciona: lo que se elige acá queda cargado en el formulario.
 */
export function Hero() {
  const { reservar } = useReserva();
  const [vehiculo, setVehiculo] = useState<VehiculoTipo | ''>('');
  const [servicio, setServicio] = useState<ServicioId | ''>('');
  const whatsapp = whatsappUrl(`¡Hola ${negocio.nombre}! Quiero consultar por un turno.`);

  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    reservar({
      servicioId: servicio === '' ? undefined : servicio,
      vehiculoTipo: vehiculo === '' ? undefined : vehiculo,
    });
  };

  return (
    <section id="inicio" className="hero" aria-labelledby="hero-titulo">
      <div className="cartel">
        <MarcoFilete tamano="grande" trazar />
        <div className="cartel__contenido">
          <h1 id="hero-titulo" className="hero__titulo">
            <span className="cromo cromo--barrido">Hasta el último detalle.</span>
          </h1>
          <p className="hero__bajada">
            Lavado a mano, pulido, encerado y restauración de ópticas para tu auto, camioneta o moto, en{' '}
            {negocio.ciudad}. Te explicamos cada paso, sin vueltas.
          </p>

          <form className="arranque" onSubmit={alEnviar} aria-label="Empezá a pedir tu turno">
            <fieldset className="arranque__campo">
              <legend className="arranque__etiqueta">¿Qué traés?</legend>
              <div className="selector selector--3">
                {VEHICULO_TIPOS.map((tipo) => (
                  <label key={tipo} className="selector__opcion">
                    <input
                      className="selector__input"
                      type="radio"
                      name="arranque-vehiculo"
                      value={tipo}
                      checked={vehiculo === tipo}
                      onChange={() => {
                        setVehiculo(tipo);
                      }}
                    />
                    <span className="selector__texto">{ETIQUETA_VEHICULO[tipo]}</span>
                    <SubrayadoFilete className="selector__trazo" />
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="arranque__campo">
              <label className="arranque__etiqueta" htmlFor="arranque-servicio">
                ¿Qué servicio?
              </label>
              <div className="desplegable">
                <select
                  id="arranque-servicio"
                  className="entrada"
                  value={servicio}
                  onChange={(evento) => {
                    const valor = evento.target.value;
                    setServicio(esServicioId(valor) ? valor : '');
                  }}
                >
                  <option value="">Elegí un servicio</option>
                  {servicios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
                <Icono nombre="abajo" className="desplegable__icono" />
              </div>
            </div>

            <button type="submit" className="boton boton--primario boton--grande arranque__enviar">
              Reservá tu turno
              <Icono nombre="flecha" />
            </button>
          </form>

          {whatsapp && (
            <a className="hero__whatsapp enlace" href={whatsapp} target="_blank" rel="noopener noreferrer">
              <Icono nombre="whatsapp" tamano={18} />o escribinos por WhatsApp
            </a>
          )}
        </div>

        <p className="cinta">
          <span className="cinta__texto">
            {negocio.ciudad} · {negocio.pais}
          </span>
        </p>
      </div>
    </section>
  );
}
