import { useState } from 'react';
import { puedeCompartirPdf } from './entregaPdf';
import { usePdf } from './usePdf';
import './documentos.css';

interface Props {
  /** Ruta del PDF sin /api. */
  ruta: string;
  version: string;
  nombreDeArchivo: string;
  /** "Presupuesto P-0007": nombra los botones para el lector de pantalla y titula la hoja de compartir. */
  queEs: string;
  alVencerSesion: (mensaje: string) => void;
  /** El botón de descargar es el principal (rojo); en una fila con más acciones puede ir secundario. */
  principal?: boolean;
}

const Descargar = () => (
  <svg className="icono" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 4v10M7.5 10.5 12 15l4.5-4.5M5 19h14" />
  </svg>
);

const Compartir = () => (
  <svg className="icono" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 15V4M8 8l4-4 4 4M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
  </svg>
);

/**
 * "Descargar" y, donde el navegador deja compartir archivos, "Compartir" (WhatsApp, Drive, correo…) de un PDF que
 * arma el backend. El estado de cada botón va en texto ("Armando el PDF…") y los errores se anuncian.
 */
export function BotonesPdf({ ruta, version, nombreDeArchivo, queEs, alVencerSesion, principal = true }: Props) {
  const [compartible] = useState(puedeCompartirPdf);
  const pdf = usePdf({ ruta, version, nombreDeArchivo, titulo: queEs, alVencerSesion });
  const ocupado = pdf.haciendo !== null;

  return (
    <div className="pdf">
      <div className="pdf__botones">
        <button
          type="button"
          className={principal ? 'boton boton--primario boton--chico' : 'boton boton--secundario boton--chico'}
          disabled={ocupado}
          aria-label={`Descargar ${queEs} en PDF`}
          onClick={() => void pdf.descargar()}
        >
          <Descargar />
          {pdf.haciendo === 'descargar' ? 'Armando el PDF…' : 'Descargar PDF'}
        </button>
        {compartible && (
          <button
            type="button"
            className="boton boton--secundario boton--chico"
            disabled={ocupado}
            aria-label={`Compartir ${queEs} en PDF`}
            onClick={() => void pdf.compartir()}
          >
            <Compartir />
            {pdf.haciendo === 'compartir' ? 'Armando el PDF…' : 'Compartir'}
          </button>
        )}
      </div>
      <p className="pdf__estado" role="status">
        {pdf.aviso}
      </p>
      {pdf.error && (
        <p className="pdf__error" role="alert">
          {pdf.error}
        </p>
      )}
    </div>
  );
}
