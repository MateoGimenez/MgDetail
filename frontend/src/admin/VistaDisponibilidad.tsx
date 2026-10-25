import { useEffect, useId, useRef, useState } from 'react';
import { MOTIVO_MAXIMO, type DiaEspecial } from '../api/contract-panel';
import { Rombo } from '../components/Filete';
import { Icono } from '../components/Icono';
import {
  SELECCION_VACIA,
  accionMasiva,
  diasDeLaGrilla,
  estadoDelDia,
  mesDe,
  moverMes,
  nombreDelMes,
  proximosCambios,
  rangoDeFechas,
  tocarDia,
  turnosDelDia,
  type Accion,
  type AccionMasiva,
  type FuentesDelDia,
  type ModoSeleccion,
  type Seleccion,
} from '../lib/calendarioPanel';
import { diaDelHorario, feriadoPrecargado, leerMotivo, resumenDeCupos } from '../lib/cupos';
import { diaConMes, diaCortoConMes, hoyEnLaRioja } from '../lib/fechas';
import { CalendarioMes } from './CalendarioMes';
import { DetalleDia } from './DetalleDia';
import { useMontado } from './dialogo';
import { Contador, ErrorCampo } from './ErroresFormulario';
import { HorarioHabitual } from './HorarioHabitual';
import { useDisponibilidadPanel } from './useDisponibilidadPanel';
import { useOcupadosDelMes } from './useOcupadosDelMes';
import { useConsulta } from './usePantallaAncha';
import type { Problema } from './useUsuarios';

interface Props {
  /** superadmin y admin (puedeEditarDisponibilidad); el empleado ve todo sin controles. */
  editable: boolean;
  alVencerSesion: (mensaje: string) => void;
}

/** Desde acá el detalle del día va al costado del calendario; debajo, en una hoja que sube desde abajo. */
const CONSULTA_ANCHA = '(min-width: 900px)';

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);
const dias = (n: number) => (n === 1 ? '1 día' : `${String(n)} días`);

/** "del 15 al 22 de enero", "3 días sueltos"… para decir qué quedó elegido. */
function resumenSeleccion(fechas: readonly string[]): string {
  if (fechas.length === 0) return 'Ningún día elegido';
  const primero = fechas[0] ?? '';
  const ultimo = fechas.at(-1) ?? '';
  if (fechas.length === 1) return conMayuscula(diaConMes(primero));
  const deCorrido = rangoDeFechas(primero, ultimo).length === fechas.length;
  return deCorrido
    ? `${dias(fechas.length)}: del ${diaCortoConMes(primero)} al ${diaCortoConMes(ultimo)}`
    : `${dias(fechas.length)} sueltos`;
}

interface Progreso {
  tipo: AccionMasiva;
  total: number;
  hechos: number;
  errores: Readonly<Record<string, string>>;
  terminado: boolean;
}

/**
 * Disponibilidad como calendario: el mes de un vistazo (abierto con sus lugares por franja, cerrado, feriado,
 * cambiado a mano) y, al tocar un día, su detalle para abrirlo o cerrarlo y cambiar los cupos. "Elegir varios días"
 * cierra o abre un rango (vacaciones) de una vez. El horario habitual (la semana de siempre) queda como ajuste aparte.
 * El formulario público solo deja pedir lo que queda disponible acá.
 */
