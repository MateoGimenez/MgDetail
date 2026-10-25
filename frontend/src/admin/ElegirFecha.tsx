import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ETIQUETA_FRANJA, FRANJAS, type CambiosTurno, type Franja, type Turno } from '../api/contract';
import { Icono } from '../components/Icono';
import { lugarEnAgenda, validarFechaConfirmada, type ErroresFecha } from '../lib/agenda';
import { avisoDeLugar } from '../lib/cupos';
import { esFechaValida, fechaCorta, rangoDeConfirmacion } from '../lib/fechas';
import { useMontado } from './dialogo';
import { ErrorCampo } from './ErroresFormulario';
import { useCupoDelDia } from './useCupoDelDia';
import type { Problema } from './useUsuarios';

/** Primer control con error (los radios no admiten aria-invalid: llevan data-invalido). */
const INVALIDO = '[aria-invalid="true"], [data-invalido="true"]';

export type ModoFecha = 'confirmar' | 'reprogramar';

interface Props {
  turno: Turno;
  modo: ModoFecha;
  /** Manda el cambio; null si salió bien o el problema (el mensaje general lo muestra la tarjeta). */
  alEnviar: (cambios: CambiosTurno) => Promise<Problema | null>;
  alTerminar: () => void;
}

type Eleccion = 'pedido' | 'otra';

/**
 * Elegir para cuándo queda un turno, dentro de la misma tarjeta (sin otro modal encima):
 * - confirmar: "para lo que pidió" (por defecto) u "otra fecha";
 * - reprogramar: otra fecha, o volver a lo que pidió si ya tenía una confirmada.
 * Fecha de hoy a hoy + 120 días (hora de La Rioja) y franja; el backend vuelve a controlar las dos cosas.
 */
