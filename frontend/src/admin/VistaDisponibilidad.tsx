import { useId, useRef, useState, type FormEvent } from 'react';
import { CUPO_MAXIMO, MOTIVO_MAXIMO, type DiaEspecial, type HorarioDia } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import {
  NOMBRE_DIA_SEMANA,
  diaDelHorario,
  feriadoPrecargado,
  horarioOrdenado,
  leerCupo,
  leerMotivo,
  resumenDeCupos,
} from '../lib/cupos';
import { diaConMes, esFechaValida, hoyEnLaRioja } from '../lib/fechas';
import { useMontado } from './dialogo';
import { Contador, ErrorCampo, ErrorGeneral } from './ErroresFormulario';
import { useDisponibilidadPanel } from './useDisponibilidadPanel';
import type { Problema } from './useUsuarios';

interface Props {
  /** superadmin y admin (puedeEditarDisponibilidad); el empleado ve todo sin controles. */
  editable: boolean;
  alVencerSesion: (mensaje: string) => void;
}

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** "Jueves 25 de diciembre" (con el año si no es el de hoy). */
function fechaDelDia(fecha: string, hoy: string): string {
  const texto = conMayuscula(diaConMes(fecha));
  return fecha.slice(0, 4) === hoy.slice(0, 4) ? texto : `${texto} de ${fecha.slice(0, 4)}`;
}

/* ---------- Horario semanal ---------- */

interface FilaBorrador {
  dia: number;
  abierto: boolean;
  manana: string;
  tarde: string;
}

const aBorrador = (horario: readonly HorarioDia[]): FilaBorrador[] =>
  horarioOrdenado(horario).map((h) => ({ dia: h.dia, abierto: h.abierto, manana: String(h.cupoManana), tarde: String(h.cupoTarde) }));

