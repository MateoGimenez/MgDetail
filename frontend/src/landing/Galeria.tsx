import { useRef, useState } from 'react';
import { Icono } from '../components/Icono';
import type { FotoGaleria } from '../types';

/** Grilla de fotos reales con un visor en <dialog> (Escape cierra, flechas recorren). */
export function Galeria({ fotos }: { fotos: readonly FotoGaleria[] }) {
  const visorRef = useRef<HTMLDialogElement>(null);
  const [indice, setIndice] = useState(0);
  const actual = fotos[indice];

  const abrir = (posicion: number) => {
    setIndice(posicion);
    visorRef.current?.showModal();
  };

  const mover = (paso: number) => {
    setIndice((i) => (i + paso + fotos.length) % fotos.length);
  };

  return (
    <>
      <ul className="galeria" role="list">
        {fotos.map((foto, posicion) => (
          <li key={foto.src} className="galeria__item">
            <figure>
              <button
                type="button"
                className="galeria__boton"
                onClick={() => {
                  abrir(posicion);
                }}
              >
                <img src={foto.src} alt={foto.alt} loading="lazy" decoding="async" />
                <span className="visualmente-oculto">Ver más grande</span>
              </button>
              {foto.titulo && <figcaption className="galeria__pie">{foto.titulo}</figcaption>}
            </figure>
          </li>
        ))}
      </ul>

      <dialog
        ref={visorRef}
        className="visor"
        aria-label="Foto ampliada"
        onKeyDown={(evento) => {
          if (fotos.length < 2) return;
          if (evento.key === 'ArrowRight') mover(1);
          if (evento.key === 'ArrowLeft') mover(-1);
        }}
      >
        {actual && (
          <figure className="visor__figura">
            <img className="visor__foto" src={actual.src} alt={actual.alt} />
            {actual.titulo && <figcaption className="visor__pie">{actual.titulo}</figcaption>}
          </figure>
        )}
        <div className="visor__controles">
          {fotos.length > 1 && (
            <>
              <button
                type="button"
                className="boton boton--secundario"
                onClick={() => {
                  mover(-1);
                }}
              >
                Anterior
              </button>
              <button
                type="button"
                className="boton boton--secundario"
                onClick={() => {
                  mover(1);
                }}
              >
                Siguiente
              </button>
            </>
          )}
          <button
            type="button"
            className="boton boton--primario"
            onClick={() => {
              visorRef.current?.close();
            }}
          >
            <Icono nombre="cerrar" tamano={18} />
            Cerrar
          </button>
        </div>
      </dialog>
    </>
  );
}
