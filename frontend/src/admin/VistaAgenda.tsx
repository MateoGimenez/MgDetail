import { useRef, useState, type KeyboardEvent } from 'react';
import { ETIQUETA_FRANJA, FRANJAS, type Franja, type Turno } from '../api/contract';
import { type Rol } from '../api/contract-panel';
import { SubrayadoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { agruparPorDia, cantidadDelDia, estaEnAgenda, lugarEnAgenda, textoCantidad, type Celda } from '../lib/agenda';
import { lugaresDeFranja, textoLugares, textoLugaresLargo, type LugaresDeFranja } from '../lib/cupos';
import {
  diaConMes,
  diasDeLaSemana,
  hoyEnLaRioja,
  lunesDeLaSemana,
  nombreCortoDelDia,
  nombreDeLaSemana,
  numeroDelDia,
  sumarDias,
} from '../lib/fechas';
import { DialogoEliminar } from './DialogoEliminar';
import { DialogoHistorial } from './DialogoHistorial';
import { FichaAgenda } from './FichaAgenda';
import { devolverFoco, selectorDeFicha } from './foco';
import { TarjetaTurno } from './TarjetaTurno';
import { EsqueletoAgenda } from './Esqueleto';
import { useAgenda } from './useAgenda';
import { esNueva } from './useTurnos';

interface Props {
  rol: Rol;
  /** Nombre legible de un servicio (catálogo del panel, respaldo o el id tal cual). */
  nombreServicio: (id: string) => string;
  alVencerSesion: (mensaje: string) => void;
}

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/**
 * Agenda de la semana (lunes a domingo, hora de La Rioja). En el celular: tira de días y, abajo, los turnos del
 * día elegido por franja. En pantalla ancha: grilla de 7 días × 2 franjas. Tocar un turno abre su detalle con las
 * mismas acciones que la tarjeta de Turnos, más Reprogramar.
 */
export function VistaAgenda({ rol, nombreServicio, alVencerSesion }: Props) {
  const [hoy] = useState(() => hoyEnLaRioja(new Date()));
  const [lunes, setLunes] = useState(() => lunesDeLaSemana(hoy));
  const [diaElegido, setDiaElegido] = useState(hoy);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<Turno | null>(null);
  const detalleRef = useRef<HTMLDialogElement>(null);
  const eliminarRef = useRef<HTMLDialogElement>(null);
  const historialRef = useRef<HTMLDialogElement>(null);
  const [historialDe, setHistorialDe] = useState<Turno | null>(null);
  const tiraRef = useRef<HTMLUListElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const a = useAgenda(lunes, alVencerSesion);

  const dias = diasDeLaSemana(lunes);
  const grupos = a.turnos ? agruparPorDia(a.turnos, dias) : null;
  const total = grupos ? dias.reduce((suma, dia) => suma + cantidadDelDia(grupos.get(dia)), 0) : 0;
  const sinConfirmar = grupos
    ? dias.reduce((suma, dia) => suma + FRANJAS.reduce((n, f) => n + (grupos.get(dia)?.[f].filter((t) => t.estado === 'pendiente').length ?? 0), 0), 0)
    : 0;
  const nombreSemana = nombreDeLaSemana(lunes);
  const esEstaSemana = dias.includes(hoy);
  const abierto = abiertoId ? (a.turnos?.find((t) => t.id === abiertoId) ?? null) : null;
  const hayCupos = a.cupos.size > 0;
  const cerrado = (dia: string) => a.cupos.get(dia)?.abierto === false;
  /**
   * Cupo de una franja. Los ocupados se cuentan con los turnos que muestra la agenda (los mismos que cuenta el
   * backend): así el "2/3" sigue al día después de confirmar, reprogramar o cancelar sin recargar.
   */
  const lugares = (dia: string, franja: Franja): LugaresDeFranja | null => {
    const cupo = a.cupos.get(dia);
    return cupo ? lugaresDeFranja(cupo, franja, grupos?.get(dia)?.[franja].length ?? 0) : null;
  };
  const claseLugares = (l: LugaresDeFranja | null) =>
    l === null ? '' : l.cerrada ? ' cupo--cerrado' : l.llena ? ' cupo--lleno' : '';

  const moverSemana = (semanas: number) => {
    setLunes((l) => sumarDias(l, 7 * semanas));
    // Se mantiene el mismo día de la semana: de un jueves se pasa al jueves siguiente.
    setDiaElegido((d) => sumarDias(d, 7 * semanas));
  };

  const irAHoy = () => {
    setLunes(lunesDeLaSemana(hoy));
    setDiaElegido(hoy);
  };

  const abrir = (turno: Turno) => {
    setAbiertoId(turno.id);
    detalleRef.current?.showModal();
  };

  /** Flechas izquierda/derecha, Inicio y Fin recorren los días de la tira. */
  const teclaEnTira = (evento: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const destino =
      evento.key === 'ArrowRight'
        ? indice + 1
        : evento.key === 'ArrowLeft'
          ? indice - 1
          : evento.key === 'Home'
            ? 0
            : evento.key === 'End'
              ? 6
              : null;
    if (destino === null || destino < 0 || destino > 6) return;
    evento.preventDefault();
    const dia = dias[destino];
    if (!dia) return;
    setDiaElegido(dia);
    tiraRef.current?.querySelectorAll<HTMLButtonElement>('button')[destino]?.focus();
  };

  /** Lo que conviene avisar en el detalle después de un cambio que saca al turno de la vista. */
  const avisoDe = (turno: Turno): string | null => {
    if (!a.cambiadas.has(turno.id)) return null;
    if (!estaEnAgenda(turno)) return 'Quedó cancelado: ya no ocupa lugar en la agenda.';
    const { fecha, franja } = lugarEnAgenda(turno);
    const donde = `${diaConMes(fecha)}, ${ETIQUETA_FRANJA[franja].toLowerCase()}`;
    return dias.includes(fecha) ? `Listo. Queda para el ${donde}.` : `Listo. Queda para el ${donde}, en otra semana.`;
  };

  const ficha = (turno: Turno) => (
    <li key={turno.id}>
      <FichaAgenda
        turno={turno}
        nombreServicio={nombreServicio(turno.servicioId)}
        cambiada={a.cambiadas.has(turno.id)}
        alAbrir={() => {
          abrir(turno);
        }}
      />
    </li>
  );

  const celdaElegida: Celda | undefined = grupos?.get(diaElegido);

  return (
    <>
      <section className="panel__vista agenda" aria-labelledby="titulo-agenda">
        <div className="panel__encabezado">
          <h1 id="titulo-agenda" ref={tituloRef} className="panel__titulo" tabIndex={-1}>
            Agenda
          </h1>
          <button type="button" className="boton boton--secundario boton--chico" disabled={a.cargando} onClick={a.recargar}>
            <Icono nombre="refrescar" tamano={18} />
            Actualizar
          </button>
        </div>

        <nav className="agenda__navegacion" aria-label="Semanas">
          <button
            type="button"
            className="boton-icono"
            aria-label="Semana anterior"
            onClick={() => {
              moverSemana(-1);
            }}
          >
            <Icono nombre="izquierda" tamano={20} />
          </button>
          <h2 className="agenda__semana">
            <span className="visualmente-oculto">Semana del </span>
            {nombreSemana}
          </h2>
          <button
            type="button"
            className="boton-icono"
            aria-label="Semana siguiente"
            onClick={() => {
              moverSemana(1);
            }}
          >
            <Icono nombre="derecha" tamano={20} />
          </button>
          <button
            type="button"
            className="boton boton--secundario boton--chico agenda__hoy"
            aria-label={esEstaSemana ? 'Hoy' : 'Volver a la semana de hoy'}
            onClick={irAHoy}
          >
            Hoy
          </button>
        </nav>

        <div className="panel__estado" aria-live="polite">
          {a.cargando && <p className="panel__cargando">Cargando la agenda…</p>}
          {!a.cargando && grupos && total === 0 && hayCupos && <p className="panel__conteo">No hay turnos esta semana.</p>}
          {!a.cargando && grupos && total > 0 && (
            <p className="panel__conteo">
              {textoCantidad(total)} esta semana
              {sinConfirmar > 0 && ` · ${String(sinConfirmar)} sin confirmar`}
            </p>
          )}
        </div>

        {a.cargando && <EsqueletoAgenda />}

        {a.error && (
          <div className="panel__error" role="alert">
            <Icono nombre="alerta" tamano={22} />
            <div>
              <p>No pudimos cargar la agenda. {a.error}</p>
              <button type="button" className="boton boton--primario boton--chico" onClick={a.recargar}>
                Reintentar
              </button>
            </div>
          </div>
        )}

        {grupos && total === 0 && !hayCupos && (
          <div className="panel__vacio" role="status">
            <p>No hay turnos esta semana.</p>
          </div>
        )}

        {grupos && (total > 0 || hayCupos) && (
          <>
            {/* Celular: tira de días + el día elegido. */}
            <div className="agenda__celular">
              <ul ref={tiraRef} role="list" className="tira" aria-label="Días de la semana">
                {dias.map((dia, i) => {
                  const cantidad = cantidadDelDia(grupos.get(dia));
                  const elegido = dia === diaElegido;
                  return (
                    <li key={dia}>
                      <button
                        type="button"
                        className={[
                          'tira__dia',
                          elegido ? 'tira__dia--elegido seleccionado' : '',
                          dia === hoy ? 'tira__dia--hoy' : '',
                          dia < hoy ? 'tira__dia--pasado' : '',
                          cerrado(dia) ? 'tira__dia--cerrado' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-pressed={elegido}
                        tabIndex={elegido || (!dias.includes(diaElegido) && i === 0) ? 0 : -1}
                        onClick={() => {
                          setDiaElegido(dia);
                        }}
                        onKeyDown={(evento) => {
                          teclaEnTira(evento, i);
                        }}
                      >
                        <span className="tira__nombre" aria-hidden="true">
                          {dia === hoy ? 'Hoy' : nombreCortoDelDia(dia)}
                        </span>
                        <span className="tira__numero" aria-hidden="true">
                          {numeroDelDia(dia)}
                        </span>
                        <span className={cantidad > 0 ? 'tira__punto' : 'tira__punto tira__punto--vacio'} aria-hidden="true" />
                        <span className="visualmente-oculto">
                          {conMayuscula(diaConMes(dia))}
                          {dia === hoy ? ', hoy' : ''}
                          {cerrado(dia) ? ', cerrado' : ''}: {cantidad > 0 ? textoCantidad(cantidad) : 'sin turnos'}
                        </span>
                        {elegido && <SubrayadoFilete className="tira__trazo" />}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="agenda__dia">
                <h3 className="agenda__dia-titulo">
                  {conMayuscula(diaConMes(diaElegido))}
                  {diaElegido === hoy && <span className="agenda__marca-hoy">Hoy</span>}
                  {cerrado(diaElegido) && <span className="agenda__marca-cerrado">Cerrado</span>}
                </h3>
                {FRANJAS.map((franja) => {
                  const turnos = celdaElegida?.[franja] ?? [];
                  const l = lugares(diaElegido, franja);
                  return (
                    <div key={franja} className={`agenda__franja${claseLugares(l)}`}>
                      <h4 className="agenda__franja-titulo">
                        {ETIQUETA_FRANJA[franja]}
                        {l ? (
                          <span className="agenda__cuenta agenda__cupo">
                            <span aria-hidden="true">{textoLugares(l)}</span>
                            <span className="visualmente-oculto">{textoLugaresLargo(l)}</span>
                          </span>
                        ) : (
                          <span className="agenda__cuenta">{textoCantidad(turnos.length)}</span>
                        )}
                      </h4>
                      {turnos.length > 0 ? (
                        <ul role="list" className="agenda__fichas">
                          {turnos.map(ficha)}
                        </ul>
                      ) : (
                        <p className="agenda__libre">Nada agendado.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pantalla ancha: grilla semanal. */}
            <div className="agenda__ancha">
              <table className="grilla">
                <caption className="visualmente-oculto">
                  Turnos de la semana del {nombreSemana}, por día y franja
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="grilla__esquina">
                      <span className="visualmente-oculto">Franja</span>
                    </th>
                    {dias.map((dia) => (
                      <th
                        key={dia}
                        scope="col"
                        className={['grilla__dia', dia === hoy ? 'grilla__dia--hoy' : '', dia < hoy ? 'grilla__dia--pasado' : '']
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <span className="grilla__nombre" aria-hidden="true">
                          {nombreCortoDelDia(dia)}
                        </span>
                        <span className="grilla__numero" aria-hidden="true">
                          {numeroDelDia(dia)}
                        </span>
                        {dia === hoy && (
                          <span className="grilla__hoy" aria-hidden="true">
                            Hoy
                          </span>
                        )}
                        {cerrado(dia) && (
                          <span className="grilla__cerrado" aria-hidden="true">
                            Cerrado
                          </span>
                        )}
                        <span className="visualmente-oculto">
                          {conMayuscula(diaConMes(dia))}
                          {dia === hoy ? ', hoy' : ''}
                          {cerrado(dia) ? ', cerrado' : ''}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FRANJAS.map((franja) => (
                    <tr key={franja}>
                      <th scope="row" className="grilla__franja">
                        {ETIQUETA_FRANJA[franja]}
                      </th>
                      {dias.map((dia) => {
                        const turnos = grupos.get(dia)?.[franja] ?? [];
                        const l = lugares(dia, franja);
                        return (
                          <td
                            key={dia}
                            className={
                              ['grilla__celda', dia === hoy ? 'grilla__celda--hoy' : '', dia < hoy ? 'grilla__celda--pasado' : '']
                                .filter(Boolean)
                                .join(' ') + claseLugares(l)
                            }
                          >
                            {l && (
                              <span className="grilla__cuenta grilla__cupo">
                                <span aria-hidden="true">{textoLugares(l)}</span>
                                <span className="visualmente-oculto">{textoLugaresLargo(l)}</span>
                              </span>
                            )}
                            {turnos.length > 0 ? (
                              <>
                                {!l && <span className="grilla__cuenta">{textoCantidad(turnos.length)}</span>}
                                <ul role="list" className="agenda__fichas">
                                  {turnos.map(ficha)}
                                </ul>
                              </>
                            ) : (
                              <span className="grilla__vacia">
                                <span aria-hidden="true">—</span>
                                <span className="visualmente-oculto">Sin turnos</span>
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <dialog
        ref={detalleRef}
        className="confirmar detalle-turno"
        aria-labelledby="detalle-turno-titulo"
        onClose={() => {
          const cerrado = abiertoId;
          setAbiertoId(null);
          if (cerrado === null) return;
          // Después de que el navegador intente devolver el foco y React vuelva a dibujar la grilla.
          requestAnimationFrame(() => {
            const activo = document.activeElement;
            devolverFoco(
              document,
              selectorDeFicha(cerrado),
              tituloRef.current,
              activo === null || activo === document.body || !activo.isConnected,
            );
          });
        }}
      >
        <div className="detalle-turno__barra">
          <p className="detalle-turno__cuando">
            {abierto &&
              `${conMayuscula(diaConMes(lugarEnAgenda(abierto).fecha))} · ${ETIQUETA_FRANJA[lugarEnAgenda(abierto).franja]}`}
          </p>
          <button
            type="button"
            className="boton-icono"
            aria-label="Cerrar el detalle"
            onClick={() => detalleRef.current?.close()}
          >
            <Icono nombre="cerrar" tamano={20} />
          </button>
        </div>
        {abierto && (
          <TarjetaTurno
            key={abierto.id}
            turno={abierto}
            rol={rol}
            nombreServicio={nombreServicio(abierto.servicioId)}
            nueva={esNueva(abierto)}
            cambiada={false}
            aviso={avisoDe(abierto)}
            ocupada={a.ocupadas.has(abierto.id)}
            error={a.erroresPorTurno[abierto.id]}
            alCambiar={(cambios) => a.cambiar(abierto, cambios)}
            alEliminar={() => {
              setAEliminar(abierto);
              eliminarRef.current?.showModal();
            }}
            alVerHistorial={() => {
              setHistorialDe(abierto);
              historialRef.current?.showModal();
            }}
            idTitulo="detalle-turno-titulo"
            nivelTitulo={2}
          />
        )}
      </dialog>

      <DialogoEliminar
        dialogoRef={eliminarRef}
        turno={aEliminar}
        alConfirmar={async (turno) => {
          const problema = await a.eliminar(turno);
          if (!problema) detalleRef.current?.close();
          return problema;
        }}
        alCerrar={() => {
          setAEliminar(null);
        }}
      />

      <DialogoHistorial
        dialogoRef={historialRef}
        origen={historialDe}
        nombreServicio={nombreServicio}
        alVencerSesion={alVencerSesion}
        respaldoFoco={tituloRef}
        alCerrar={() => {
          setHistorialDe(null);
        }}
      />
    </>
  );
}
