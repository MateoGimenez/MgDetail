import { MarcoFilete, Rombo } from '../components/Filete';
import { Icono } from '../components/Icono';
import { servicios, textoPrecio } from '../data/servicios';
import type { Servicio } from '../types';
import { useReserva } from './reserva-contexto';

function PlanchaServicio({ servicio, alReservar }: { servicio: Servicio; alReservar: () => void }) {
  const tituloId = `servicio-${servicio.id}`;
  return (
    <li className={servicio.destacado ? 'plancha plancha--destacada' : 'plancha'}>
      {servicio.destacado && <MarcoFilete tamano="chico" />}
      <article className="plancha__cuerpo" aria-labelledby={tituloId}>
        <div className="plancha__cabeza">
          <h3 id={tituloId} className="plancha__nombre">
            {servicio.nombre}
          </h3>
          {servicio.destacado && <p className="plancha__sello">El lavado más completo</p>}
          <p className="plancha__resumen">{servicio.resumen}</p>
        </div>

        <dl className="plancha__datos">
          <div className="plancha__dato">
            <dt>Duración</dt>
            <dd>{servicio.duracion}</dd>
          </div>
          <div className="plancha__dato">
            <dt>Precio</dt>
            <dd>{textoPrecio(servicio.precioDesde)}</dd>
          </div>
        </dl>

        <div className="plancha__detalle">
          <p className="plancha__descripcion">{servicio.descripcion}</p>
          <h4 className="plancha__subtitulo">Incluye</h4>
          <ul className="plancha__incluye" role="list">
            {servicio.incluye.map((item) => (
              <li key={item}>
                <Rombo />
                {item}
              </li>
            ))}
          </ul>
          {servicio.glosario && servicio.glosario.length > 0 && (
            <>
              <h4 className="plancha__subtitulo">En palabras simples</h4>
              <dl className="glosario">
                {servicio.glosario.map((t) => (
                  <div key={t.termino} className="glosario__item">
                    <dt>{t.termino}:</dt> <dd>{t.significado}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>

        <button
          type="button"
          className="boton boton--secundario plancha__accion"
          onClick={alReservar}
          aria-label={`Reservá este servicio: ${servicio.nombre}`}
        >
          Reservá este servicio
          <Icono nombre="flecha" />
        </button>
      </article>
    </li>
  );
}

export function Servicios() {
  const { reservar } = useReserva();
  return (
    <section id="servicios" className="seccion servicios" aria-labelledby="servicios-titulo">
      <div className="contenedor">
        <header className="seccion__cabecera">
          <h2 id="servicios-titulo" className="seccion__titulo">
            Qué le hacemos a tu vehículo
          </h2>
          <p className="seccion__bajada">
            Cinco servicios, explicados en criollo: para qué sirve cada uno, qué incluye y cuánto tarda. Si no sabés
            cuál te conviene, elegí el que más se parezca y lo charlamos.
          </p>
        </header>
        <ul className="servicios__lista" role="list">
          {servicios.map((servicio) => (
            <PlanchaServicio
              key={servicio.id}
              servicio={servicio}
              alReservar={() => {
                reservar({ servicioId: servicio.id });
              }}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
