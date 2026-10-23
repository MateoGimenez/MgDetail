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
