import { MarcoFilete, Rombo } from '../components/Filete';
import { Icono } from '../components/Icono';
import { textoPrecio } from '../data/servicios';
import type { Servicio } from '../types';
import { useCatalogo } from './catalogo-contexto';
import { useReserva } from './reserva-contexto';
import { SinTurnosOnline } from './SinTurnosOnline';

const CANTIDADES = ['Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez'];

/** La bajada cuenta los servicios que hay en el catálogo: "Cinco servicios, explicados…", "12 servicios, …". */
function bajada(n: number): string {
  const cierre = 'Si no sabés cuál te conviene, elegí el que más se parezca y lo charlamos.';
  if (n === 1) return 'Un servicio, explicado en criollo: para qué sirve, qué incluye y cuánto tarda. Si tenés dudas, lo charlamos.';
  return `${CANTIDADES[n - 2] ?? String(n)} servicios, explicados en criollo: para qué sirve cada uno, qué incluye y cuánto tarda. ${cierre}`;
}

function PlanchaServicio({
  servicio,
  precioCargando,
  alReservar,
}: {
  servicio: Servicio;
  /** El catálogo todavía no llegó: el precio espera en su lugar (sin mostrar "Consultá" de más). */
  precioCargando: boolean;
  alReservar: () => void;
}) {
  const tituloId = `servicio-${servicio.id}`;
  return (
    <li className={servicio.destacado ? 'plancha plancha--destacada' : 'plancha'}>
      {servicio.destacado && <MarcoFilete tamano="chico" />}
      <article className="plancha__cuerpo" aria-labelledby={tituloId}>
        <div className="plancha__cabeza">
          <h3 id={tituloId} className="plancha__nombre">
            {servicio.nombre}
          </h3>
          {servicio.destacado && <p className="plancha__sello">Recomendado por el taller</p>}
          <p className="plancha__resumen">{servicio.resumen}</p>
        </div>

        <dl className="plancha__datos">
          <div className="plancha__dato">
            <dt>Duración</dt>
            <dd>{servicio.duracion ?? 'A confirmar'}</dd>
          </div>
          <div className="plancha__dato">
            <dt>Precio</dt>
            <dd aria-busy={precioCargando || undefined}>
              {precioCargando ? (
                <span className="plancha__precio-cargando">
                  <span className="visualmente-oculto">Cargando precio</span>
                </span>
              ) : (
                textoPrecio(servicio.precioDesde)
              )}
            </dd>
          </div>
        </dl>

        <div className="plancha__detalle">
          <p className="plancha__descripcion">{servicio.descripcion}</p>
          {servicio.incluye.length > 0 && (
            <>
              <h4 className="plancha__subtitulo">Incluye</h4>
              <ul className="plancha__incluye" role="list">
                {servicio.incluye.map((item, i) => (
                  <li key={`${String(i)}-${item}`}>
                    <Rombo />
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}
          {servicio.glosario.length > 0 && (
            <>
              <h4 className="plancha__subtitulo">En palabras simples</h4>
              <dl className="glosario">
                {servicio.glosario.map((t, i) => (
                  <div key={`${String(i)}-${t.termino}`} className="glosario__item">
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
  const { servicios, estado } = useCatalogo();
  return (
    <section id="servicios" className="seccion servicios" aria-labelledby="servicios-titulo">
      <div className="contenedor">
        <header className="seccion__cabecera">
          <h2 id="servicios-titulo" className="seccion__titulo">
            Qué le hacemos a tu vehículo
          </h2>
          {estado !== 'vacio' && <p className="seccion__bajada">{bajada(servicios.length)}</p>}
        </header>
        {estado === 'vacio' ? (
          <SinTurnosOnline />
        ) : (
          <ul className="servicios__lista" role="list">
            {servicios.map((servicio) => (
              <PlanchaServicio
                key={servicio.id}
                servicio={servicio}
                precioCargando={estado === 'cargando'}
                alReservar={() => {
                  reservar({ servicioId: servicio.id });
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
