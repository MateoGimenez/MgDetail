import { useId, useState, type ReactNode } from 'react';
import { Rombo } from '../components/Filete';
import { Icono } from '../components/Icono';
import { textoPrecio } from '../data/servicios';
import type { Servicio } from '../types';
import { revelar } from './useRevelar';

/** Cuántas cosas de "Incluye" se ven sin desplegar. */
const VISTA_PREVIA = 3;

/**
 * Contenido que se pliega sin desmontarse: la grilla pasa de 0fr a 1fr (servicios.css) y mientras está cerrado
 * queda `inert` (fuera del foco y de los lectores de pantalla).
 */
function Plegable({ id, abierto, children }: { id?: string; abierto: boolean; children: ReactNode }) {
  return (
    <div id={id} className="plegable" data-abierto={abierto}>
      <div className="plegable__interior" inert={!abierto}>
        {children}
      </div>
    </div>
  );
}

function ListaIncluye({ items, etiqueta }: { items: readonly string[]; etiqueta?: string }) {
  return (
    <ul className="tarjeta__incluye" role="list" aria-label={etiqueta}>
      {items.map((item, i) => (
        <li key={`${String(i)}-${item}`}>
          <Rombo />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function TarjetaServicio({
  servicio,
  precioCargando,
  alReservar,
}: {
  servicio: Servicio;
  /** El catálogo todavía no llegó: el precio espera en su lugar (sin mostrar "Consultá" de más). */
  precioCargando: boolean;
  alReservar: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const id = useId();
  const tituloId = `${id}-titulo`;
  const detalleId = `${id}-detalle`;
  const hayMas = servicio.incluye.length > VISTA_PREVIA;

  return (
    <li ref={revelar} className="tarjetas__celda revelar revelar--tarjeta">
      <article
        className={servicio.destacado ? 'tarjeta tarjeta--destacada' : 'tarjeta'}
        data-abierta={abierta}
        aria-labelledby={tituloId}
      >
        <div className="tarjeta__cabeza">
          {servicio.destacado && <p className="tarjeta__sello">Recomendado por el taller</p>}
          <h3 id={tituloId} className="tarjeta__nombre">
            {servicio.nombre}
          </h3>
          <p className="tarjeta__resumen">{servicio.resumen}</p>
        </div>

        <dl className="tarjeta__datos">
          <div className="tarjeta__dato">
            <dt>Precio</dt>
            <dd aria-busy={precioCargando || undefined}>
              {precioCargando ? (
                <span className="tarjeta__precio-cargando">
                  <span className="visualmente-oculto">Cargando precio</span>
                </span>
              ) : (
                textoPrecio(servicio.precioDesde)
              )}
            </dd>
          </div>
          <div className="tarjeta__dato">
            <dt>Duración</dt>
            <dd>{servicio.duracion ?? 'A confirmar'}</dd>
          </div>
        </dl>

        {servicio.incluye.length > 0 && (
          <Plegable abierto={!(hayMas && abierta)}>
            <ListaIncluye items={servicio.incluye.slice(0, VISTA_PREVIA)} etiqueta="Incluye" />
          </Plegable>
        )}

        <Plegable id={detalleId} abierto={abierta}>
          <div className="tarjeta__detalle">
            <p className="tarjeta__descripcion">{servicio.descripcion}</p>
            {hayMas && (
              <>
                <h4 className="tarjeta__subtitulo">Incluye</h4>
                <ListaIncluye items={servicio.incluye} />
              </>
            )}
            {servicio.glosario.length > 0 && (
              <>
                <h4 className="tarjeta__subtitulo">En palabras simples</h4>
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
        </Plegable>

        <div className="tarjeta__acciones">
          <button
            type="button"
            className="boton boton--fantasma boton--chico tarjeta__ver"
            aria-expanded={abierta}
            aria-controls={detalleId}
            onClick={() => {
              setAbierta((estaba) => !estaba);
            }}
          >
            {abierta ? 'Ocultar detalle' : 'Ver qué incluye'}
            <Icono nombre="abajo" tamano={18} className="tarjeta__chevron" />
          </button>
          <button
            type="button"
            className={servicio.destacado ? 'boton boton--primario' : 'boton boton--secundario'}
            onClick={alReservar}
            aria-label={`Reservá este servicio: ${servicio.nombre}`}
          >
            Reservá este servicio
            <Icono nombre="flecha" />
          </button>
        </div>
      </article>
    </li>
  );
}
