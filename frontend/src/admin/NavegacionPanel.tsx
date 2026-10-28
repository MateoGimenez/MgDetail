import { useState, type CSSProperties } from 'react';
import type { Vista } from '../lib/hoy';
import { grupoDe, type GrupoClave, type GrupoVisible } from './secciones';
import './navegacion.css';

interface Props {
  grupos: readonly GrupoVisible[];
  /** La sección que se está viendo. */
  vista: Vista;
  alElegir: (vista: Vista) => void;
}

/**
 * Navegación del panel: diez secciones en tres grupos (Operación, Negocio y Ajustes).
 *
 * - Celular y pantalla mediana: una fila con los grupos y debajo las secciones del grupo abierto. El grupo de la
 *   sección actual está abierto, así que dentro de un grupo se llega a cualquier sección con un toque, y a las de
 *   otro grupo con dos (el grupo y la sección). Nada se desplaza de costado.
 * - Pantalla ancha (desde 1240 px): todas las secciones en una sola fila, separadas por grupo; los botones de grupo
 *   se esconden (el CSS los quita) y cada grupo conserva su nombre para el lector de pantalla.
 *
 * Estado activo: la sección actual lleva el filete rojo y `aria-current="page"`; el grupo que la contiene lleva una
 * marca y, para el lector de pantalla, la frase "sección actual".
 */
export function NavegacionPanel({ grupos, vista, alElegir }: Props) {
  const [abierto, setAbierto] = useState<GrupoClave>(() => grupoDe(vista));
  const [vistaAnterior, setVistaAnterior] = useState(vista);
  // Si la sección cambia (menú, un acceso de Hoy, `?vista=`), el grupo abierto la acompaña.
  if (vista !== vistaAnterior) {
    setVistaAnterior(vista);
    setAbierto(grupoDe(vista));
  }

  return (
    <nav className="panel__secciones" aria-label="Secciones del panel">
      <ul role="list" className="panel__grupos" style={{ '--grupos': grupos.length } as CSSProperties}>
        {grupos.map((grupo) => {
          const contieneLaActual = grupo.secciones.some((s) => s.clave === vista);
          const estaAbierto = abierto === grupo.clave;
          const idLista = `panel-grupo-${grupo.clave}`;
          return (
            <li
              key={grupo.clave}
              className="panel__grupo"
              data-abierto={estaAbierto ? 'true' : 'false'}
              data-actual={contieneLaActual ? 'true' : 'false'}
            >
              <button
                type="button"
                className="panel__grupo-boton"
                aria-expanded={estaAbierto}
                aria-controls={idLista}
                onClick={() => {
                  setAbierto(grupo.clave);
                }}
              >
                {grupo.etiqueta}
                {contieneLaActual && <span className="visualmente-oculto"> (incluye la sección actual)</span>}
              </button>
              <ul role="list" id={idLista} className="panel__grupo-secciones" aria-label={grupo.etiqueta}>
                {grupo.secciones.map((seccion) => (
                  <li key={seccion.clave}>
                    <button
                      type="button"
                      className={vista === seccion.clave ? 'panel__seccion activa' : 'panel__seccion'}
                      aria-current={vista === seccion.clave ? 'page' : undefined}
                      onClick={() => {
                        if (seccion.clave !== vista) alElegir(seccion.clave);
                      }}
                    >
                      {seccion.etiqueta}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