export function ElegirFecha({ turno, modo, alEnviar, alTerminar }: Props) {
  const id = useId();
  const montado = useMontado();
  const formRef = useRef<HTMLFormElement>(null);
  const [ahora] = useState(() => new Date());
  const { min, max } = rangoDeConfirmacion(ahora);
  const lugar = lugarEnAgenda(turno);
  const tieneConfirmada = turno.fechaConfirmada !== null;
  /**
   * Reprogramar algo que está en lo que pidió (sin confirmada, o con la confirmada igual a lo pedido) no tiene
   * "lo que pidió" para elegir: ya está ahí.
   */
  const ofrecePedido = modo === 'confirmar' || lugar.reprogramado;

  /*
   * Un turno que volvió a pendiente conserva la fecha confirmada que tenía (el backend no la borra). Al confirmarlo
   * de nuevo arranca en "Otra fecha" con esa fecha cargada, para no volverlo a lo pedido sin querer.
   */
  const [eleccion, setEleccion] = useState<Eleccion>(modo === 'confirmar' && !lugar.reprogramado ? 'pedido' : 'otra');
  // Arranca en la fecha de agenda si todavía se puede elegir; una fecha pasada no se ofrece.
  const [fecha, setFecha] = useState(() => (lugar.fecha >= min && lugar.fecha <= max ? lugar.fecha : ''));
  const [franja, setFranja] = useState<Franja | null>(lugar.franja);
  const [errores, setErrores] = useState<ErroresFecha>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('input')?.focus();
  }, []);

  const pedido = `${fechaCorta(turno.fechaPreferida)} · ${ETIQUETA_FRANJA[turno.franja]}`;

  /*
   * El panel manda: puede agendar en una franja llena o cerrada, pero se le avisa. Si el turno ya ocupa ese mismo
   * lugar (p. ej. se confirma para lo que pidió), no se cuenta dos veces.
   */
  const destino = eleccion === 'pedido' ? { fecha: turno.fechaPreferida, franja: turno.franja } : { fecha: fecha.trim(), franja };
  const cupo = useCupoDelDia(esFechaValida(destino.fecha) ? destino.fecha : null);
  const avisoCupo =
    destino.franja === null
      ? null
      : avisoDeLugar(cupo, destino.franja, lugar.fecha === destino.fecha && lugar.franja === destino.franja);

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    let cambios: CambiosTurno;
    if (eleccion === 'pedido') {
      // Se manda null explícito solo si había una confirmada que borrar: si no, alcanza con el estado.
      const aLoPedido = { fechaConfirmada: null, franjaConfirmada: null } as const;
      if (modo === 'confirmar') cambios = tieneConfirmada ? { estado: 'confirmado', ...aLoPedido } : { estado: 'confirmado' };
      else cambios = aLoPedido;
    } else {
      const problemas = validarFechaConfirmada(fecha, franja, ahora);
      setErrores(problemas);
      if (problemas.fechaConfirmada || problemas.franjaConfirmada || franja === null) {
        requestAnimationFrame(() => {
          formRef.current?.querySelector<HTMLElement>(INVALIDO)?.focus();
        });
        return;
      }
      const nueva = { fechaConfirmada: fecha.trim(), franjaConfirmada: franja };
      if (modo === 'reprogramar' && nueva.fechaConfirmada === turno.fechaConfirmada && franja === turno.franjaConfirmada) {
        alTerminar();
        return;
      }
      cambios = modo === 'confirmar' ? { estado: 'confirmado', ...nueva } : nueva;
    }

    setEnviando(true);
    const problema = await alEnviar(cambios);
    if (!montado.current) return;
    setEnviando(false);
    if (!problema) {
      alTerminar();
      return;
    }
    const campos = problema.campos ?? {};
    setErrores({ fechaConfirmada: campos.fechaConfirmada, franjaConfirmada: campos.franjaConfirmada });
    if (campos.fechaConfirmada || campos.franjaConfirmada) {
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>(INVALIDO)?.focus();
      });
    }
  };

  const titulo = modo === 'confirmar' ? '¿Para cuándo lo confirmás?' : 'Reprogramar el turno';

  return (
    <form ref={formRef} className="fecha-turno" noValidate aria-labelledby={`${id}-titulo`} onSubmit={(e) => void enviar(e)}>
      <p id={`${id}-titulo`} className="fecha-turno__titulo">
        {titulo}
      </p>

      <fieldset className="fecha-turno__grupo" disabled={enviando}>
        {ofrecePedido && (
          <>
            <legend className="visualmente-oculto">{titulo}</legend>
            <label className="casilla fecha-turno__opcion">
              <input
                type="radio"
                name={`${id}-eleccion`}
                checked={eleccion === 'pedido'}
                onChange={() => {
                  setEleccion('pedido');
                  setErrores({});
                }}
              />
              <span>
                {modo === 'confirmar' ? 'Para lo que pidió' : 'Volver a lo que pidió'}
                <span className="fecha-turno__detalle">{pedido}</span>
              </span>
            </label>
            <label className="casilla fecha-turno__opcion">
              <input
                type="radio"
                name={`${id}-eleccion`}
                checked={eleccion === 'otra'}
                onChange={() => {
                  setEleccion('otra');
                }}
              />
              <span>Otra fecha</span>
            </label>
          </>
        )}

        {eleccion === 'otra' && (
          <div className={ofrecePedido ? 'fecha-turno__campos fecha-turno__campos--anidados' : 'fecha-turno__campos'}>
            <div className="campo">
              <label className="campo__etiqueta" htmlFor={`${id}-fecha`}>
                Día
              </label>
              <input
                id={`${id}-fecha`}
                className="entrada"
                type="date"
                min={min}
                max={max}
                value={fecha}
                aria-invalid={errores.fechaConfirmada ? true : undefined}
                aria-describedby={[`${id}-fecha-ayuda`, errores.fechaConfirmada ? `${id}-fecha-error` : null].filter(Boolean).join(' ')}
                onChange={(evento) => {
                  setFecha(evento.target.value);
                }}
              />
              <p id={`${id}-fecha-ayuda`} className="campo__ayuda">
                De hoy hasta {fechaCorta(max)}.
                {!ofrecePedido && ` Pidió: ${pedido}.`}
              </p>
              <ErrorCampo id={`${id}-fecha-error`} mensaje={errores.fechaConfirmada} />
            </div>

            <fieldset className="fecha-turno__franjas">
              <legend className="campo__etiqueta">Franja</legend>
              <div className="fecha-turno__franjas-opciones">
                {FRANJAS.map((valor) => (
                  <label key={valor} className="casilla fecha-turno__franja">
                    <input
                      type="radio"
                      name={`${id}-franja`}
                      value={valor}
                      checked={franja === valor}
                      data-invalido={errores.franjaConfirmada ? 'true' : undefined}
                      aria-describedby={errores.franjaConfirmada ? `${id}-franja-error` : undefined}
                      onChange={() => {
                        setFranja(valor);
                      }}
                    />
                    {ETIQUETA_FRANJA[valor]}
                  </label>
                ))}
              </div>
              <ErrorCampo id={`${id}-franja-error`} mensaje={errores.franjaConfirmada} />
            </fieldset>
          </div>
        )}
      </fieldset>

      {/* Siempre en el DOM para que el lector de pantalla anuncie el aviso cuando aparece. */}
      <p className="fecha-turno__aviso" role="status">
        {avisoCupo && (
          <>
            <Icono nombre="alerta" tamano={18} />
            {avisoCupo}
          </>
        )}
      </p>

      <div className="fecha-turno__acciones">
        <button type="submit" className="boton boton--primario boton--chico" disabled={enviando}>
          <Icono nombre="check" tamano={18} />
          {enviando ? 'Guardando…' : modo === 'confirmar' ? 'Confirmar turno' : 'Guardar fecha'}
        </button>
        <button type="button" className="boton boton--fantasma boton--chico" disabled={enviando} onClick={alTerminar}>
          Volver
        </button>
      </div>
    </form>
  );
}
