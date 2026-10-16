import { useState, type RefObject } from 'react';
import type { Turno } from '../api/contract';
import { Icono } from '../components/Icono';

interface Props {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  turno: Turno | null;
  /** Devuelve null si se eliminó (o ya se resolvió), o el mensaje de error. */
  alConfirmar: (turno: Turno) => Promise<string | null>;
  alCerrar: () => void;
}

/** Confirmación de borrado en un <dialog> modal: el foco arranca en "No, volver". */
export function DialogoEliminar({ dialogoRef, turno, alConfirmar, alCerrar }: Props) {
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmar = async () => {
    if (!turno) return;
    setEliminando(true);
    setError(null);
    const problema = await alConfirmar(turno);
    setEliminando(false);
    if (problema) setError(problema);
    else dialogoRef.current?.close();
  };

  return (
    <dialog
      ref={dialogoRef}
      className="confirmar"
      aria-labelledby="confirmar-titulo"
      aria-describedby="confirmar-texto"
      onClose={() => {
        setError(null);
        alCerrar();
      }}
    >
      <h2 id="confirmar-titulo" className="confirmar__titulo">
        ¿Eliminar la solicitud{turno ? ` de ${turno.nombre}` : ''}?
      </h2>
      <p id="confirmar-texto" className="confirmar__texto">
        Se borra para siempre y no se puede deshacer. Si solo querés sacarla de las pendientes, mejor cancelala.
      </p>
      {error && (
        <p className="turno__error" role="alert">
          <Icono nombre="alerta" tamano={18} />
          {error}
        </p>
      )}
      <div className="confirmar__acciones">
        <button
          type="button"
          className="boton boton--secundario"
          onClick={() => {
            dialogoRef.current?.close();
          }}
        >
          No, volver
        </button>
        <button
          type="button"
          className="boton boton--peligro"
          disabled={eliminando}
          onClick={() => {
            void confirmar();
          }}
        >
          <Icono nombre="papelera" tamano={18} />
          {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
        </button>
      </div>
    </dialog>
  );
}
