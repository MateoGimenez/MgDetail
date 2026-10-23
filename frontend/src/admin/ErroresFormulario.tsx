import { Icono } from '../components/Icono';

/** Error de un campo, enlazado con aria-describedby desde el control. */
export function ErrorCampo({ id, mensaje }: { id: string; mensaje: string | undefined }) {
  if (!mensaje) return null;
  return (
    <p id={id} className="campo__error">
      <Icono nombre="alerta" tamano={18} />
      {mensaje}
    </p>
  );
}

/** "12 / 1000" al lado de la ayuda de un campo de texto largo; se marca cuando pasa el 90 %. */
export function Contador({ valor, max }: { valor: string; max: number }) {
  const largo = valor.trim().length;
  return (
    <span className={largo > max * 0.9 ? 'servicio-form__contador servicio-form__contador--cerca' : 'servicio-form__contador'}>
      {largo} / {max}
    </span>
  );
}

/** Error general de un formulario o diálogo (se anuncia al aparecer). */
export function ErrorGeneral({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <p className="turno__error" role="alert">
      <Icono nombre="alerta" tamano={18} />
      {mensaje}
    </p>
  );
}
