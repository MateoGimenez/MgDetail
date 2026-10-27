import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { CambiosTurno, Turno } from '../../api/contract';
import { Icono } from '../../components/Icono';
import { formatoPesos, leerMonto, montoParaCampo } from '../../lib/cobro';
import { useMontado } from '../dialogo';
import { ErrorCampo } from '../ErroresFormulario';
import type { Problema } from '../useUsuarios';
import './cobro.css';
import { useDatosDeCobro } from './contextoCobro';
import { useTrabajadores } from './useTrabajadores';

/** Primer control con error. */
const INVALIDO = '[aria-invalid="true"]';

export type ModoCobro = 'completar' | 'editar';

interface Props {
  turno: Turno;
  /** completar: el turno todavía no está completado (se manda el estado junto con el cobro); editar: ya lo está. */
  modo: ModoCobro;
  /** Manda el cambio; null si salió bien o el problema (el mensaje general lo muestra la tarjeta). */
  alEnviar: (cambios: CambiosTurno) => Promise<Problema | null>;
  alTerminar: () => void;
}

/**
 * Cobro y trabajador de un trabajo, dentro de la misma tarjeta (sin otro modal encima), para admin y superadmin:
 * - ¿Cuánto cobraste?: pesos enteros (acepta "$ 25.000"), opcional; se sugiere el "Desde" del servicio con un botón;
 * - ¿Quién lo hizo?: las personas activas del panel, por defecto quien está logueado.
 * Los errores del backend (`fields.monto`, `fields.trabajadorId`) van en su campo. Si cierra o falla, no se pierde lo
 * escrito: el formulario sigue abierto hasta que se guarda o se toca Volver.
 */
