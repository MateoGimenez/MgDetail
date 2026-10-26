import type { ReactNode } from 'react';

/**
 * Esqueletos de carga del panel. Ocupan el mismo lugar que el contenido real (mismos contenedores, mismas alturas
 * mínimas) para que al llegar los datos nada salte. Son decorativos (`aria-hidden`): el "Cargando…" de cada vista
 * ya lo anuncia la región en vivo. El brillo corre solo sin `prefers-reduced-motion` (admin.css).
 */

type Largo = 'xs' | 's' | 'm' | 'l' | 'completo';

function Barra({ largo = 'l', tipo }: { largo?: Largo; tipo?: 'titulo' | 'boton' | 'sello' }) {
  return <span className={['esq', `esq--${largo}`, tipo ? `esq--${tipo}` : ''].filter(Boolean).join(' ')} />;
}

function Tarjeta({ children, clase = '' }: { children: ReactNode; clase?: string }) {
  return <li className={`turno esq-tarjeta ${clase}`.trim()}>{children}</li>;
}

/** Filas del catálogo: el puesto a la izquierda y nombre, datos y acciones a la derecha. */
export function EsqueletoServicios({ cantidad = 3 }: { cantidad?: number }) {
  return (
    <ul className="turnos" aria-hidden="true">
      {Array.from({ length: cantidad }, (_, n) => (
        <Tarjeta key={n} clase="servicio esq-servicio">
          <span className="esq esq--puesto" />
          <div className="esq-bloque">
            <Barra largo="m" tipo="titulo" />
            <Barra largo="l" />
            <Barra largo="s" />
            <div className="esq-fila">
              <Barra largo="xs" tipo="boton" />
              <Barra largo="xs" tipo="boton" />
            </div>
          </div>
        </Tarjeta>
      ))}
    </ul>
  );
}

/** Filas de usuarios: nombre y sello, email y fecha, y el cambio de rol. */
export function EsqueletoUsuarios({ cantidad = 3 }: { cantidad?: number }) {
  return (
    <div className="turnos usuarios__grupo" aria-hidden="true">
      {Array.from({ length: cantidad }, (_, n) => (
        <div key={n} className="turno esq-tarjeta esq-usuario">
          <div className="esq-fila esq-fila--entre">
            <Barra largo="m" tipo="titulo" />
            <Barra largo="xs" tipo="sello" />
          </div>
          <Barra largo="l" />
          <div className="esq-fila">
            <Barra largo="s" tipo="boton" />
            <Barra largo="xs" tipo="boton" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Agenda: en el celular la tira de siete días y el día elegido con Mañana y Tarde; desde 900 px la grilla de
 * 7 × 2. Usa las mismas clases que la agenda real para mostrar solo la que corresponde.
 */
export function EsqueletoAgenda() {
  return (
    <div aria-hidden="true">
      <div className="agenda__celular">
        <div className="esq-tira">
          {Array.from({ length: 7 }, (_, n) => (
            <span key={n} className="esq esq--dia" />
          ))}
        </div>
        <div className="esq-dia">
          <Barra largo="m" tipo="titulo" />
          {[0, 1].map((n) => (
            <div key={n} className="esq-franja">
              <Barra largo="s" />
              <Barra largo="completo" tipo="titulo" />
            </div>
          ))}
        </div>
      </div>
      <div className="agenda__ancha">
        <div className="esq-grilla">
          <span className="esq-grilla__esquina" />
          {Array.from({ length: 7 }, (_, n) => (
            <span key={n} className="esq-grilla__dia">
              <Barra largo="m" />
            </span>
          ))}
          {[0, 1].map((fila) => (
            <div key={fila} className="esq-grilla__fila">
              <span className="esq-grilla__franja">
                <Barra largo="s" />
              </span>
              {Array.from({ length: 7 }, (_, n) => (
                <span key={n} className="esq-grilla__celda">
                  {(n + fila) % 3 === 0 && <Barra largo="completo" tipo="boton" />}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Calendario del mes (seis semanas) y, en pantalla ancha, el panel del día al costado. */
export function EsqueletoCalendario({ ancha }: { ancha: boolean }) {
  return (
    <div className={ancha ? 'esq-calendario esq-calendario--ancho' : 'esq-calendario'} aria-hidden="true">
      <div className="esq-mes">
        <div className="esq-fila esq-fila--entre">
          <Barra largo="m" tipo="boton" />
          <Barra largo="s" tipo="boton" />
        </div>
        <div className="esq-cal">
          {Array.from({ length: 42 }, (_, n) => (
            <span key={n} className="esq esq--celda" />
          ))}
        </div>
      </div>
      {ancha && (
        <div className="esq-detalle">
          <Barra largo="m" tipo="titulo" />
          <Barra largo="s" />
          <span className="esq esq--bloque" />
          <span className="esq esq--bloque" />
          <Barra largo="completo" tipo="boton" />
        </div>
      )}
    </div>
  );
}

/** Pantalla Hoy: saludo, pendientes, las dos franjas de hoy y mañana. Mismos contenedores que `VistaHoy`. */
export function EsqueletoHoy() {
  return (
    <div className="hoy__cuerpo" aria-hidden="true">
      <div className="hoy__tarjeta esq-hoy-pendientes">
        <Barra largo="s" />
        <span className="esq esq--numero" />
        <Barra largo="l" tipo="boton" />
      </div>
      <div className="hoy__tarjeta esq-hoy-dia">
        <Barra largo="m" tipo="titulo" />
        {[0, 1].map((n) => (
          <div key={n} className="esq-franja">
            <Barra largo="s" />
            <Barra largo="completo" tipo="titulo" />
          </div>
        ))}
      </div>
      <div className="hoy__tarjeta esq-hoy-manana">
        <Barra largo="s" />
        <Barra largo="m" tipo="titulo" />
      </div>
    </div>
  );
}
