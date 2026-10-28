import { useEffect, useRef, useState } from 'react';
import {
  fijarMeta,
  listarMetas,
  obtenerMetaActual,
  quitarMeta,
  type FilaDeMeta,
  type ObjetivosDeMeta,
} from '../../api/finanzas';
import { Icono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import {
  etiquetaDelMes,
  fraseTrabajos,
  mesPermitidoParaMeta,
  situacionDeMes,
  sumarMeses,
} from '../../lib/finanzas';
import { bloquearEscape } from '../dialogo';
import { ErrorGeneral } from '../ErroresFormulario';
import { useAvisos } from '../toast/contexto';
import type { Problema } from '../useUsuarios';
import { BarraDeMeta } from './BarraDeMeta';
import { FormularioMeta } from './FormularioMeta';
import { HistorialDeMetas, SelloDeSituacion } from './HistorialDeMetas';
import { problemaDe } from './problema';
import { ResumenDeMeta } from './ResumenDeMeta';
import { useCarga } from './useCarga';

const pedirMetaActual = (_: undefined, signal: AbortSignal) => obtenerMetaActual(signal);
const pedirMetasDelAnio = (anio: number, signal: AbortSignal) => listarMetas(anio, signal);

interface Props {
  mes: string;
  mesActual: string;
  hoy: string;
  alVencerSesion: (mensaje: string) => void;
  alCambiarMes: (mes: string) => void;
  /** Se vuelve a pedir todo cuando cambia (Actualizar). */
  version: number;
}

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/**
 * Metas: la del mes que se mira (este mes, con barra, ritmo y proyección; otro mes, con lo logrado), fijar, cambiar
 * o quitar la meta, y el historial del año con cumplida / no cumplida.
 */
export function PestanaMetas({ mes, mesActual, hoy, alVencerSesion, alCambiarMes, version }: Props) {
  const avisos = useAvisos();
  const quitarRef = useRef<HTMLDialogElement>(null);
  const [editando, setEditando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [errorAlQuitar, setErrorAlQuitar] = useState<string | null>(null);
  const [ocupadoAlQuitar, setOcupadoAlQuitar] = useState(false);
  const [mesDelFormulario, setMesDelFormulario] = useState(mes);

  // Si se cambia de mes con el formulario abierto, se cierra: era de otro mes.
  if (mesDelFormulario !== mes) {
    setMesDelFormulario(mes);
    setEditando(false);
  }

  const esElMesActual = mes === mesActual;
  const anio = Number(mes.slice(0, 4));
  const actual = useCarga(pedirMetaActual, undefined, `actual|${String(version)}`, alVencerSesion, esElMesActual);
  const delAnio = useCarga(pedirMetasDelAnio, anio, `anio|${String(anio)}|${String(version)}`, alVencerSesion);

  useEffect(() => {
    if (quitando && !quitarRef.current?.open) quitarRef.current?.showModal();
  }, [quitando]);

  const fila: FilaDeMeta | null = delAnio.datos?.find((f) => f.mes === mes) ?? null;
  const objetivos: ObjetivosDeMeta | null = esElMesActual
    ? (actual.datos?.meta ?? null)
    : fila
      ? { ingresosObjetivo: fila.ingresosObjetivo, trabajosObjetivo: fila.trabajosObjetivo }
      : null;
  const sePuedeFijar = mesPermitidoParaMeta(mes, hoy);
  const nombreMes = etiquetaDelMes(mes);
  const cargandoLaMeta = esElMesActual ? actual.cargando && actual.datos === null : delAnio.cargando && delAnio.datos === null;
  const errorDeLaMeta = esElMesActual ? actual.error : delAnio.error;

  const recargarTodo = () => {
    actual.recargar();
    delAnio.recargar();
  };

  const guardar = async (nuevos: ObjetivosDeMeta): Promise<Problema | null> => {
    try {
      await fijarMeta(mes, nuevos);
      avisos.exito(objetivos ? `Listo, cambiaste la meta de ${nombreMes}.` : `Listo, fijaste la meta de ${nombreMes}.`);
      setEditando(false);
      recargarTodo();
      return null;
    } catch (error) {
      return problemaDe(error, alVencerSesion, 'No pudimos guardar la meta. Probá de nuevo.');
    }
  };

  const quitar = async () => {
    setErrorAlQuitar(null);
    setOcupadoAlQuitar(true);
    try {
      await quitarMeta(mes);
      avisos.exito(`Listo, quitaste la meta de ${nombreMes}.`);
      quitarRef.current?.close();
      recargarTodo();
    } catch (error) {
      const problema = problemaDe(error, alVencerSesion, 'No pudimos quitar la meta. Probá de nuevo.');
      if (problema) setErrorAlQuitar(problema.mensaje);
    } finally {
      setOcupadoAlQuitar(false);
    }
  };

  return (
    <div className="meta-tab">
      <section className="meta-tarjeta" aria-labelledby="meta-tarjeta-titulo" aria-busy={cargandoLaMeta}>
        <div className="meta-tarjeta__cabeza">
          <h3 id="meta-tarjeta-titulo" className="meta-tarjeta__titulo">
            {esElMesActual ? 'La meta de este mes' : `Meta de ${nombreMes}`}
          </h3>
          {!esElMesActual && fila && <SelloDeSituacion situacion={situacionDeMes(mes, fila.cumplida, hoy)} />}
        </div>

        {cargandoLaMeta && (
          <div className="meta-del-mes__esqueleto" aria-hidden="true">
            <span className="esq esq--m" />
            <span className="esq esq--completo meta-del-mes__esqueleto-barra" />
            <span className="esq esq--l" />
          </div>
        )}

        {errorDeLaMeta && (
          <div className="meta-del-mes__error" role="alert">
            <p>
              <Icono nombre="alerta" tamano={18} />
              No pudimos cargar la meta. {errorDeLaMeta}
            </p>
            <button type="button" className="boton boton--secundario boton--chico" onClick={recargarTodo}>
              Reintentar
            </button>
          </div>
        )}

        {!cargandoLaMeta && !errorDeLaMeta && (
          <>
            {esElMesActual && actual.datos ? (
              <ResumenDeMeta actual={actual.datos} completo />
            ) : fila ? (
              <div className="meta-resumen__barras">
                {fila.ingresosObjetivo !== null && (
                  <BarraDeMeta
                    nombre="Ingresos"
                    lectura={`${formatoPesos(fila.ingresos)} de ${formatoPesos(fila.ingresosObjetivo)}`}
                    proporcion={fila.ingresos / fila.ingresosObjetivo}
                    cumplida={fila.ingresos >= fila.ingresosObjetivo}
                  />
                )}
                {fila.trabajosObjetivo !== null && (
                  <BarraDeMeta
                    nombre="Trabajos"
                    lectura={fraseTrabajos(fila.trabajos, fila.trabajosObjetivo)}
                    proporcion={fila.trabajos / fila.trabajosObjetivo}
                    cumplida={fila.trabajos >= fila.trabajosObjetivo}
                  />
                )}
                <p className="meta-resumen__frase meta-resumen__frase--suave">
                  {fila.cumplida ? `Cumpliste la meta de ${nombreMes}.` : 'Esta meta no se cumplió.'}
                </p>
              </div>
            ) : (
              <p className="meta-vacia">
                No hay meta para {nombreMes}.{' '}
                {sePuedeFijar
                  ? 'Fijá cuánto querés facturar o cuántos trabajos querés hacer y la seguís desde acá.'
                  : 'Solo se pueden fijar metas desde 12 meses atrás hasta 12 meses adelante.'}
              </p>
            )}

            {!editando && sePuedeFijar && (
              <div className="meta-tarjeta__acciones">
                <button
                  type="button"
                  className="boton boton--primario boton--chico"
                  onClick={() => {
                    setEditando(true);
                  }}
                >
                  <Icono nombre={objetivos ? 'lapiz' : 'mas'} tamano={18} />
                  {objetivos ? 'Cambiar la meta' : 'Fijar la meta'}
                </button>
                {objetivos && (
                  <button
                    type="button"
                    className="boton boton--secundario boton--chico"
                    onClick={() => {
                      setErrorAlQuitar(null);
                      setQuitando(true);
                    }}
                  >
                    <Icono nombre="papelera" tamano={18} />
                    Quitar la meta
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {editando && (
          <FormularioMeta
            key={mes}
            mes={mes}
            hoy={hoy}
            inicial={objetivos}
            alGuardar={guardar}
            alCancelar={() => {
              setEditando(false);
            }}
          />
        )}
      </section>

      <HistorialDeMetas
        anio={anio}
        filas={delAnio.datos ?? []}
        hoy={hoy}
        cargando={delAnio.cargando}
        error={delAnio.error}
        alReintentar={delAnio.recargar}
        alVerMes={alCambiarMes}
        alCambiarAnio={(delta) => {
          alCambiarMes(sumarMeses(mes, delta * 12));
        }}
      />

      <dialog
        ref={quitarRef}
        className="confirmar"
        aria-labelledby="quitar-meta-titulo"
        aria-describedby="quitar-meta-texto"
        onCancel={bloquearEscape(ocupadoAlQuitar)}
        onClose={() => {
          setQuitando(false);
          setErrorAlQuitar(null);
        }}
      >
        <h2 id="quitar-meta-titulo" className="confirmar__titulo">
          ¿Quitar la meta de {conMayuscula(nombreMes)}?
        </h2>
        <p id="quitar-meta-texto" className="confirmar__texto">
          Dejás de seguir ese mes contra un objetivo. Lo cobrado y los gastos no se tocan.
        </p>
        <ErrorGeneral mensaje={errorAlQuitar} />
        <div className="confirmar__acciones">
          <button
            type="button"
            className="boton boton--secundario"
            disabled={ocupadoAlQuitar}
            onClick={() => {
              quitarRef.current?.close();
            }}
          >
            No, volver
          </button>
          <button
            type="button"
            className="boton boton--peligro"
            disabled={ocupadoAlQuitar}
            onClick={() => {
              void quitar();
            }}
          >
            <Icono nombre="papelera" tamano={18} />
            {ocupadoAlQuitar ? 'Quitando…' : 'Sí, quitarla'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
