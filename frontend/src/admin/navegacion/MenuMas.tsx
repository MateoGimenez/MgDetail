import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Vista } from '../../lib/hoy';
import { Icono } from '../../components/Icono';
import { estaEnGrupos, indiceConTecla, type GrupoVisible } from '../secciones';

interface Props {
  grupos: readonly GrupoVisible[];
  vista: Vista;
  alElegir: (vista: Vista) => void;
}

/**
 * «Más» de la fila de secciones (pantalla ancha): un botón que despliega un panel con las secciones agrupadas.
 * Patrón de disclosure: Tab recorre las opciones; las flechas, Inicio y Fin también; Escape o un toque afuera lo
 * cierran (Escape devuelve el foco al botón). El botón se marca activo si la sección actual está adentro.
 */
export function MenuMas({ grupos, vista, alElegir }: Props) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const idPanel = useId();
  const actual = grupos.flatMap((g) => g.secciones).find((s) => s.clave === vista);

  useEffect(() => {
    if (!abierto) return;
    const afuera = (evento: PointerEvent) => {
      if (evento.target instanceof Node && !raiz.current?.contains(evento.target)) setAbierto(false);
    };
    document.addEventListener('pointerdown', afuera);
    return () => {
      document.removeEventListener('pointerdown', afuera);
    };
  }, [abierto]);

  if (grupos.length === 0) return null;

  const opciones = () => Array.from(raiz.current?.querySelectorAll<HTMLButtonElement>('.menu-mas__opcion') ?? []);

  const alTeclear = (evento: KeyboardEvent<HTMLDivElement>) => {
    if (evento.key === 'Escape' && abierto) {
      evento.preventDefault();
      evento.stopPropagation();
      setAbierto(false);
      boton.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(evento.key)) return;
    const lista = opciones();
    if (lista.length === 0) return;
    evento.preventDefault();
    if (!abierto) {
      setAbierto(true);
      return;
    }
    const enFoco = lista.findIndex((o) => o === document.activeElement);
    // Desde el botón, la flecha hacia abajo entra por la primera opción y hacia arriba por la última.
    const base = enFoco === -1 ? (evento.key === 'ArrowUp' ? 0 : -1) : enFoco;
    lista[indiceConTecla(base, lista.length, evento.key)]?.focus();
  };

  return (
    // El onKeyDown del contenedor solo atiende teclas que ya llegan desde los botones de adentro.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={raiz}
      className="menu-mas"
      onKeyDown={alTeclear}
      onBlur={(evento) => {
        // El foco salió del menú (Tab hacia otro lado): se cierra solo.
        if (abierto && evento.relatedTarget instanceof Node && !raiz.current?.contains(evento.relatedTarget)) {
          setAbierto(false);
        }
      }}
    >
      <button
        ref={boton}
        type="button"
        className={actual ? 'panel__seccion menu-mas__boton activa' : 'panel__seccion menu-mas__boton'}
        aria-expanded={abierto}
        aria-controls={idPanel}
        data-en-grupo={estaEnGrupos(grupos, vista) || undefined}
        onClick={() => {
          setAbierto((a) => !a);
        }}
      >
        Más
        <Icono nombre="abajo" tamano={16} />
        {actual && <span className="visualmente-oculto"> (sección actual: {actual.etiqueta})</span>}
      </button>
      <div id={idPanel} className="menu-mas__panel" hidden={!abierto}>
        {grupos.map((g) => (
          <section key={g.clave} className="menu-mas__grupo" aria-labelledby={`${idPanel}-${g.clave}`}>
            <h2 id={`${idPanel}-${g.clave}`} className="menu-mas__titulo">
              {g.titulo}
            </h2>
            <ul role="list">
              {g.secciones.map((s) => (
                <li key={s.clave}>
                  <button
                    type="button"
                    className="menu-mas__opcion"
                    aria-current={vista === s.clave ? 'page' : undefined}
                    onClick={() => {
                      setAbierto(false);
                      if (s.clave !== vista) alElegir(s.clave);
                    }}
                  >
                    {s.etiqueta}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