export function FormularioCobro({ turno, modo, alEnviar, alTerminar }: Props) {
  const id = useId();
  const montado = useMontado();
  const formRef = useRef<HTMLFormElement>(null);
  const { usuarioId, precioDesde, alVencerSesion } = useDatosDeCobro();
  const trabajadores = useTrabajadores(alVencerSesion);
  const sugerido = precioDesde(turno.servicioId);

  const [monto, setMonto] = useState(modo === 'editar' ? montoParaCampo(turno.monto) : '');
  const [trabajadorId, setTrabajadorId] = useState(modo === 'editar' ? (turno.trabajador?.id ?? '') : (usuarioId ?? ''));
  const [errores, setErrores] = useState<{ monto?: string; trabajadorId?: string }>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('input')?.focus();
  }, []);

  // Las opciones: las personas activas y, si el trabajo lo hizo alguien que ya no está en la lista, esa persona también.
  const opciones = trabajadores.lista
    ? [
        ...trabajadores.lista.map((t) => ({ id: t.id, nombre: t.nombre })),
        ...(turno.trabajador && !trabajadores.lista.some((t) => t.id === turno.trabajador?.id) ? [turno.trabajador] : []),
      ]
    : [];
  const valorSelect = opciones.some((o) => o.id === trabajadorId) ? trabajadorId : '';

  const enfocarInvalido = () => {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>(INVALIDO)?.focus();
    });
  };

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const lectura = leerMonto(monto);
    if ('error' in lectura) {
      setErrores({ monto: lectura.error });
      enfocarInvalido();
      return;
    }
    setErrores({});

    // Sin la lista no se puede elegir a otra persona: al completar queda a nombre de quien lo completa y al editar no se toca.
    const elegido: string | null | undefined = trabajadores.lista ? valorSelect || null : modo === 'completar' ? (usuarioId ?? undefined) : undefined;
    const cobro: { monto?: number | null; trabajadorId?: string | null } = {};
    if (modo === 'completar') {
      if (lectura.valor !== null) cobro.monto = lectura.valor;
      if (elegido !== undefined) cobro.trabajadorId = elegido;
    } else {
      if (lectura.valor !== turno.monto) cobro.monto = lectura.valor;
      if (elegido !== undefined && elegido !== (turno.trabajador?.id ?? null)) cobro.trabajadorId = elegido;
      if (Object.keys(cobro).length === 0) {
        alTerminar();
        return;
      }
    }
    // El tipo exige "al menos uno de los dos" cuando no hay estado; ya se comprobó arriba.
    const cambios = (modo === 'completar' ? { estado: 'completado' as const, ...cobro } : cobro) as CambiosTurno;

    setEnviando(true);
    const problema = await alEnviar(cambios);
    if (!montado.current) return;
    setEnviando(false);
    if (!problema) {
      alTerminar();
      return;
    }
    const campos = problema.campos ?? {};
    setErrores({ monto: campos.monto, trabajadorId: campos.trabajadorId });
    if (campos.monto || campos.trabajadorId) enfocarInvalido();
  };

  const titulo = modo === 'completar' ? 'Completar el turno' : 'Cobro del trabajo';
  const lectura = leerMonto(monto);
  const sugerencia = sugerido !== null && sugerido > 0 && !('valor' in lectura && lectura.valor === sugerido) ? sugerido : null;

  return (
    <form ref={formRef} className="cobro" noValidate aria-labelledby={`${id}-titulo`} onSubmit={(e) => void enviar(e)}>
      <p id={`${id}-titulo`} className="cobro__titulo">
        {titulo}
      </p>

      <fieldset className="cobro__campos" disabled={enviando}>
        <legend className="visualmente-oculto">{titulo}</legend>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={`${id}-monto`}>
            ¿Cuánto cobraste? <span className="campo__opcional">(opcional)</span>
          </label>
          <input
            id={`${id}-monto`}
            className="entrada cobro__monto"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="$ 25.000"
            value={monto}
            aria-invalid={errores.monto ? true : undefined}
            aria-describedby={[`${id}-monto-ayuda`, errores.monto ? `${id}-monto-error` : null].filter(Boolean).join(' ')}
            onChange={(evento) => {
              setMonto(evento.target.value);
            }}
          />
          <p id={`${id}-monto-ayuda`} className="campo__ayuda">
            En pesos, sin centavos. Si todavía no lo sabés, dejalo vacío y lo cargás después.
          </p>
          <ErrorCampo id={`${id}-monto-error`} mensaje={errores.monto} />
          {sugerencia !== null && (
            <button
              type="button"
              className="boton boton--fantasma boton--chico cobro__sugerencia"
              onClick={() => {
                setMonto(String(sugerencia));
                setErrores((previos) => ({ ...previos, monto: undefined }));
                formRef.current?.querySelector<HTMLElement>('input')?.focus();
              }}
            >
              Usar {formatoPesos(sugerencia)}
              <span className="cobro__sugerencia-aclara">el «Desde» del servicio</span>
            </button>
          )}
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={`${id}-quien`}>
            ¿Quién lo hizo?
          </label>
          <div className="desplegable">
            <select
              id={`${id}-quien`}
              className="entrada"
              value={trabajadores.lista ? valorSelect : ''}
              disabled={!trabajadores.lista}
              aria-invalid={errores.trabajadorId ? true : undefined}
              aria-describedby={[
                trabajadores.error ? `${id}-quien-falla` : null,
                errores.trabajadorId ? `${id}-quien-error` : null,
              ]
                .filter(Boolean)
                .join(' ') || undefined}
              onChange={(evento) => {
                setTrabajadorId(evento.target.value);
                setErrores((previos) => ({ ...previos, trabajadorId: undefined }));
              }}
            >
              {!trabajadores.lista && <option value="">{trabajadores.error ? 'Sin lista' : 'Cargando personas…'}</option>}
              {trabajadores.lista && <option value="">Sin asignar</option>}
              {opciones.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                  {o.id === usuarioId ? ' (vos)' : ''}
                </option>
              ))}
            </select>
            <Icono nombre="abajo" tamano={18} className="desplegable__icono" />
          </div>
          <ErrorCampo id={`${id}-quien-error`} mensaje={errores.trabajadorId} />
          {trabajadores.error && (
            <p id={`${id}-quien-falla`} className="campo__ayuda cobro__falla" role="status">
              <span>
                No pudimos cargar la lista de personas.
                {modo === 'completar' ? ' Si guardás ahora, queda a tu nombre.' : ' Si guardás ahora, no cambia quién lo hizo.'}
              </span>
              <button type="button" className="boton boton--fantasma boton--chico" onClick={trabajadores.reintentar}>
                Reintentar
              </button>
            </p>
          )}
        </div>
      </fieldset>

      <div className="cobro__acciones">
        <button type="submit" className="boton boton--primario boton--chico" disabled={enviando}>
          <Icono nombre="check" tamano={18} />
          {enviando ? 'Guardando…' : modo === 'completar' ? 'Marcar completado' : 'Guardar cobro'}
        </button>
        <button type="button" className="boton boton--fantasma boton--chico" disabled={enviando} onClick={alTerminar}>
          Volver
        </button>
      </div>
    </form>
  );
}
