import { useId, useState, type FormEvent } from 'react';
import { PRESETS, ETIQUETA_PRESET, validarRango, textoDelRango, type Preset, type RangoFechas } from '../../lib/rangosEstadisticas';
import { ErrorCampo } from '../ErroresFormulario';

interface Props {
  hoy: string;
  preset: Preset;
  /** El rango que se está mirando ahora. */
  rango: RangoFechas;
  alElegir: (preset: Preset) => void;
  /** Se llama con un rango escrito a mano que ya pasó la validación. */
  alAplicar: (rango: RangoFechas) => void;
}

/**
 * Filtro único de toda la sección, arriba de los gráficos: períodos de un toque y, si hace falta, "Personalizado"
 * con dos fechas (hasta 366 días). Los botones son un grupo de opciones (`aria-pressed`); el rango elegido se
 * escribe en palabras al lado.
 */
export function SelectorDeRango({ hoy, preset, rango, alElegir, alAplicar }: Props) {
  const id = useId();
  const [desde, setDesde] = useState(rango.desde);
  const [hasta, setHasta] = useState(rango.hasta);
  const [errores, setErrores] = useState<{ desde?: string; hasta?: string }>({});

  const aplicar = (evento: FormEvent) => {
    evento.preventDefault();
    const encontrados = validarRango(desde, hasta);
    setErrores(encontrados);
    if (encontrados.desde || encontrados.hasta) return;
    alAplicar({ desde, hasta });
  };

  return (
    <section className="est-rango" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="est-rango__titulo">
        Período
      </h2>
      <div className="est-chips" role="group" aria-labelledby={`${id}-titulo`}>
        {PRESETS.map((valor) => (
          <button
            key={valor}
            type="button"
            className="est-chip"
            aria-pressed={preset === valor}
            onClick={() => {
              if (valor === 'personalizado') {
                setDesde(rango.desde);
                setHasta(rango.hasta);
                setErrores({});
              }
              alElegir(valor);
            }}
          >
            {ETIQUETA_PRESET[valor]}
          </button>
        ))}
      </div>
      <p className="est-rango__texto">
        Mostrando <strong>{textoDelRango(rango, hoy)}</strong>
      </p>
      {preset === 'personalizado' && (
        <form className="est-rango__form" onSubmit={aplicar} noValidate>
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={`${id}-desde`}>
              Desde
            </label>
            <input
              id={`${id}-desde`}
              className="entrada"
              type="date"
              value={desde}
              aria-invalid={errores.desde ? true : undefined}
              aria-describedby={errores.desde ? `${id}-desde-error` : undefined}
              onChange={(evento) => {
                setDesde(evento.target.value);
              }}
            />
            <ErrorCampo id={`${id}-desde-error`} mensaje={errores.desde} />
          </div>
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={`${id}-hasta`}>
              Hasta
            </label>
            <input
              id={`${id}-hasta`}
              className="entrada"
              type="date"
              value={hasta}
              aria-invalid={errores.hasta ? true : undefined}
              aria-describedby={errores.hasta ? `${id}-hasta-error` : `${id}-ayuda`}
              onChange={(evento) => {
                setHasta(evento.target.value);
              }}
            />
            <ErrorCampo id={`${id}-hasta-error`} mensaje={errores.hasta} />
          </div>
          <button type="submit" className="boton boton--primario boton--chico est-rango__ver">
            Ver este período
          </button>
          <p id={`${id}-ayuda`} className="campo__ayuda est-rango__ayuda">
            Hasta 366 días (casi un año).
          </p>
        </form>
      )}
    </section>
  );
}