function HorarioSemanal({
  horario,
  editable,
  alGuardar,
}: {
  horario: readonly HorarioDia[];
  editable: boolean;
  alGuardar: (dias: HorarioDia[]) => Promise<Problema | null>;
}) {
  const id = useId();
  const montado = useMontado();
  const formRef = useRef<HTMLFormElement>(null);
  const [original] = useState(() => aBorrador(horario));
  const [filas, setFilas] = useState(original);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [problema, setProblema] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cambiado = JSON.stringify(filas) !== JSON.stringify(original);

  if (!editable) {
    return (
      <ul role="list" className="horario horario--lectura">
        {horarioOrdenado(horario).map((h) => (
          <li key={h.dia} className="horario__fila">
            <span className="horario__dia">{NOMBRE_DIA_SEMANA[h.dia]}</span>
            <span className={h.abierto ? 'horario__resumen' : 'horario__resumen horario__resumen--cerrado'}>
              {resumenDeCupos(h.abierto, h.cupoManana, h.cupoTarde)}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  const cambiar = (dia: number, cambio: Partial<FilaBorrador>) => {
    setFilas((actuales) => actuales.map((f) => (f.dia === dia ? { ...f, ...cambio } : f)));
  };

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const nuevos: Record<string, string> = {};
    const dias: HorarioDia[] = filas.map((f) => {
      const manana = leerCupo(f.manana);
      const tarde = leerCupo(f.tarde);
      if ('error' in manana) nuevos[`${String(f.dia)}-manana`] = manana.error;
      if ('error' in tarde) nuevos[`${String(f.dia)}-tarde`] = tarde.error;
      return {
        dia: f.dia,
        abierto: f.abierto,
        cupoManana: 'valor' in manana ? manana.valor : 0,
        cupoTarde: 'valor' in tarde ? tarde.valor : 0,
      };
    });
    setErrores(nuevos);
    setProblema(null);
    if (Object.keys(nuevos).length > 0) {
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    setGuardando(true);
    const resultado = await alGuardar(dias);
    if (!montado.current) return;
    setGuardando(false);
    if (resultado) setProblema(resultado.mensaje);
  };

  return (
    <form ref={formRef} className="horario" noValidate aria-labelledby={`${id}-titulo`} onSubmit={(e) => void enviar(e)}>
      <p id={`${id}-titulo`} className="visualmente-oculto">
        Horario de la semana
      </p>
      <div className="horario__encabezado" aria-hidden="true">
        <span>Día</span>
        <span>Atiende</span>
        <span>Mañana</span>
        <span>Tarde</span>
      </div>
      <ul role="list" className="horario__lista">
        {filas.map((f) => {
          const nombre = NOMBRE_DIA_SEMANA[f.dia] ?? '';
          const errorManana = errores[`${String(f.dia)}-manana`];
          const errorTarde = errores[`${String(f.dia)}-tarde`];
          return (
            <li key={f.dia} className={f.abierto ? 'horario__fila' : 'horario__fila horario__fila--cerrada'}>
              <span className="horario__dia">
                {nombre}
              </span>
              <label className="casilla horario__abierto">
                <input
                  type="checkbox"
                  checked={f.abierto}
                  disabled={guardando}
                  onChange={(evento) => {
                    cambiar(f.dia, { abierto: evento.target.checked });
                  }}
                />
                Abierto<span className="visualmente-oculto"> el {nombre.toLowerCase()}</span>
              </label>
              {(['manana', 'tarde'] as const).map((franja) => {
                const error = franja === 'manana' ? errorManana : errorTarde;
                const campo = `${id}-${String(f.dia)}-${franja}`;
                return (
                  <div key={franja} className="horario__cupo">
                    <label className="horario__etiqueta" htmlFor={campo}>
                      <span aria-hidden="true">{franja === 'manana' ? 'Mañana' : 'Tarde'}</span>
                      <span className="visualmente-oculto">
                        Turnos a la {franja === 'manana' ? 'mañana' : 'tarde'} del {nombre.toLowerCase()}
                      </span>
                    </label>
                    <input
                      id={campo}
                      className="entrada horario__entrada"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={CUPO_MAXIMO}
                      step={1}
                      value={f[franja]}
                      disabled={!f.abierto || guardando}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${campo}-error` : undefined}
                      onChange={(evento) => {
                        cambiar(f.dia, { [franja]: evento.target.value });
                      }}
                    />
                    <ErrorCampo id={`${campo}-error`} mensaje={error} />
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
      <p className="campo__ayuda horario__ayuda">
        Cuántos turnos entran por franja, de 0 a {CUPO_MAXIMO}. Un cupo en 0 cierra esa franja. Los turnos pendientes
        también ocupan lugar.
      </p>
      <ErrorGeneral mensaje={problema} />
      <div className="horario__acciones">
        <button type="submit" className="boton boton--primario boton--chico" disabled={!cambiado || guardando}>
          <Icono nombre="check" tamano={18} />
          {guardando ? 'Guardando…' : 'Guardar horario'}
        </button>
        <button
          type="button"
          className="boton boton--fantasma boton--chico"
          disabled={!cambiado || guardando}
          onClick={() => {
            setFilas(original);
            setErrores({});
            setProblema(null);
          }}
        >
          Descartar cambios
        </button>
      </div>
    </form>
  );
}

/* ---------- Días especiales ---------- */

type Edicion = { modo: 'crear' } | { modo: 'editar'; dia: DiaEspecial };

function EditorDia({
  edicion,
  hoy,
  existentes,
  alGuardar,
  alCancelar,
}: {
  edicion: Edicion;
  hoy: string;
  existentes: readonly DiaEspecial[];
  alGuardar: (fecha: string, dia: Omit<DiaEspecial, 'fecha'>) => Promise<Problema | null>;
  alCancelar: () => void;
}) {
  const id = useId();
  const montado = useMontado();
  const formRef = useRef<HTMLFormElement>(null);
  const previo = edicion.modo === 'editar' ? edicion.dia : null;
  const [fecha, setFecha] = useState(previo?.fecha ?? '');
  const [abierto, setAbierto] = useState(previo?.abierto ?? false);
  const [manana, setManana] = useState(String(previo?.cupoManana ?? 2));
  const [tarde, setTarde] = useState(String(previo?.cupoTarde ?? 2));
  const [motivo, setMotivo] = useState(previo?.motivo ?? '');
  const [errores, setErrores] = useState<Record<string, string | undefined>>({});
  const [problema, setProblema] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const pisaOtro = edicion.modo === 'crear' && existentes.some((d) => d.fecha === fecha);

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const nuevos: Record<string, string | undefined> = {};
    if (edicion.modo === 'crear') {
      if (fecha.trim() === '') nuevos.fecha = 'Elegí el día.';
      else if (!esFechaValida(fecha)) nuevos.fecha = 'Esa fecha no es válida.';
      else if (fecha < hoy) nuevos.fecha = 'Elegí un día de hoy en adelante.';
    }
    const cupoM = leerCupo(manana);
    const cupoT = leerCupo(tarde);
    if (abierto && 'error' in cupoM) nuevos.cupoManana = cupoM.error;
    if (abierto && 'error' in cupoT) nuevos.cupoTarde = cupoT.error;
    const textoMotivo = leerMotivo(motivo);
    if ('error' in textoMotivo) nuevos.motivo = textoMotivo.error;
    setErrores(nuevos);
    setProblema(null);
    if (Object.values(nuevos).some(Boolean)) {
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    const motivoFinal = 'valor' in textoMotivo ? textoMotivo.valor : null;
    setGuardando(true);
    const resultado = await alGuardar(fecha, {
      abierto,
      cupoManana: abierto && 'valor' in cupoM ? cupoM.valor : null,
      cupoTarde: abierto && 'valor' in cupoT ? cupoT.valor : null,
      motivo: motivoFinal,
    });
    if (!montado.current) return;
    setGuardando(false);
    if (!resultado) return;
    const campos = resultado.campos ?? {};
    setErrores({ fecha: campos.fecha, cupoManana: campos.cupoManana, cupoTarde: campos.cupoTarde, motivo: campos.motivo });
    setProblema(resultado.mensaje);
  };

  const titulo = edicion.modo === 'crear' ? 'Nuevo día especial' : `Editar ${fechaDelDia(edicion.dia.fecha, hoy).toLowerCase()}`;
  const aria = (campo: string) => ({
    'aria-invalid': errores[campo] ? true : undefined,
    'aria-describedby': errores[campo] ? `${id}-${campo}-error` : undefined,
  });

  return (
    <form ref={formRef} className="fecha-turno dia-especial-form" noValidate aria-labelledby={`${id}-titulo`} onSubmit={(e) => void enviar(e)}>
      <p id={`${id}-titulo`} className="fecha-turno__titulo">
        {titulo}
      </p>
      <fieldset className="fecha-turno__grupo" disabled={guardando}>
        {edicion.modo === 'crear' && (
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={`${id}-fecha`}>
              Día
            </label>
            <input
              id={`${id}-fecha`}
              className="entrada dia-especial-form__fecha"
              type="date"
              min={hoy}
              value={fecha}
              {...aria('fecha')}
              onChange={(evento) => {
                setFecha(evento.target.value);
              }}
            />
            {pisaOtro && <p className="campo__ayuda">Ya hay un día especial para esa fecha: lo vas a reemplazar.</p>}
            <ErrorCampo id={`${id}-fecha-error`} mensaje={errores.fecha} />
          </div>
        )}

        <fieldset className="fecha-turno__franjas">
          <legend className="campo__etiqueta">Ese día</legend>
          <label className="casilla fecha-turno__opcion">
            <input
              type="radio"
              name={`${id}-abierto`}
              checked={!abierto}
              onChange={() => {
                setAbierto(false);
              }}
            />
            <span>
              Cerrado
              <span className="fecha-turno__detalle">No se toman turnos (feriado, vacaciones…)</span>
            </span>
          </label>
          <label className="casilla fecha-turno__opcion">
            <input
              type="radio"
              name={`${id}-abierto`}
              checked={abierto}
              onChange={() => {
                setAbierto(true);
              }}
            />
            <span>
              Abierto, con estos cupos
              <span className="fecha-turno__detalle">Por ejemplo, un domingo o un feriado que decidís trabajar</span>
            </span>
          </label>
        </fieldset>

        {abierto && (
          <div className="fecha-turno__campos fecha-turno__campos--anidados dia-especial-form__cupos">
            {(
              [
                ['cupoManana', 'Turnos a la mañana', manana, setManana],
                ['cupoTarde', 'Turnos a la tarde', tarde, setTarde],
              ] as const
            ).map(([campo, etiqueta, valor, asignar]) => (
              <div key={campo} className="campo">
                <label className="campo__etiqueta" htmlFor={`${id}-${campo}`}>
                  {etiqueta}
                </label>
                <input
                  id={`${id}-${campo}`}
                  className="entrada horario__entrada"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={CUPO_MAXIMO}
                  step={1}
                  value={valor}
                  {...aria(campo)}
                  onChange={(evento) => {
                    asignar(evento.target.value);
                  }}
                />
                <ErrorCampo id={`${id}-${campo}-error`} mensaje={errores[campo]} />
              </div>
            ))}
          </div>
        )}

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={`${id}-motivo`}>
            Motivo <span className="campo__opcional">(opcional)</span>
          </label>
          <input
            id={`${id}-motivo`}
            className="entrada"
            type="text"
            maxLength={MOTIVO_MAXIMO}
            placeholder="Ej.: Feriado: Navidad, Vacaciones"
            value={motivo}
            {...aria('motivo')}
            aria-describedby={[`${id}-motivo-ayuda`, errores.motivo ? `${id}-motivo-error` : null].filter(Boolean).join(' ')}
            onChange={(evento) => {
              setMotivo(evento.target.value);
            }}
          />
          <p id={`${id}-motivo-ayuda`} className="campo__ayuda servicio-form__ayuda-fila">
            Lo ves vos en el panel; el cliente no.
            <Contador valor={motivo} max={MOTIVO_MAXIMO} />
          </p>
          <ErrorCampo id={`${id}-motivo-error`} mensaje={errores.motivo} />
        </div>
      </fieldset>

      <ErrorGeneral mensaje={problema} />
      <div className="fecha-turno__acciones">
        <button type="submit" className="boton boton--primario boton--chico" disabled={guardando}>
          <Icono nombre="check" tamano={18} />
          {guardando ? 'Guardando…' : 'Guardar día'}
        </button>
        <button type="button" className="boton boton--fantasma boton--chico" disabled={guardando} onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FilaDiaEspecial({
  dia,
  hoy,
  horario,
  editable,
  alEditar,
  alQuitar,
}: {
  dia: DiaEspecial;
  hoy: string;
  horario: readonly HorarioDia[];
  editable: boolean;
  alEditar: () => void;
  alQuitar: () => Promise<Problema | null>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);
  const montado = useMontado();
  const feriado = feriadoPrecargado(dia.motivo);
  const semanal = horario.find((h) => h.dia === diaDelHorario(dia.fecha));

  const quitar = async () => {
    setQuitando(true);
    setProblema(null);
    const resultado = await alQuitar();
    if (!montado.current) return;
    setQuitando(false);
    setConfirmando(false);
    if (resultado) setProblema(resultado.mensaje);
  };

  return (
    <li className={dia.abierto ? 'dia-especial' : 'dia-especial dia-especial--cerrado'} data-fecha={dia.fecha}>
      <div className="dia-especial__cabeza">
        <p className="dia-especial__fecha">{fechaDelDia(dia.fecha, hoy)}</p>
        <span className={dia.abierto ? 'sello sello--confirmado' : 'sello sello--cancelado'}>
          {dia.abierto ? 'Abierto' : 'Cerrado'}
        </span>
        {feriado && <span className="dia-especial__feriado">Feriado{feriado.trasladable ? ' trasladable' : ''}</span>}
      </div>
      <p className="dia-especial__detalle">
        {feriado ? feriado.nombre : (dia.motivo ?? 'Sin motivo')}
        {dia.abierto && ` · ${resumenDeCupos(true, dia.cupoManana, dia.cupoTarde)}`}
      </p>
      {feriado?.trasladable && (
        <p className="dia-especial__nota">
          <Icono nombre="alerta" tamano={16} />
          Es un feriado trasladable: confirmá la fecha cuando el gobierno la publique.
        </p>
      )}
      {semanal && (
        <p className="dia-especial__semanal">
          Sin este día especial: {resumenDeCupos(semanal.abierto, semanal.cupoManana, semanal.cupoTarde).toLowerCase()}, como
          todos los {(NOMBRE_DIA_SEMANA[semanal.dia] ?? '').toLowerCase()}.
        </p>
      )}
      <ErrorGeneral mensaje={problema} />
      {editable && (
        <div className="dia-especial__acciones">
          {confirmando ? (
            <>
              <span className="dia-especial__pregunta">¿Lo quitás? Vuelve al horario de la semana.</span>
              <button
                type="button"
                className="boton boton--peligro boton--chico"
                disabled={quitando}
                onClick={() => {
                  void quitar();
                }}
              >
                {quitando ? 'Quitando…' : 'Sí, quitar'}
              </button>
              <button
                type="button"
                className="boton boton--fantasma boton--chico"
                disabled={quitando}
                onClick={() => {
                  setConfirmando(false);
                }}
              >
                No
              </button>
            </>
          ) : (
            <>
              <button type="button" className="boton boton--secundario boton--chico" data-editar={dia.fecha} onClick={alEditar}>
                <Icono nombre="lapiz" tamano={18} />
                Editar
              </button>
              <button
                type="button"
                className="boton boton--fantasma boton--chico"
                onClick={() => {
                  setConfirmando(true);
                }}
              >
                <Icono nombre="papelera" tamano={18} />
                Quitar
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Disponibilidad: el horario de siempre (qué días se atiende y cuántos turnos entran por franja) y los días
 * especiales, que ganan sobre el horario (feriados, vacaciones, un domingo que se abre). El formulario público solo
 * deja pedir lo que queda disponible acá.
 */
export function VistaDisponibilidad({ editable, alVencerSesion }: Props) {
  const d = useDisponibilidadPanel(alVencerSesion);
  const [hoy] = useState(() => hoyEnLaRioja(new Date()));
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const agregarRef = useRef<HTMLButtonElement>(null);

  const cerrarEditor = (fecha: string | null) => {
    setEdicion(null);
    requestAnimationFrame(() => {
      const editar = fecha ? document.querySelector<HTMLElement>(`[data-editar="${fecha}"]`) : null;
      (editar ?? agregarRef.current)?.focus();
    });
  };

  const datos = d.datos;
  const especiales = datos?.diasEspeciales ?? [];

  return (
    <section className="panel__vista disponibilidad" aria-labelledby="titulo-disponibilidad">
      <div className="panel__encabezado">
        <h1 id="titulo-disponibilidad" className="panel__titulo" tabIndex={-1}>
          Disponibilidad
        </h1>
        <button type="button" className="boton boton--secundario boton--chico" disabled={d.cargando} onClick={d.recargar}>
          <Icono nombre="refrescar" tamano={18} />
          Actualizar
        </button>
      </div>
      <p className="usuarios__ayuda">
        {editable
          ? 'Lo que marques acá es lo que la web deja pedir: solo días que se atienden y franjas con lugar. Vos podés confirmar o reprogramar igual en una franja llena o cerrada; el panel te avisa.'
          : 'Lo que figura acá es lo que la web deja pedir. Para cambiarlo, pedíselo a un admin.'}
      </p>

      <div className="panel__estado" aria-live="polite">
        {d.cargando && <p>Cargando la disponibilidad…</p>}
        {!d.cargando && d.aviso && <p className="panel__conteo">{d.aviso}</p>}
      </div>

      {d.cargando && <div className="turno turno--esqueleto agenda__esqueleto" aria-hidden="true" />}

      {d.error && (
        <div className="panel__error" role="alert">
          <Icono nombre="alerta" tamano={22} />
          <div>
            <p>No pudimos cargar la disponibilidad. {d.error}</p>
            <button type="button" className="boton boton--primario boton--chico" onClick={d.recargar}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {datos && (
        <>
          <div className="disponibilidad__bloque">
            <h2 className="usuarios__subtitulo">Horario de la semana</h2>
            <HorarioSemanal
              key={JSON.stringify(datos.horarioSemanal)}
              horario={datos.horarioSemanal}
              editable={editable}
              alGuardar={d.guardarHorario}
            />
          </div>

          <div className="disponibilidad__bloque">
            <div className="panel__encabezado">
              <h2 className="usuarios__subtitulo">Días especiales</h2>
              {editable && edicion?.modo !== 'crear' && (
                <button
                  ref={agregarRef}
                  type="button"
                  className="boton boton--primario boton--chico"
                  onClick={() => {
                    setEdicion({ modo: 'crear' });
                  }}
                >
                  <Icono nombre="mas" tamano={18} />
                  Agregar día
                </button>
              )}
            </div>
            <p className="usuarios__ayuda">
              Ganan sobre el horario de la semana. Ya cargamos cerrados los feriados nacionales inamovibles hasta fin de
              2027: si querés trabajar alguno, editalo y abrilo. Los feriados trasladables y los días puente los fija el
              gobierno cada año, así que revisalos cuando se publiquen y agregalos acá.
            </p>

            {edicion?.modo === 'crear' && (
              <EditorDia
                edicion={edicion}
                hoy={hoy}
                existentes={especiales}
                alGuardar={async (fecha, dia) => {
                  const problema = await d.guardarDia(
                    fecha,
                    dia.abierto
                      ? { abierto: true, cupoManana: dia.cupoManana ?? 0, cupoTarde: dia.cupoTarde ?? 0, motivo: dia.motivo }
                      : { abierto: false, motivo: dia.motivo },
                  );
                  if (!problema) cerrarEditor(fecha);
                  return problema;
                }}
                alCancelar={() => {
                  cerrarEditor(null);
                }}
              />
            )}

            {especiales.length === 0 ? (
              <div className="panel__vacio">
                <p>No hay días especiales de hoy en adelante: rige el horario de la semana.</p>
              </div>
            ) : (
              <ul role="list" className="dias-especiales">
                {especiales.map((dia) =>
                  edicion?.modo === 'editar' && edicion.dia.fecha === dia.fecha ? (
                    <li key={dia.fecha}>
                      <EditorDia
                        edicion={edicion}
                        hoy={hoy}
                        existentes={especiales}
                        alGuardar={async (fecha, cambio) => {
                          const problema = await d.guardarDia(
                            fecha,
                            cambio.abierto
                              ? {
                                  abierto: true,
                                  cupoManana: cambio.cupoManana ?? 0,
                                  cupoTarde: cambio.cupoTarde ?? 0,
                                  motivo: cambio.motivo,
                                }
                              : { abierto: false, motivo: cambio.motivo },
                          );
                          if (!problema) cerrarEditor(fecha);
                          return problema;
                        }}
                        alCancelar={() => {
                          cerrarEditor(dia.fecha);
                        }}
                      />
                    </li>
                  ) : (
                    <FilaDiaEspecial
                      key={dia.fecha}
                      dia={dia}
                      hoy={hoy}
                      horario={datos.horarioSemanal}
                      editable={editable}
                      alEditar={() => {
                        setEdicion({ modo: 'editar', dia });
                      }}
                      alQuitar={async () => {
                        const problema = await d.quitarDia(dia.fecha);
                        if (!problema) requestAnimationFrame(() => agregarRef.current?.focus());
                        return problema;
                      }}
                    />
                  ),
                )}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
