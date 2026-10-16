import { useEffect, useState } from 'react';
import { cambiarEstado, contarTurnos, eliminarTurno, listarTurnos } from '../api/admin';
import { ApiError, esAbortado } from '../api/client';
import type { Estado, Turno } from '../api/contract';

export const POR_PAGINA = 20;

export type Filtro = Estado | 'todas';

type Resultado = { clave: string; turnos: Turno[]; total: number } | { clave: string; error: string };

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
 * Lista paginada de solicitudes de un filtro, con cambio de estado y borrado.
 * Un 401 en cualquier pedido avisa con `alVencerSesion`.
 */
export function useTurnos(filtro: Filtro, pagina: number, alVencerSesion: () => void) {
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [conteo, setConteo] = useState(0);
  const [ocupadas, setOcupadas] = useState<ReadonlySet<string>>(new Set());
  const [cambiadas, setCambiadas] = useState<ReadonlySet<string>>(new Set());
  const [erroresPorTurno, setErroresPorTurno] = useState<Readonly<Record<string, string>>>({});

  const clave = `${filtro}|${String(pagina)}|${String(recarga)}`;

  useEffect(() => {
    const control = new AbortController();
    listarTurnos(
      { estado: filtro === 'todas' ? undefined : filtro, limit: POR_PAGINA, offset: pagina * POR_PAGINA },
      control.signal,
    )
      .then(({ turnos, total }) => {
        setResultado({ clave, turnos, total });
        setCambiadas(new Set());
        setErroresPorTurno({});
        registrarVisita();
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (error instanceof ApiError && error.status === 401) {
          alVencerSesion();
          return;
        }
        setResultado({ clave, error: error instanceof Error ? error.message : 'No pudimos cargar las solicitudes.' });
      });
    return () => {
      control.abort();
    };
  }, [clave, filtro, pagina, alVencerSesion]);

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

  const cambiar = async (turno: Turno, estado: Estado) => {
    setOcupadas((o) => conCambio(o, turno.id, true));
    setErroresPorTurno((previos) => Object.fromEntries(Object.entries(previos).filter(([id]) => id !== turno.id)));
    try {
      const actualizado = await cambiarEstado(turno.id, estado);
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
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        alVencerSesion();
        return;
      }
      const mensaje = error instanceof Error ? error.message : 'No se pudo guardar el cambio.';
      setErroresPorTurno((previos) => ({ ...previos, [turno.id]: mensaje }));
    } finally {
      setOcupadas((o) => conCambio(o, turno.id, false));
    }
  };

  /** Borra la solicitud. Devuelve null si salió bien o el mensaje de error. */
  const eliminar = async (turno: Turno): Promise<string | null> => {
    try {
      await eliminarTurno(turno.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        alVencerSesion();
        return null;
      }
      return error instanceof Error ? error.message : 'No se pudo eliminar la solicitud.';
    }
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
    error: vigente && 'error' in vigente ? vigente.error : null,
    pendientes,
    ocupadas,
    cambiadas,
    erroresPorTurno,
    cambiar,
    eliminar,
    recargar,
  };
}
