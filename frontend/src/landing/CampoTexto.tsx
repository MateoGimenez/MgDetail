import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { Icono } from '../components/Icono';

export function ErrorDeCampo({ id, mensaje }: { id: string; mensaje: string | undefined }) {
  if (!mensaje) return null;
  return (
    <p id={id} className="campo__error">
      <Icono nombre="alerta" tamano={18} />
      {mensaje}
    </p>
  );
}

type Propios = 'id' | 'name' | 'className' | 'aria-invalid' | 'aria-describedby';

interface Comunes {
  /** id del control; la ayuda y el error usan `${id}-ayuda` y `${id}-error`. */
  id: string;
  name: string;
  etiqueta: ReactNode;
  opcional?: boolean;
  ayuda?: ReactNode;
  error?: string;
  className?: string;
}

type Props = Comunes &
  (
    | { entrada: Omit<InputHTMLAttributes<HTMLInputElement>, Propios>; texto?: never }
    | { texto: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, Propios>; entrada?: never }
  );

/** Etiqueta + control + ayuda + error, con aria-invalid y aria-describedby resueltos. */
export function CampoTexto({ id, name, etiqueta, opcional, ayuda, error, className, entrada, texto }: Props) {
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describe = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') || undefined;
  const aria = { id, name, 'aria-invalid': error ? true : undefined, 'aria-describedby': describe };

  return (
    <div className={className ? `campo ${className}` : 'campo'}>
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
        {opcional && <span className="campo__opcional"> (opcional)</span>}
      </label>
      {texto ? <textarea className="entrada" {...texto} {...aria} /> : <input className="entrada" {...entrada} {...aria} />}
      {ayuda && (
        <p id={idAyuda} className="campo__ayuda">
          {ayuda}
        </p>
      )}
      <ErrorDeCampo id={idError} mensaje={error} />
    </div>
  );
}
