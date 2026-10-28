import { useEffect, useRef, type ReactNode } from 'react';
import { Icono } from '../../components/Icono';

interface Props {
  abierta: boolean;
  alCerrar: () => void;
  /** Id del título (lo usa `aria-labelledby`). */
  idTitulo: string;
  titulo: string;
  /** 'perfil' se ancla arriba a la derecha en pantallas medianas y anchas; 'menu' queda siempre abajo. */
  variante: 'perfil' | 'menu';
  /** Contenido de la cabecera (reemplaza al título visible; el título sigue siendo el nombre accesible). */
  cabecera?: ReactNode;
  children: ReactNode;
}

/**
 * Hoja: un <dialog> modal que sube desde abajo en el celular (y cuelga del encabezado en pantallas anchas).
 * Escape y el toque en el fondo la cierran; el foco vuelve solo al botón que la abrió. El contenido queda montado
 * aunque esté cerrada (algunas partes, como los avisos, tienen que arrancar con el panel).
 */
export function Hoja({ abierta, alCerrar, idTitulo, titulo, variante, cabecera, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (abierta && !dialogo.open) dialogo.showModal();
    if (!abierta && dialogo.open) dialogo.close();
  }, [abierta]);

  return (
    // Escape y el botón Cerrar ya cierran la hoja con teclado; el toque en el fondo es solo un atajo para el dedo.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className={`hoja hoja--${variante}`}
      aria-labelledby={idTitulo}
      onClose={alCerrar}
      onClick={(evento) => {
        // Un toque en el fondo (el <dialog> mismo, no su contenido) cierra la hoja.
        if (evento.target === evento.currentTarget) ref.current?.close();
      }}
    >
      <div className="hoja__interior">
        <div className="hoja__cabecera">
          {cabecera ?? (
            <h2 id={idTitulo} className="hoja__titulo">
              {titulo}
            </h2>
          )}
          <button
            type="button"
            className="boton boton--fantasma hoja__cerrar"
            aria-label="Cerrar"
            onClick={() => {
              ref.current?.close();
            }}
          >
            <Icono nombre="cerrar" tamano={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
