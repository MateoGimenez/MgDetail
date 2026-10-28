import { useCallback, useRef, useState } from 'react';
import { Icono } from '../components/Icono';
import { esVertical } from '../lib/fotos';
import type { FotoGaleria } from '../types';

/**
 * Una foto con sus versiones WebP (`srcset`) y el JPG de respaldo. Con `ancho` y `alto` reserva su lugar (la página
 * no salta al cargar). Mientras baja se ve transparente y aparece con un fundido corto (efectos.css; sin esa regla,
 * con movimiento reducido, se ve normal y sin esperar).
 */
function Imagen({ foto, sizes, className }: { foto: FotoGaleria; sizes: string; className?: string }) {
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (!img || img.complete) return;
    img.dataset.carga = 'pendiente';
    const lista = () => {
      img.dataset.carga = 'lista';
    };
    img.addEventListener('load', lista, { once: true });
    img.addEventListener('error', lista, { once: true });
    return () => {
      img.removeEventListener('load', lista);
      img.removeEventListener('error', lista);
    };
  }, []);

  const imagen = (
    <img
      ref={ref}
      className={className}
      src={foto.src}
      alt={foto.alt}
      width={foto.ancho}
      height={foto.alto}
      loading="lazy"
      decoding="async"
    />
  );
  return foto.srcset ? (
    <picture>
      <source type="image/webp" srcSet={foto.srcset} sizes={sizes} />
      {imagen}
    </picture>
  ) : (
    imagen
  );
}

/**
 * Grilla de fotos reales con un visor en <dialog> (Escape cierra, flechas recorren). Cada foto conserva su formato:
 * las verticales (4:5) se ven como vienen y las horizontales (4:3) también; las filas incompletas quedan centradas,
 * así 3 fotos o 5 se ven bien. El visor las muestra enteras, sin recortar.
 */
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
          <li key={foto.src} className="galeria__item" data-formato={esVertical(foto) ? 'vertical' : 'horizontal'}>
            <figure>
              <button
                type="button"
                className="galeria__boton"
                onClick={() => {
                  abrir(posicion);
                }}
              >
                <Imagen foto={foto} sizes="(min-width: 1060px) 280px, (min-width: 700px) 30vw, 46vw" />
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
            <Imagen key={actual.src} foto={actual} sizes="100vw" className="visor__foto" />
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
