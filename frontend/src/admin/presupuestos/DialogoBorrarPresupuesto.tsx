import { useState, type RefObject } from 'react';
import type { Presupuesto } from '../../api/presupuestos';
import { formatoPesos } from '../../lib/cobro';
import { bloquearEscape, useMontado } from '../dialogo';
import { ErrorGeneral } from '../ErroresFormulario';
import type { Problema } from '../useUsuarios';

interface Props {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  presupuesto: Presupuesto | null;
  alConfirmar: (presupuesto: Presupuesto) => Promise<Problema | null>;
  alCerrar: () => void;
}

/** Confirmación antes de borrar un presupuesto. Uno aceptado no se borra: el backend lo rechaza y se explica acá. */
export function DialogoBorrarPresupuesto({ dialogoRef, presupuesto, alConfirmar, alCerrar }: Props) {
  const montado = useMontado();
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmar = async () => {
    if (!presupuesto) return;
    setBorrando(true);
    setError(null);
    const problema = await alConfirmar(presupuesto);
    if (!montado.current) return;
    setBorrando(false);
    if (!problema) {
      dialogoRef.current?.close();
      return;
    }
    setError(problema.mensaje);
  };

  return (
    <dialog
      ref={dialogoRef}
      className="confirmar"
      aria-labelledby="borrar-presupuesto-titulo"
      onCancel={bloquearEscape(borrando)}
      onClose={() => {
        setError(null);
        alCerrar();
      }}
    >
      {presupuesto && (
        <>
          <h2 id="borrar-presupuesto-titulo" className="confirmar__titulo">
            ¿Borrar {presupuesto.codigo}?
          </h2>
          <p className="confirmar__texto">
            Presupuesto de {presupuesto.clienteNombre} por {formatoPesos(presupuesto.total)}. Se borra para siempre y no se puede recuperar.
            {presupuesto.estado === 'aceptado' && ' Está aceptado: si ya no vale, mejor pasalo a Rechazado.'}
          </p>
          <ErrorGeneral mensaje={error} />
          <div className="confirmar__acciones">
            <button
              type="button"
              className="boton boton--secundario"
              disabled={borrando}
              onClick={() => dialogoRef.current?.close()}
            >
              Mejor no
            </button>
            <button type="button" className="boton boton--peligro" disabled={borrando} onClick={() => void confirmar()}>
              {borrando ? 'Borrando…' : 'Sí, borrar'}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
