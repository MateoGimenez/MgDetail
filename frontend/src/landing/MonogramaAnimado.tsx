import { useEffect, useRef, useState } from 'react';
import { marca } from '../config/sitio';

const menosMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Monograma 3D animado de la marca. Decorativo: sin controles y oculto a
 * lectores de pantalla. El video no se descarga hasta que entra en pantalla
 * (preload="none" + IntersectionObserver) y se pausa al salir. Con "menos
 * movimiento" se muestra solo el cuadro fijo.
 */
export function MonogramaAnimado() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [quieto] = useState(menosMovimiento);

  useEffect(() => {
    const video = videoRef.current;
    if (quieto || !video) return;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada?.isIntersecting) {
          if (!video.getAttribute('src')) video.src = marca.video;
          video.play().catch(() => {
            // Si el navegador no deja reproducir, queda el póster.
          });
        } else {
          video.pause();
        }
      },
      { rootMargin: '150px 0px' },
    );
    observador.observe(video);
    return () => {
      observador.disconnect();
    };
  }, [quieto]);

  if (quieto) {
    return (
      <img
        className="monograma__medio"
        src={marca.poster}
        width={marca.posterLado}
        height={marca.posterLado}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <video
      ref={videoRef}
      className="monograma__medio"
      poster={marca.poster}
      width={marca.posterLado}
      height={marca.posterLado}
      autoPlay
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
