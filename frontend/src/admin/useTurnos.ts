import { useEffect, useRef, useState } from 'react';
import { actualizarTurno, contarTurnos, eliminarTurno, listarTurnos } from '../api/admin';
import { ApiError, esAbortado } from '../api/client';
import { esSesionPerdida } from '../api/sesion';
import type { CambiosTurno, Estado, Turno } from '../api/contract';
import { avisoDeCambio, avisoDeEliminacion } from '../lib/avisosTurno';
import { conLoMasNuevo } from '../lib/turnos';
import { useAvisos } from './toast/contexto';
import type { Problema } from './useUsuarios';

export const POR_PAGINA = 20;

export type Filtro = Estado | 'todas';

type Resultado =
  | { clave: string; turnos: Turno[]; total: number }
  /** errorBusqueda: el mensaje de fields.q, que va debajo del buscador en lugar del error general. */
  | { clave: string; error: string; errorBusqueda?: string };

/* Solicitudes nuevas desde la última visita (preferencia local de este navegador). */
const CLAVE_VISITA = 'mg-panel-ultima-visita';

function leerUltimaVisita(): number | null {
  try {
    const valor = Number(localStorage.getItem(CLAVE_VISITA));
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
}

const ULTIMA_VISITA = leerUltimaVisita();
let visitaRegistrada = false;

function registrarVisita() {
  if (visitaRegistrada) return;
  visitaRegistrada = true;
  try {
    localStorage.setItem(CLAVE_VISITA, String(Date.now()));
  } catch {
    // Sin almacenamiento disponible: simplemente no se marcan las nuevas.
  }
}

export function esNueva(turno: Turno): boolean {
  return ULTIMA_VISITA !== null && Date.parse(turno.createdAt) > ULTIMA_VISITA;
}

const conCambio = (conjunto: ReadonlySet<string>, id: string, activo: boolean) => {
  const nuevo = new Set(conjunto);
  if (activo) nuevo.add(id);
  else nuevo.delete(id);
  return nuevo;
};

/**
 * Lista paginada de solicitudes de un filtro y, si hay, de una búsqueda `q` (ya validada), con cambio de estado,
 * de nota y borrado. Cada combinación de filtro, búsqueda y página tiene su clave: al cambiar, el pedido anterior
 * se cancela y una respuesta vieja nunca pisa a la nueva.
 * Si la sesión se pierde (401 sin refresco posible o usuario sin acceso) avisa con `alVencerSesion`.
 */
export function useTurnos(
  filtro: Filtro,
  pagina: number,
  q: string | undefined,
  alVencerSesion: (mensaje: string) => void,
) {
  const avisos = useAvisos();
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [conteo, setConteo] = useState(0);
  const [ocupadas, setOcupadas] = useState<ReadonlySet<string>>(new Set());
  const [cambiadas, setCambiadas] = useState<ReadonlySet<string>>(new Set());
  const [erroresPorTurno, setErroresPorTurno] = useState<Readonly<Record<string, string>>>({});
  /** Lo último que guardó este panel de cada turno: una recarga más vieja no lo pisa (conLoMasNuevo). */
  const guardados = useRef(new Map<string, Turno>());

  const clave = `${filtro}|${String(pagina)}|${String(recarga)}|${q ?? ''}`;

  useEffect(() => {
    const control = new AbortController();
    listarTurnos(
      { estado: filtro === 'todas' ? undefined : filtro, q, limit: POR_PAGINA, offset: pagina * POR_PAGINA },
      control.signal,
    )
      .then(({ turnos, total }) => {
        setResultado({ clave, turnos: conLoMasNuevo(turnos, guardados.current), total });
        setCambiadas(new Set());
        setErroresPorTurno({});
        registrarVisita();
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({
          clave,
          error: error instanceof Error ? error.message : 'No pudimos cargar las solicitudes.',
          errorBusqueda: error instanceof ApiError ? error.fields?.q : undefined,
        });
      });
    return () => {
      control.abort();
    };
  }, [clave, filtro, pagina, q, alVencerSesion]);

  useEffect(() => {
    const control = new AbortController();
    contarTurnos('pendiente', control.signal)
      .then(setPendientes)
      .catch(() => {
        // El contador es un extra: si falla, la lista sigue funcionando.
      });
    return () => {
      control.abort();
    };
  }, [conteo]);

  /** Cambia estado, fecha confirmada y/o nota interna. Devuelve null si salió bien o el problema (con los campos, si los hay). */
  const cambiar = async (turno: Turno, cambios: CambiosTurno): Promise<Problema | null> => {
    setOcupadas((o) => conCambio(o, turno.id, true));
    setErroresPorTurno((previos) => Object.fromEntries(Object.entries(previos).filter(([id]) => id !== turno.id)));
    try {
      const actualizado = await actualizarTurno(turno.id, cambios);
      guardados.current.set(actualizado.id, actualizado);
      setResultado((previo) => {
        if (!previo || !('turnos' in previo)) return previo;
        // El total del filtro se ajusta en memoria: la tarjeta queda a la vista hasta actualizar.
        const delta =
          filtro === 'todas' ? 0 : Number(actualizado.estado === filtro) - Number(turno.estado === filtro);
        return {
          ...previo,
          total: Math.max(0, previo.total + delta),
          turnos: previo.turnos.map((t) => (t.id === actualizado.id ? actualizado : t)),
        };
      });
      setCambiadas((c) => conCambio(c, turno.id, true));
      setConteo((n) => n + 1);
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
    setResultado((previo) => {
      if (!previo || !('turnos' in previo)) return previo;
      const restaba = filtro === 'todas' || turno.estado === filtro ? 1 : 0;
      return {
        ...previo,
        turnos: previo.turnos.filter((t) => t.id !== turno.id),
        total: Math.max(0, previo.total - restaba),
      };
    });
    setConteo((n) => n + 1);
    return null;
  };

  const recargar = () => {
    setRecarga((n) => n + 1);
    setConteo((n) => n + 1);
  };

  const vigente = resultado?.clave === clave ? resultado : null;

  return {
    cargando: vigente === null,
    datos: vigente && 'turnos' in vigente ? vigente : null,
    error: vigente && 'error' in vigente && !vigente.errorBusqueda ? vigente.error : null,
    errorBusqueda: vigente && 'error' in vigente ? (vigente.errorBusqueda ?? null) : null,
    pendientes,
    ocupadas,
    cambiadas,
    erroresPorTurno,
    cambiar,
    eliminar,
    recargar,
  };
}
