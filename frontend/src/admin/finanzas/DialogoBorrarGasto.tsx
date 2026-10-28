import { useState, type RefObject } from 'react';
import type { Gasto } from '../../api/finanzas';
import { Icono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import { bloquearEscape, useMontado } from '../dialogo';
import { ErrorGeneral } from '../ErroresFormulario';

interface Props {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  gasto: Gasto | null;
  /** Devuelve null si se borró, o el mensaje de error. */
  alConfirmar: (gasto: Gasto) => Promise<string | null>;
  alCerrar: () => void;
}

/** Confirmación de borrado de un gasto en un <dialog> modal: el foco arranca en "No, volver". */
export function DialogoBorrarGasto({ dialogoRef, gasto, alConfirmar, alCerrar }: Props) {
  const montado = useMontado();
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmar = async () => {
    if (!gasto) return;
    setBorrando(true);
    setError(null);
    const problema = await alConfirmar(gasto);
    if (!montado.current) return;
    setBorrando(false);
    if (problema) setError(problema);
    else dialogoRef.current?.close();
  };

  return (
    <dialog
      ref={dialogoRef}
      className="confirmar"
      aria-labelledby="borrar-gasto-titulo"
      aria-describedby="borrar-gasto-texto"
      onCancel={bloquearEscape(borrando)}
      onClose={() => {
        setError(null);
        alCerrar();
      }}
    >
      <h2 id="borrar-gasto-titulo" className="confirmar__titulo">
        ¿Borrar este gasto?
      </h2>
      <p id="borrar-gasto-texto" className="confirmar__texto">
        {gasto ? `“${gasto.descripcion}” por ${formatoPesos(gasto.monto)}. ` : ''}
        Se borra para siempre, no se puede deshacer, y la ganancia neta del mes se recalcula.
      </p>
      <ErrorGeneral mensaje={error} />
      <div className="confirmar__acciones">
        <button
          type="button"
          className="boton boton--secundario"
          disabled={borrando}
          onClick={() => {
            dialogoRef.current?.close();
          }}
        >
          No, volver
        </button>
        <button
          type="button"
          className="boton boton--peligro"
          disabled={borrando}
          onClick={() => {
            void confirmar();
          }}
        >
          <Icono nombre="papelera" tamano={18} />
          {borrando ? 'Borrando…' : 'Sí, borrar'}
        </button>
      </div>
    </dialog>
  );
}
