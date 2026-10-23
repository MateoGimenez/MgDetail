import { useId, useRef, useState, type FormEvent } from 'react';
import { NOTA_MAXIMO, type CambiosTurno } from '../api/contract';
import { Icono } from '../components/Icono';
import { validarNota } from '../lib/notas';
import { useMontado } from './dialogo';
import { Contador, ErrorCampo } from './ErroresFormulario';
import type { Problema } from './useUsuarios';

interface Props {
  nota: string | null;
  /** Mientras la tarjeta manda otro cambio, el botón espera. */
  ocupada: boolean;
  /** Manda el cambio; null si salió bien o el problema (el mensaje general lo muestra la tarjeta). */
  alGuardar: (cambios: CambiosTurno) => Promise<Problema | null>;
}

/**
 * Nota interna del turno, dentro de la misma tarjeta: se ve si hay, y "Agregar nota" / "Editar nota" la abre en un
 * campo con contador, Guardar y Cancelar. La usa cualquier rol, en cualquier estado. El cliente nunca la ve.
 */
export function NotaInterna({ nota, ocupada, alGuardar }: Props) {
  const id = useId();
  const montado = useMontado();
  const cajaRef = useRef<HTMLDivElement>(null);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  const enfocar = (selector: string) => {
    requestAnimationFrame(() => {
      cajaRef.current?.querySelector<HTMLElement>(selector)?.focus();
    });
  };

  const abrir = () => {
    setTexto(nota ?? '');
    setError(undefined);
    setEditando(true);
    requestAnimationFrame(() => {
      const campo = cajaRef.current?.querySelector('textarea');
      if (!campo) return;
      campo.focus();
      // El cursor al final, para seguir escribiendo.
      campo.setSelectionRange(campo.value.length, campo.value.length);
    });
  };

  const cerrar = () => {
    setEditando(false);
    setError(undefined);
    enfocar('[data-abre="nota"]');
  };

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const resultado = validarNota(texto);
    if ('error' in resultado) {
      setError(resultado.error);
      enfocar('textarea');
      return;
    }
    if (resultado.valor === nota) {
      cerrar();
      return;
    }
    setEnviando(true);
    setError(undefined);
    const problema = await alGuardar({ notasInternas: resultado.valor });
    if (!montado.current) return;
    setEnviando(false);
    if (!problema) {
      cerrar();
      return;
    }
    if (problema.campos?.notasInternas) {
      setError(problema.campos.notasInternas);
      enfocar('textarea');
    }
  };

  return (
    <div ref={cajaRef} className={nota || editando ? 'nota' : 'nota nota--vacia'}>
      {editando ? (
        <form className="nota__form" noValidate onSubmit={(e) => void guardar(e)}>
          <label className="nota__titulo" htmlFor={`${id}-campo`}>
            Nota interna
          </label>
          <textarea
            id={`${id}-campo`}
            className="entrada nota__campo"
            rows={3}
            maxLength={NOTA_MAXIMO}
            value={texto}
            disabled={enviando}
            aria-invalid={error ? true : undefined}
            aria-describedby={[`${id}-ayuda`, error ? `${id}-error` : null].filter(Boolean).join(' ')}
            onChange={(evento) => {
              setTexto(evento.target.value);
            }}
          />
          <p id={`${id}-ayuda`} className="campo__ayuda servicio-form__ayuda-fila">
            <span>El cliente no la ve. Por ejemplo: “rayón en la puerta trasera” o “cobrado”.</span>
            <Contador valor={texto} max={NOTA_MAXIMO} />
          </p>
          <ErrorCampo id={`${id}-error`} mensaje={error} />
          <div className="nota__acciones">
            <button type="submit" className="boton boton--primario boton--chico" disabled={enviando}>
              <Icono nombre="check" tamano={18} />
              {enviando ? 'Guardando…' : 'Guardar nota'}
            </button>
            <button type="button" className="boton boton--fantasma boton--chico" disabled={enviando} onClick={cerrar}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="nota__cabeza">
            <p className="nota__titulo" id={`${id}-titulo`}>
              Nota interna
              <span className="nota__privada">El cliente no la ve</span>
            </p>
            <button
              type="button"
              className="boton boton--fantasma boton--chico nota__boton"
              disabled={ocupada}
              data-abre="nota"
              aria-describedby={`${id}-titulo`}
              onClick={abrir}
            >
              <Icono nombre={nota ? 'lapiz' : 'mas'} tamano={18} />
              {nota ? 'Editar nota' : 'Agregar nota'}
            </button>
          </div>
          {nota && <p className="nota__texto">{nota}</p>}
        </>
      )}
    </div>
  );
}
