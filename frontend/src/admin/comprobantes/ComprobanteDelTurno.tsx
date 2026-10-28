import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError, esAbortado } from '../../api/client';
import { buscarComprobante, emitirComprobante, rutaPdfComprobante, type Comprobante } from '../../api/comprobantes';
import { esSesionPerdida } from '../../api/sesion';
import { Icono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import {
  ETIQUETA_FORMA_DE_PAGO,
  FORMAS_DE_PAGO,
  LIMITE_NOTA_COMPROBANTE,
  MENSAJE_SIN_COBRO,
  MENSAJE_SIN_FORMA,
  estadoDeEmision,
  lineaDeComprobante,
  nombreDeArchivoComprobante,
  type FormaDePago,
} from '../../lib/comprobantes';
import { useDatosDeCobro } from '../cobro/contextoCobro';
import { useMontado } from '../dialogo';
import { BotonesPdf } from '../documentos/BotonesPdf';
import { ErrorCampo, ErrorGeneral } from '../ErroresFormulario';
import { useAvisos } from '../toast/contexto';
import './comprobantes.css';

interface Props {
  turno: { id: string; monto: number | null };
  /** Lleva al formulario de cobro de la tarjeta (el turno todavía no tiene monto). */
  alCargarCobro: () => void;
  /** Avisa si el panel está abierto: la tarjeta lo cuenta como «Sin terminar» al plegar. */
  alCambiarAbierto: (abierto: boolean) => void;
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'nuevo' }
  | { tipo: 'listo'; comprobante: Comprobante }
  | { tipo: 'error'; mensaje: string };

/**
 * Comprobante de pago de un trabajo completado (solo admin y superadmin): elegir cómo pagó y bajar o compartir el
 * PDF. Si el turno ya tiene comprobante, lo reabre (no se emite otro). Sin cobro cargado explica qué falta y lleva
 * al formulario de cobro. No es una factura: el PDF lo aclara.
 */
export function ComprobanteDelTurno({ turno, alCargarCobro, alCambiarAbierto }: Props) {
  const id = useId();
  const montado = useMontado();
  const avisos = useAvisos();
  const { alVencerSesion } = useDatosDeCobro();
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  // La respuesta lleva la clave de la búsqueda que la trajo: una anterior (otra apertura, otro turno) cuenta como «cargando».
  const [respuesta, setRespuesta] = useState<{ clave: string; estado: Estado } | null>(null);
  const [apertura, setApertura] = useState(0);
  const [reintento, setReintento] = useState(0);
  const clave = `${turno.id}|${String(apertura)}|${String(reintento)}`;
  const estado: Estado = respuesta?.clave === clave ? respuesta.estado : { tipo: 'cargando' };
  const [forma, setForma] = useState<FormaDePago | null>(null);
  const [notas, setNotas] = useState('');
  const [errores, setErrores] = useState<{ forma?: string; notas?: string }>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const sinCobro = estadoDeEmision(turno) === 'sin-cobro';

  useEffect(() => {
    alCambiarAbierto(abierto);
    return () => {
      alCambiarAbierto(false);
    };
  }, [abierto, alCambiarAbierto]);

  // Al abrirse con cobro cargado, se busca si ya hay comprobante (si hay, se reabre; si no, se elige la forma de pago).
  useEffect(() => {
    if (!abierto || sinCobro) return;
    const control = new AbortController();
    buscarComprobante(turno.id, control.signal)
      .then((comprobante) => {
        setRespuesta({ clave, estado: comprobante ? { tipo: 'listo', comprobante } : { tipo: 'nuevo' } });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setRespuesta({ clave, estado: { tipo: 'error', mensaje: error instanceof Error ? error.message : 'No pudimos buscar el comprobante.' } });
      });
    return () => {
      control.abort();
    };
  }, [abierto, sinCobro, turno.id, clave, alVencerSesion]);

  // Al abrir, el foco va al panel (su título); el lector de pantalla lo lee y el teclado sigue desde ahí.
  useEffect(() => {
    if (abierto) panelRef.current?.querySelector<HTMLElement>('[data-foco]')?.focus();
  }, [abierto, estado.tipo]);

  const abrir = () => {
    setForma(null);
    setNotas('');
    setErrores({});
    setGeneral(null);
    setApertura((n) => n + 1);
    setAbierto(true);
  };
  const cerrar = () => {
    setAbierto(false);
    requestAnimationFrame(() => {
      botonRef.current?.focus();
    });
  };

  const emitir = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setGeneral(null);
    if (forma === null) {
      setErrores({ forma: MENSAJE_SIN_FORMA });
      requestAnimationFrame(() => {
        panelRef.current?.querySelector<HTMLElement>('input[type="radio"]')?.focus();
      });
      return;
    }
    const nota = notas.trim();
    if (Array.from(nota).length > LIMITE_NOTA_COMPROBANTE) {
      setErrores({ notas: `Máximo ${String(LIMITE_NOTA_COMPROBANTE)} caracteres.` });
      return;
    }
    setErrores({});
    setEnviando(true);
    try {
      const comprobante = await emitirComprobante(turno.id, { formaPago: forma, ...(nota ? { notas: nota } : {}) });
      if (!montado.current) return;
      setRespuesta({ clave, estado: { tipo: 'listo', comprobante } });
      avisos.exito(`Comprobante ${comprobante.codigo} listo. Ya podés bajar o compartir el PDF.`);
    } catch (error) {
      if (!montado.current) return;
      if (esSesionPerdida(error)) {
        alVencerSesion(error.message);
        return;
      }
      if (error instanceof ApiError) {
        setErrores({ forma: error.fields?.formaPago, notas: error.fields?.notas });
        setGeneral(error.message);
      } else {
        setGeneral('No se pudo emitir el comprobante. Probá de nuevo.');
      }
    } finally {
      if (montado.current) setEnviando(false);
    }
  };

  return (
    <div className="comp">
      <button
        ref={botonRef}
        type="button"
        className="boton boton--secundario boton--chico"
        data-abre="comprobante"
        aria-expanded={abierto}
        aria-controls={`${id}-panel`}
        onClick={() => {
          if (abierto) cerrar();
          else abrir();
        }}
      >
        <Icono nombre="copiar" tamano={18} />
        Comprobante
      </button>

      {abierto && (
        <div ref={panelRef} id={`${id}-panel`} className="cobro comp__panel">
          {sinCobro ? (
            <>
              <p className="cobro__titulo" tabIndex={-1} data-foco="">
                Primero cargá el cobro
              </p>
              <p className="comp__texto">
                El comprobante dice cuánto se cobró, y este trabajo todavía no tiene el monto. Cargalo y después emitís el comprobante.
              </p>
              <div className="cobro__acciones">
                <button
                  type="button"
                  className="boton boton--primario boton--chico"
                  onClick={() => {
                    setAbierto(false);
                    alCargarCobro();
                  }}
                >
                  <Icono nombre="mas" tamano={18} />
                  Cargar cobro
                </button>
                <button type="button" className="boton boton--fantasma boton--chico" onClick={cerrar}>
                  Volver
                </button>
              </div>
            </>
          ) : estado.tipo === 'cargando' ? (
            <p className="panel__cargando" role="status" tabIndex={-1} data-foco="">
              Buscando el comprobante…
            </p>
          ) : estado.tipo === 'error' ? (
            <>
              <p className="turno__error" role="alert">
                <Icono nombre="alerta" tamano={18} />
                {estado.mensaje}
              </p>
              <div className="cobro__acciones">
                <button
                  type="button"
                  className="boton boton--primario boton--chico"
                  onClick={() => {
                    setReintento((n) => n + 1);
                  }}
                >
                  Reintentar
                </button>
                <button type="button" className="boton boton--fantasma boton--chico" onClick={cerrar}>
                  Volver
                </button>
              </div>
            </>
          ) : estado.tipo === 'listo' ? (
            <>
              <p className="cobro__titulo" tabIndex={-1} data-foco="">
                Comprobante {estado.comprobante.codigo}
              </p>
              <p className="comp__linea">
                {lineaDeComprobante(estado.comprobante)} · <strong>{formatoPesos(estado.comprobante.monto)}</strong>
              </p>
              {turno.monto !== null && turno.monto !== estado.comprobante.monto && (
                <p className="comp__nota" role="status">
                  <Icono nombre="alerta" tamano={16} />
                  Se emitió por {formatoPesos(estado.comprobante.monto)} y el cobro ahora es {formatoPesos(turno.monto)}. El comprobante no cambia.
                </p>
              )}
              <p className="comp__texto">No es una factura: el PDF lo aclara.</p>
              <BotonesPdf
                ruta={rutaPdfComprobante(estado.comprobante.id)}
                version={estado.comprobante.id}
                nombreDeArchivo={nombreDeArchivoComprobante(estado.comprobante.codigo)}
                queEs={`comprobante ${estado.comprobante.codigo}`}
                alVencerSesion={alVencerSesion}
              />
              <div className="cobro__acciones">
                <button type="button" className="boton boton--fantasma boton--chico" onClick={cerrar}>
                  Cerrar
                </button>
              </div>
            </>
          ) : (
            <form className="comp__form" noValidate onSubmit={(e) => void emitir(e)}>
              <p className="cobro__titulo" tabIndex={-1} data-foco="">
                Comprobante de pago
              </p>
              <fieldset className="cobro__campos" disabled={enviando} aria-describedby={errores.forma ? `${id}-forma-error` : undefined}>
                <legend className="campo__etiqueta">¿Cómo pagó? ({formatoPesos(turno.monto ?? 0)})</legend>
                <div className="comp__formas">
                  {FORMAS_DE_PAGO.map((f) => (
                    <label key={f} className="casilla comp__forma">
                      <input
                        type="radio"
                        name={`${id}-forma`}
                        value={f}
                        checked={forma === f}
                        onChange={() => {
                          setForma(f);
                          setErrores((e) => ({ ...e, forma: undefined }));
                        }}
                      />
                      {ETIQUETA_FORMA_DE_PAGO[f]}
                    </label>
                  ))}
                </div>
                <ErrorCampo id={`${id}-forma-error`} mensaje={errores.forma} />

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor={`${id}-notas`}>
                    Nota <span className="campo__opcional">(opcional)</span>
                  </label>
                  <input
                    id={`${id}-notas`}
                    className="entrada"
                    type="text"
                    autoComplete="off"
                    maxLength={LIMITE_NOTA_COMPROBANTE}
                    placeholder="Ej.: pagó la seña por transferencia"
                    value={notas}
                    aria-invalid={errores.notas ? true : undefined}
                    aria-describedby={errores.notas ? `${id}-notas-error` : undefined}
                    onChange={(e) => {
                      setNotas(e.target.value);
                      setErrores((x) => ({ ...x, notas: undefined }));
                    }}
                  />
                  <ErrorCampo id={`${id}-notas-error`} mensaje={errores.notas} />
                </div>
              </fieldset>

              <ErrorGeneral mensaje={general} />
              {general === MENSAJE_SIN_COBRO && (
                <button
                  type="button"
                  className="boton boton--secundario boton--chico"
                  onClick={() => {
                    setAbierto(false);
                    alCargarCobro();
                  }}
                >
                  Cargar cobro
                </button>
              )}

              <div className="cobro__acciones">
                <button type="submit" className="boton boton--primario boton--chico" disabled={enviando}>
                  <Icono nombre="check" tamano={18} />
                  {enviando ? 'Emitiendo…' : 'Emitir comprobante'}
                </button>
                <button type="button" className="boton boton--fantasma boton--chico" disabled={enviando} onClick={cerrar}>
                  Volver
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
