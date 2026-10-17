import { useState } from 'react';
import { logoUrl } from '../config/enlaces';
import { sitio } from '../config/sitio';

/**
 * Logo de MgDetailing. Si en `sitio.ts` está cargado `logo` (ej.: '/logo.png'),
 * se muestra esa imagen; si está vacío —o el archivo no carga— se muestra el
 * wordmark tipográfico: "Mg" cromado y "Detailing" en letra script.
 */

interface Props {
  className?: string;
  tamano?: 'chico' | 'normal' | 'grande';
}

export function Logo({ className, tamano = 'normal' }: Props) {
  const ruta = logoUrl();
  const [fallo, setFallo] = useState(false);
  const clases = ['logo', `logo--${tamano}`, className].filter(Boolean).join(' ');

  if (ruta && !fallo) {
    return (
      <span className={clases}>
        <img
          className="logo__imagen"
          src={ruta}
          width={sitio.logoAncho || undefined}
          height={sitio.logoAlto || undefined}
          alt="MgDetailing"
          decoding="async"
          onError={() => {
            setFallo(true);
          }}
        />
      </span>
    );
  }

  return (
    <span className={clases}>
      <span className="logo__texto" role="img" aria-label="MgDetailing">
        <span className="logo__mg" aria-hidden="true">
          Mg
        </span>
        <span className="logo__script" aria-hidden="true">
          Detailing
        </span>
      </span>
    </span>
  );
}