export function VistaDisponibilidad({ editable, alVencerSesion }: Props) {
  const d = useDisponibilidadPanel(alVencerSesion);
  const [hoy] = useState(() => hoyEnLaRioja(new Date()));
  const ancha = useConsulta(CONSULTA_ANCHA);
  const montado = useMontado();
  const idMes = useId();
  const idDetalle = useId();
  const idMotivo = useId();

  const [mes, setMes] = useState(() => mesDe(hoy));
  const [foco, setFoco] = useState(hoy);
  const [elegido, setElegido] = useState(hoy);
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const hojaRef = useRef<HTMLDialogElement>(null);

  const [varios, setVarios] = useState(false);
  const [modo, setModo] = useState<ModoSeleccion>('rango');
  const [seleccion, setSeleccion] = useState<Seleccion>(SELECCION_VACIA);
  const [motivoVarios, setMotivoVarios] = useState('');
  const [errorMotivoVarios, setErrorMotivoVarios] = useState<string | undefined>();
  const [progreso, setProgreso] = useState<Progreso | null>(null);

  const [recargaMes, setRecargaMes] = useState(0);
  const fechas = diasDeLaGrilla(mes);
  const ocupados = useOcupadosDelMes(fechas[0] ?? hoy, fechas.at(-1) ?? hoy, recargaMes, alVencerSesion);

  // En pantalla ancha no hay hoja: si se gira el celular o se agranda la ventana con la hoja abierta, se cierra.
  useEffect(() => {
    if (ancha) hojaRef.current?.close();
  }, [ancha]);

  const datos = d.datos;
  const fuentes: FuentesDelDia | null = datos
    ? {
        hoy,
        horario: datos.horarioSemanal,
        especiales: new Map(datos.diasEspeciales.map((e) => [e.fecha, e] as const)),
        cupos: ocupados.cupos,
      }
    : null;
  const estados = fuentes ? fechas.map((f) => estadoDelDia(f, fuentes)) : [];
  const aplicando = progreso !== null && !progreso.terminado;

  const recargarTodo = () => {
    d.recargar();
    setRecargaMes((n) => n + 1);
  };

  const irAMes = (nuevo: string, dia?: string) => {
    const destino = dia ?? (mesDe(hoy) === nuevo ? hoy : `${nuevo}-01`);
    setMes(nuevo);
    setFoco(destino);
    if (ancha && !varios) setElegido(destino);
  };

  const moverFoco = (fecha: string) => {
    setFoco(fecha);
    if (!diasDeLaGrilla(mes).includes(fecha)) setMes(mesDe(fecha));
  };

  const abrirDia = (fecha: string) => {
    setElegido(fecha);
    if (!ancha) {
      setHojaAbierta(true);
      hojaRef.current?.showModal();
    }
  };

  const tocar = (fecha: string) => {
    if (varios) {
      if (aplicando) return;
      if (progreso?.terminado) setProgreso(null);
      setSeleccion((s) => tocarDia(s, fecha, modo, hoy));
      return;
    }
    abrirDia(fecha);
  };

  const aplicarDia =
    (fecha: string) =>
    async (accion: Accion): Promise<Problema | null> => {
      let problema: Problema | null = null;
      if (accion.tipo === 'guardar') {
        problema = await d.guardarDia(fecha, accion.cambio, `Se guardó el ${diaConMes(fecha)}.`);
      } else if (accion.tipo === 'quitar') {
        problema = await d.quitarDia(fecha, `El ${diaConMes(fecha)} volvió al horario habitual.`);
      }
      if (!problema && !ancha) hojaRef.current?.close();
      return problema;
    };

  const salirDeVarios = () => {
    setVarios(false);
    setSeleccion(SELECCION_VACIA);
    setProgreso(null);
    setErrorMotivoVarios(undefined);
  };

  const elegidas = [...seleccion.fechas].sort();

  const aplicarVarios = async (tipo: AccionMasiva) => {
    if (!fuentes || elegidas.length === 0) return;
    const motivo = leerMotivo(motivoVarios);
    if ('error' in motivo) {
      setErrorMotivoVarios(motivo.error);
      document.getElementById(idMotivo)?.focus();
      return;
    }
    setErrorMotivoVarios(undefined);
    const errores: Record<string, string> = {};
    let hechos = 0;
    setProgreso({ tipo, total: elegidas.length, hechos, errores: {}, terminado: false });
    // Uno por uno: si alguno falla, los demás siguen y lo que salió bien queda guardado.
    for (const fecha of elegidas) {
      const accion = accionMasiva(tipo, estadoDelDia(fecha, fuentes), fuentes.horario, motivoVarios);
      let problema: Problema | null = null;
      if (accion.tipo === 'guardar') problema = await d.guardarDia(fecha, accion.cambio, '');
      else if (accion.tipo === 'quitar') problema = await d.quitarDia(fecha, '');
      if (!montado.current) return;
      hechos += 1;
      if (problema) errores[fecha] = problema.mensaje;
      setProgreso({ tipo, total: elegidas.length, hechos, errores: { ...errores }, terminado: false });
    }
    const fallados = Object.keys(errores).sort();
    const bien = elegidas.length - fallados.length;
    setProgreso({ tipo, total: elegidas.length, hechos, errores, terminado: true });
    // Quedan elegidos solo los que fallaron, para reintentar.
    setSeleccion({ fechas: new Set(fallados), ancla: null });
    d.avisar(
      `${tipo === 'cerrar' ? 'Se cerraron' : 'Se abrieron'} ${dias(bien)}.` +
        (fallados.length > 0 ? ` ${dias(fallados.length)} no se pudieron guardar: siguen elegidos para reintentar.` : ''),
    );
  };

  const elegidoEstado = fuentes ? estadoDelDia(elegido, fuentes) : null;
  const semanalDe = (fecha: string) => datos?.horarioSemanal.find((h) => h.dia === diaDelHorario(fecha));
  const claveDetalle = (fecha: string) =>
    `${fecha}|${JSON.stringify(datos?.diasEspeciales.find((e) => e.fecha === fecha) ?? null)}|${JSON.stringify(semanalDe(fecha) ?? null)}`;

  const detalle = (idTitulo: string) =>
    elegidoEstado &&
    datos && (
      <DetalleDia
        key={claveDetalle(elegido)}
        estado={elegidoEstado}
        hoy={hoy}
        horario={datos.horarioSemanal}
        editable={editable}
        idTitulo={idTitulo}
        alAplicar={aplicarDia(elegido)}
      />
    );

  const panelVarios = (
    <section className="varios" aria-labelledby={`${idMes}-varios`}>
      <h2 id={`${idMes}-varios`} className="varios__titulo">
        Elegir varios días
      </h2>
      <fieldset className="varios__modo" disabled={aplicando}>
        <legend className="visualmente-oculto">Cómo elegir</legend>
        {(
          [
            ['rango', 'De corrido'],
            ['sueltos', 'Sueltos'],
          ] as const
        ).map(([valor, texto]) => (
          <label key={valor} className="varios__opcion">
            <input
              type="radio"
              name={`${idMes}-modo`}
              checked={modo === valor}
              onChange={() => {
                setModo(valor);
                setSeleccion((s) => ({ ...s, ancla: null }));
              }}
            />
            {texto}
          </label>
        ))}
      </fieldset>
      <p className="varios__ayuda" aria-live="polite">
        {modo === 'rango'
          ? seleccion.ancla
            ? 'Ahora tocá el último día.'
            : 'Tocá el primer día y después el último.'
          : 'Tocá cada día que quieras sumar o sacar.'}
      </p>
      <p className="varios__resumen" aria-live="polite">
        {resumenSeleccion(elegidas)}
      </p>

      <div className="campo">
        <label className="campo__etiqueta" htmlFor={idMotivo}>
          Motivo <span className="campo__opcional">(opcional)</span>
        </label>
        <input
          id={idMotivo}
          className="entrada"
          type="text"
          maxLength={MOTIVO_MAXIMO}
          placeholder="Ej.: Vacaciones"
          value={motivoVarios}
          disabled={aplicando}
          aria-invalid={errorMotivoVarios ? true : undefined}
          aria-describedby={errorMotivoVarios ? `${idMotivo}-error` : `${idMotivo}-ayuda`}
          onChange={(evento) => {
            setMotivoVarios(evento.target.value);
          }}
        />
        <p id={`${idMotivo}-ayuda`} className="campo__ayuda servicio-form__ayuda-fila">
          Se guarda en cada día elegido.
          <Contador valor={motivoVarios} max={MOTIVO_MAXIMO} />
        </p>
        <ErrorCampo id={`${idMotivo}-error`} mensaje={errorMotivoVarios} />
      </div>

      {fuentes && elegidas.some((f) => turnosDelDia(estadoDelDia(f, fuentes)) > 0) && (
        <p className="fecha-turno__aviso">
          <Icono nombre="alerta" tamano={18} />
          Hay días elegidos que ya tienen turnos: si los cerrás, no se cancelan; solo dejan de recibir pedidos nuevos.
        </p>
      )}

      <div className="varios__acciones">
        <button
          type="button"
          className="boton boton--primario boton--chico"
          disabled={elegidas.length === 0 || aplicando}
          onClick={() => {
            void aplicarVarios('cerrar');
          }}
        >
          <Icono nombre="cerrado" tamano={18} />
          Cerrar {elegidas.length > 0 ? dias(elegidas.length) : 'los días'}
        </button>
        <button
          type="button"
          className="boton boton--secundario boton--chico"
          disabled={elegidas.length === 0 || aplicando}
          onClick={() => {
            void aplicarVarios('abrir');
          }}
        >
          Abrir {elegidas.length > 0 ? dias(elegidas.length) : 'los días'}
        </button>
        <button
          type="button"
          className="boton boton--fantasma boton--chico"
          disabled={elegidas.length === 0 || aplicando}
          onClick={() => {
            setSeleccion(SELECCION_VACIA);
            setProgreso(null);
          }}
        >
          Desmarcar
        </button>
      </div>
      <p className="campo__ayuda">Abrir usa los cupos del horario habitual de cada día (2 y 2 si ese día no se atiende).</p>

      {progreso && (
        <div className="varios__progreso" role="status">
          <p>
            {progreso.terminado
              ? `Listo: ${String(progreso.total - Object.keys(progreso.errores).length)} de ${String(progreso.total)} guardados.`
              : `Guardando ${String(progreso.hechos)} de ${String(progreso.total)}…`}
          </p>
          <progress max={progreso.total} value={progreso.hechos} aria-hidden="true" />
          {Object.keys(progreso.errores).length > 0 && (
            <ul role="list" className="varios__errores">
              {Object.entries(progreso.errores).map(([fecha, mensaje]) => (
                <li key={fecha}>
                  <Icono nombre="alerta" tamano={16} />
                  <span>
                    <strong>{conMayuscula(diaConMes(fecha))}:</strong> {mensaje}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );

  const proximos = datos ? proximosCambios(datos.diasEspeciales, hoy) : [];

  const irADia = (especial: DiaEspecial) => {
    if (varios) salirDeVarios();
    setMes(mesDe(especial.fecha));
    setFoco(especial.fecha);
    abrirDia(especial.fecha);
    if (ancha) requestAnimationFrame(() => document.getElementById(idDetalle)?.focus());
  };

  return (
    <section className="panel__vista disponibilidad" aria-labelledby="titulo-disponibilidad">
      <div className="panel__encabezado">
        <h1 id="titulo-disponibilidad" className="panel__titulo" tabIndex={-1}>
          Disponibilidad
        </h1>
        <button type="button" className="boton boton--secundario boton--chico" disabled={d.cargando} onClick={recargarTodo}>
          <Icono nombre="refrescar" tamano={18} />
          Actualizar
        </button>
      </div>
      <p className="usuarios__ayuda">
        {editable
          ? 'Tocá un día para abrirlo, cerrarlo o cambiar cuántos turnos entran. La web solo deja pedir días abiertos con lugar.'
          : 'Lo que ves acá es lo que la web deja pedir. Para cambiarlo, pedíselo a un admin.'}
      </p>

      <div className="panel__estado" aria-live="polite">
        {d.cargando && <p>Cargando la disponibilidad…</p>}
        {!d.cargando && d.aviso && <p className="panel__conteo">{d.aviso}</p>}
      </div>

      {d.cargando && <div className="turno turno--esqueleto disponibilidad__esqueleto" aria-hidden="true" />}

      {d.error && (
        <div className="panel__error" role="alert">
          <Icono nombre="alerta" tamano={22} />
          <div>
            <p>No pudimos cargar la disponibilidad. {d.error}</p>
            <button type="button" className="boton boton--primario boton--chico" onClick={recargarTodo}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {datos && (
        <>
          <div className={ancha ? 'disponibilidad__cuerpo disponibilidad__cuerpo--ancho' : 'disponibilidad__cuerpo'}>
            <div className="disponibilidad__mes">
              <div className="disponibilidad__barra">
                <nav className="disponibilidad__navegacion" aria-label="Meses">
                  <button
                    type="button"
                    className="boton-icono"
                    aria-label="Mes anterior"
                    onClick={() => {
                      irAMes(moverMes(mes, -1));
                    }}
                  >
                    <Icono nombre="izquierda" tamano={20} />
                  </button>
                  <h2 id={idMes} className="disponibilidad__nombre-mes" aria-live="polite">
                    {nombreDelMes(mes)}
                  </h2>
                  <button
                    type="button"
                    className="boton-icono"
                    aria-label="Mes siguiente"
                    onClick={() => {
                      irAMes(moverMes(mes, 1));
                    }}
                  >
                    <Icono nombre="derecha" tamano={20} />
                  </button>
                  <button
                    type="button"
                    className="boton boton--secundario boton--chico"
                    aria-label={mes === mesDe(hoy) ? 'Hoy' : 'Volver al mes de hoy'}
                    onClick={() => {
                      irAMes(mesDe(hoy), hoy);
                    }}
                  >
                    Hoy
                  </button>
                </nav>
                {editable && (
                  <button
                    type="button"
                    className="boton boton--secundario boton--chico"
                    aria-pressed={varios}
                    disabled={aplicando}
                    onClick={() => {
                      if (varios) salirDeVarios();
                      else {
                        hojaRef.current?.close();
                        setVarios(true);
                      }
                    }}
                  >
                    <Icono nombre={varios ? 'check' : 'calendario'} tamano={18} />
                    {varios ? 'Terminar de elegir' : 'Elegir varios días'}
                  </button>
                )}
              </div>

              {ocupados.error && (
                <div className="disponibilidad__aviso" role="status">
                  <Icono nombre="alerta" tamano={18} />
                  <p>
                    No pudimos traer los turnos de este mes: el calendario muestra los cupos sin contar lo agendado.{' '}
                    <button
                      type="button"
                      className="boton-texto"
                      onClick={() => {
                        setRecargaMes((n) => n + 1);
                      }}
                    >
                      Reintentar
                    </button>
                  </p>
                </div>
              )}

              <CalendarioMes
                mes={mes}
                idTitulo={idMes}
                estados={estados}
                foco={foco}
                elegidos={varios ? seleccion.fechas : ancha ? new Set([elegido]) : new Set()}
                varios={varios}
                ancla={varios ? seleccion.ancla : null}
                alMoverFoco={moverFoco}
                alTocar={tocar}
              />

              <ul role="list" className="leyenda" aria-label="Referencias">
                <li>
                  <span className="leyenda__muestra leyenda__muestra--lugares" aria-hidden="true">
                    <span className="cal__lugar cal__lugar--ocupado" />
                    <span className="cal__lugar" />
                  </span>
                  Arriba la mañana, abajo la tarde: cada rayita es un turno; las llenas, ocupados
                </li>
                <li>
                  <span className="leyenda__muestra leyenda__muestra--cerrado" aria-hidden="true" />
                  Cerrado
                </li>
                <li>
                  <Rombo className="leyenda__rombo" />
                  Cambiado a mano
                </li>
              </ul>
            </div>

            {ancha && (
              <aside className="disponibilidad__lado" aria-label={varios ? 'Elegir varios días' : 'Detalle del día'}>
                {varios ? panelVarios : detalle(idDetalle)}
              </aside>
            )}
            {!ancha && varios && panelVarios}
          </div>

          <details className="plegable">
            <summary className="plegable__titulo">
              <span>Horario habitual</span>
              <span className="plegable__resumen">{editable ? 'Cambiar' : 'Ver'}</span>
              <Icono nombre="abajo" tamano={20} className="plegable__flecha" />
            </summary>
            <div className="plegable__cuerpo">
              <p className="usuarios__ayuda">
                Lo que rige cada semana. Un día que cambies en el calendario gana sobre esto.
              </p>
              <HorarioHabitual
                key={JSON.stringify(datos.horarioSemanal)}
                horario={datos.horarioSemanal}
                editable={editable}
                alGuardar={d.guardarHorario}
              />
            </div>
          </details>

          <details className="plegable">
            <summary className="plegable__titulo">
              <span>Próximos cambios</span>
              <span className="plegable__resumen">{proximos.length === 0 ? 'Ninguno' : dias(proximos.length)}</span>
              <Icono nombre="abajo" tamano={20} className="plegable__flecha" />
            </summary>
            <div className="plegable__cuerpo">
              {proximos.length === 0 ? (
                <p className="usuarios__ayuda">No hay días cambiados de hoy en adelante: rige el horario habitual.</p>
              ) : (
                <>
                  <p className="usuarios__ayuda">
                    Ya están cargados cerrados los feriados nacionales inamovibles. Los trasladables y los puentes los fija
                    el gobierno cada año: cuando se publiquen, cerralos en el calendario.
                  </p>
                  <ul role="list" className="proximos">
                    {proximos.map((especial) => {
                      const feriado = feriadoPrecargado(especial.motivo);
                      return (
                        <li key={especial.fecha}>
                          <button
                            type="button"
                            className="proximos__dia"
                            onClick={() => {
                              irADia(especial);
                            }}
                          >
                            <span className="proximos__fecha">{conMayuscula(diaConMes(especial.fecha))}</span>
                            <span className="proximos__detalle">
                              {resumenDeCupos(especial.abierto, especial.cupoManana, especial.cupoTarde)}
                              {feriado ? ` · Feriado: ${feriado.nombre}` : especial.motivo ? ` · ${especial.motivo}` : ''}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </details>
        </>
      )}

      <dialog
        ref={hojaRef}
        className="confirmar hoja-dia"
        aria-labelledby={`${idDetalle}-hoja`}
        onClose={() => {
          setHojaAbierta(false);
        }}
      >
        <div className="detalle-turno__barra">
          <p className="detalle-turno__cuando">Detalle del día</p>
          <button type="button" className="boton-icono" aria-label="Cerrar el detalle" onClick={() => hojaRef.current?.close()}>
            <Icono nombre="cerrar" tamano={20} />
          </button>
        </div>
        {hojaAbierta && <div className="hoja-dia__cuerpo">{detalle(`${idDetalle}-hoja`)}</div>}
      </dialog>
    </section>
  );
}
