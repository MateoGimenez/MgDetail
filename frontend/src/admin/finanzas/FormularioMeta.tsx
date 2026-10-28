import { useId, useRef, useState, type FormEvent } from 'react';
import type { ObjetivosDeMeta } from '../../api/finanzas';
import { Icono } from '../../components/Icono';
import { campoDeObjetivo, etiquetaDelMes, validarMeta, type ErroresMeta } from '../../lib/finanzas';
import { ErrorCampo, ErrorGeneral } from '../ErroresFormulario';
import type { Problema } from '../useUsuarios';
import { useMontado } from '../dialogo';

interface Props {
  mes: string;
  hoy: string;
  /** Lo que ya hay fijado para ese mes (null si no hay meta). */
  inicial: ObjetivosDeMeta | null;
  alGuardar: (objetivos: ObjetivosDeMeta) => Promise<Problema | null>;
  alCancelar: () => void;
}

/**
 * Fijar o cambiar la meta de un mes: lo que querés facturar y/o cuántos trabajos querés hacer (con uno alcanza).
 * Va dentro de la misma tarjeta. Los errores del backend (`fields.ingresosObjetivo`, `fields.trabajosObjetivo`) van
 * en su campo.
 */
export function FormularioMeta({ mes, hoy, inicial, alGuardar, alCancelar }: Props) {
  const id = useId();
  const montado = useMontado();
  const formRef = useRef<HTMLFormElement>(null);
  const [ingresos, setIngresos] = useState(campoDeObjetivo(inicial?.ingresosObjetivo ?? null));
  const [trabajos, setTrabajos] = useState(campoDeObjetivo(inicial?.trabajosObjetivo ?? null));
  const [errores, setErrores] = useState<ErroresMeta>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const describir = (nombre: 'ingresosObjetivo' | 'trabajosObjetivo', ayuda: string) => ({
    id: `${id}-${nombre}`,
    'aria-invalid': errores[nombre] ? true : undefined,
    'aria-describedby': [ayuda, errores[nombre] ? `${id}-${nombre}-error` : null].filter(Boolean).join(' '),
  });
  const enfocarElPrimerError = () => {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  };

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setError(null);
    const validacion = validarMeta(ingresos, trabajos, mes, hoy);
    if (!validacion.ok) {
      setErrores(validacion.errores);
      setError(validacion.errores.general ?? validacion.errores.mes ?? 'Revisá los campos marcados.');
      enfocarElPrimerError();
      return;
    }
    setErrores({});
    setEnviando(true);
    const problema = await alGuardar(validacion.datos);
    if (!montado.current) return;
    setEnviando(false);
    if (!problema) return;
    setErrores(problema.campos ?? {});
    setError(problema.mensaje);
    if (problema.campos) enfocarElPrimerError();
  };

  return (
    <form ref={formRef} className="meta-form" noValidate onSubmit={(evento) => void enviar(evento)}>
      <h3 className="meta-form__titulo">
        {inicial ? 'Cambiar' : 'Fijar'} la meta de {etiquetaDelMes(mes)}
      </h3>
      <p className="campo__ayuda">Alcanza con uno de los dos objetivos. Dejá vacío el que no quieras usar.</p>

      <fieldset className="meta-form__campos" disabled={enviando}>
        <div className="campo">
          <label className="campo__etiqueta" htmlFor={`${id}-ingresosObjetivo`}>
            Cuánto querés facturar
          </label>
          <div className="servicio-form__precio">
            <span aria-hidden="true">$</span>
            <input
              {...describir('ingresosObjetivo', `${id}-ingresos-ayuda`)}
              className="entrada"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej.: 1500000"
              value={ingresos}
              onChange={(evento) => {
                setIngresos(evento.target.value);
              }}
            />
          </div>
          <p id={`${id}-ingresos-ayuda`} className="campo__ayuda">
            En pesos, lo que esperás cobrar en el mes.
          </p>
          <ErrorCampo id={`${id}-ingresosObjetivo-error`} mensaje={errores.ingresosObjetivo} />
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={`${id}-trabajosObjetivo`}>
            Cuántos trabajos querés hacer
          </label>
          <input
            {...describir('trabajosObjetivo', `${id}-trabajos-ayuda`)}
            className="entrada meta-form__corto"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ej.: 40"
            value={trabajos}
            onChange={(evento) => {
              setTrabajos(evento.target.value);
            }}
          />
          <p id={`${id}-trabajos-ayuda`} className="campo__ayuda">
            Trabajos completados en el mes.
          </p>
          <ErrorCampo id={`${id}-trabajosObjetivo-error`} mensaje={errores.trabajosObjetivo} />
        </div>
      </fieldset>

      <ErrorGeneral mensaje={error} />

      <div className="meta-form__acciones">
        <button type="button" className="boton boton--secundario" disabled={enviando} onClick={alCancelar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton--primario" disabled={enviando}>
          <Icono nombre="check" tamano={18} />
          {enviando ? 'Guardando…' : inicial ? 'Guardar la meta' : 'Fijar la meta'}
        </button>
      </div>
    </form>
  );
}
