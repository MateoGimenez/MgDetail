import { useEffect, useRef, useState } from 'react';
import { actualizarTurno, eliminarTurno, listarAgenda } from '../api/admin';
import { ApiError, esAbortado } from '../api/client';
import type { CambiosTurno, CupoDia, Turno } from '../api/contract';
import { esSesionPerdida } from '../api/sesion';
import { sumarDias } from '../lib/fechas';
import { avisoDeCambio, avisoDeEliminacion } from '../lib/avisosTurno';
import { conLoMasNuevo } from '../lib/turnos';
import { useAvisos } from './toast/contexto';
import type { Problema } from './useUsuarios';

type Resultado = { clave: string; turnos: Turno[]; cupos: CupoDia[] | null } | { clave: string; error: string };

const conCambio = (conjunto: ReadonlySet<string>, id: string, activo: boolean) => {
  const nuevo = new Set(conjunto);
  if (activo) nuevo.add(id);
  else nuevo.delete(id);
  return nuevo;
};

const sinClave = (registro: Readonly<Record<string, string>>, id: string) =>
  Object.fromEntries(Object.entries(registro).filter(([clave]) => clave !== id));

/**
 * Turnos de una semana (lunes a domingo) para la agenda, con cambio de estado, reprogramación y borrado.
 * Lo que cambia se reemplaza en memoria: un turno cancelado o movido a otra semana sigue en la lista (el detalle
 * abierto lo sigue mostrando) y la grilla lo deja afuera al agrupar. Si la sesión se pierde avisa con `alVencerSesion`.
 */
export function useAgenda(lunes: string, alVencerSesion: (mensaje: string) => void) {
  const avisos = useAvisos();
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ocupadas, setOcupadas] = useState<ReadonlySet<string>>(new Set());
  const [cambiadas, setCambiadas] = useState<ReadonlySet<string>>(new Set());
  const [erroresPorTurno, setErroresPorTurno] = useState<Readonly<Record<string, string>>>({});
  /** Lo último que guardó este panel de cada turno: una recarga más vieja no lo pisa (conLoMasNuevo). */
  const guardados = useRef(new Map<string, Turno>());

  const clave = `${lunes}|${String(recarga)}`;

  useEffect(() => {
    const control = new AbortController();
    listarAgenda(lunes, sumarDias(lunes, 6), control.signal)
      .then(({ turnos, cupos }) => {
        setResultado({ clave, turnos: conLoMasNuevo(turnos, guardados.current), cupos });
        setCambiadas(new Set());
        setErroresPorTurno({});
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({ clave, error: error instanceof Error ? error.message : 'No pudimos cargar la agenda.' });
      });
    return () => {
      control.abort();
    };
  }, [clave, lunes, alVencerSesion]);

  const reemplazar = (actualizado: Turno) => {
    guardados.current.set(actualizado.id, actualizado);
    setResultado((previo) =>
      previo && 'turnos' in previo
        ? { ...previo, turnos: previo.turnos.map((t) => (t.id === actualizado.id ? actualizado : t)) }
        : previo,
    );
  };

  /** Cambia estado y/o fecha confirmada. Devuelve null si salió bien o el problema (con los campos, si los hay). */
  const cambiar = async (turno: Turno, cambios: CambiosTurno): Promise<Problema | null> => {
    setOcupadas((o) => conCambio(o, turno.id, true));
    setErroresPorTurno((previos) => sinClave(previos, turno.id));
    try {
      reemplazar(await actualizarTurno(turno.id, cambios));
      setCambiadas((c) => conCambio(c, turno.id, true));
      avisos.exito(avisoDeCambio(turno, cambios));
      return null;
    } catch (error) {
      if (esSesionPerdida(error)) {
        alVencerSesion(error.message);
        return null;
      }
      const mensaje = error instanceof Error ? error.message : 'No se pudo guardar el cambio.';
      setErroresPorTurno((previos) => ({ ...previos, [turno.id]: mensaje }));
      return { mensaje, campos: error instanceof ApiError ? error.fields : undefined };
    } finally {
      setOcupadas((o) => conCambio(o, turno.id, false));
    }
  };

  /** Borra la solicitud. Devuelve null si salió bien o el mensaje de error. */
  const eliminar = async (turno: Turno): Promise<string | null> => {
    try {
      await eliminarTurno(turno.id);
    } catch (error) {
      if (esSesionPerdida(error)) {
        alVencerSesion(error.message);
        return null;
      }
      return error instanceof Error ? error.message : 'No se pudo eliminar la solicitud.';
    }
    avisos.exito(avisoDeEliminacion(turno));
    setResultado((previo) =>
      previo && 'turnos' in previo ? { ...previo, turnos: previo.turnos.filter((t) => t.id !== turno.id) } : previo,
    );
    return null;
  };

  const recargar = () => {
    setRecarga((n) => n + 1);
  };

  const vigente = resultado?.clave === clave ? resultado : null;

  return {
    cargando: vigente === null,
    turnos: vigente && 'turnos' in vigente ? vigente.turnos : null,
    /** Cupos de cada día de la semana por fecha (vacío si el backend no los mandó). */
    cupos: new Map(vigente && 'cupos' in vigente ? (vigente.cupos ?? []).map((c) => [c.fecha, c] as const) : []),
    error: vigente && 'error' in vigente ? vigente.error : null,
    ocupadas,
    cambiadas,
    erroresPorTurno,
    cambiar,
    eliminar,
    recargar,
  };
}
