import { useEffect, useState } from 'react';
import { ApiError, esAbortado } from '../../api/client';
import {
  actualizarPresupuesto,
  crearPresupuesto,
  eliminarPresupuesto,
  listarPresupuestos,
  type ListaDePresupuestos,
  type NuevoPresupuesto,
  type Presupuesto,
} from '../../api/presupuestos';
import { esSesionPerdida } from '../../api/sesion';
import {
  CODIGO_PRESUPUESTO_ACEPTADO,
  MENSAJE_PRESUPUESTO_ACEPTADO,
  avisoDeEstado,
  type EstadoPresupuesto,
} from '../../lib/presupuestos';
import { useAvisos } from '../toast/contexto';
import type { Problema } from '../useUsuarios';

export const POR_PAGINA = 20;

type Resultado = { clave: string; datos: ListaDePresupuestos } | { clave: string; error: string };

const sinClave = (registro: Readonly<Record<string, string>>, id: string) =>
  Object.fromEntries(Object.entries(registro).filter(([clave]) => clave !== id));

/**
 * Presupuestos del panel (solo superadmin y admin). Un cambio se refleja en el lugar con lo que devuelve el
 * servidor; crear y borrar vuelven a pedir la lista (cambia el orden y los totales).
 */
export function usePresupuestos(
  estado: EstadoPresupuesto | undefined,
  q: string | undefined,
  pagina: number,
  alVencerSesion: (mensaje: string) => void,
) {
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(new Set());
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
  /** Lo último que cambió de estado, para decir en la tarjeta que sale de la lista filtrada al actualizar. */
  const [cambiados, setCambiados] = useState<ReadonlySet<string>>(new Set());
  const avisos = useAvisos();
  const clave = JSON.stringify([estado ?? null, q ?? null, pagina, recarga]);

  useEffect(() => {
    const control = new AbortController();
    listarPresupuestos({ estado, q, limit: POR_PAGINA, offset: pagina * POR_PAGINA }, control.signal)
      .then((datos) => {
        setResultado({ clave, datos });
        setCambiados(new Set());
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({ clave, error: error instanceof Error ? error.message : 'No pudimos cargar los presupuestos.' });
      });
    return () => {
      control.abort();
    };
  }, [clave, estado, q, pagina, alVencerSesion]);

  const recargar = () => {
    setRecarga((r) => r + 1);
  };

  const reemplazar = (actualizado: Presupuesto) => {
    setResultado((previo) =>
      previo && 'datos' in previo
        ? { ...previo, datos: { ...previo.datos, presupuestos: previo.datos.presupuestos.map((p) => (p.id === actualizado.id ? actualizado : p)) } }
        : previo,
    );
  };

  const problemaDe = (error: unknown, porDefecto: string): Problema | null => {
    if (esSesionPerdida(error)) {
      alVencerSesion(error.message);
      return null;
    }
    if (error instanceof ApiError && error.status === 404) {
      recargar();
      return { mensaje: 'Ese presupuesto ya no está. Actualizamos la lista.' };
    }
    if (error instanceof ApiError && error.code === CODIGO_PRESUPUESTO_ACEPTADO) {
      return { mensaje: MENSAJE_PRESUPUESTO_ACEPTADO };
    }
    if (error instanceof ApiError) return { mensaje: error.message, campos: error.fields };
    return { mensaje: porDefecto };
  };

  const crear = async (datos: NuevoPresupuesto): Promise<Problema | null> => {
    try {
      const creado = await crearPresupuesto(datos);
      avisos.exito(`Se creó el presupuesto ${creado.codigo}.`);
      recargar();
      return null;
    } catch (error) {
      return problemaDe(error, 'No se pudo crear el presupuesto.');
    }
  };

  const guardar = async (presupuesto: Presupuesto, cambios: Record<string, unknown>): Promise<Problema | null> => {
    try {
      const actualizado = await actualizarPresupuesto(presupuesto.id, cambios);
      reemplazar(actualizado);
      setErrores((previos) => sinClave(previos, presupuesto.id));
      avisos.exito(`Se guardaron los cambios de ${actualizado.codigo}.`);
      return null;
    } catch (error) {
      return problemaDe(error, 'No se pudieron guardar los cambios.');
    }
  };

  /** Cambio de estado desde la tarjeta. El error queda en la tarjeta. */
  const cambiarEstado = async (presupuesto: Presupuesto, estadoNuevo: EstadoPresupuesto) => {
    setOcupados((o) => new Set(o).add(presupuesto.id));
    setErrores((previos) => sinClave(previos, presupuesto.id));
    try {
      const actualizado = await actualizarPresupuesto(presupuesto.id, { estado: estadoNuevo });
      reemplazar(actualizado);
      setCambiados((c) => new Set(c).add(presupuesto.id));
      avisos.exito(avisoDeEstado(actualizado.codigo, actualizado.estado));
    } catch (error) {
      const problema = problemaDe(error, 'No se pudo cambiar el estado.');
      if (problema) setErrores((previos) => ({ ...previos, [presupuesto.id]: problema.mensaje }));
    } finally {
      setOcupados((o) => {
        const nuevo = new Set(o);
        nuevo.delete(presupuesto.id);
        return nuevo;
      });
    }
  };

  /** Borra (desde el diálogo de confirmación). null = se borró (o la sesión se perdió). */
  const eliminar = async (presupuesto: Presupuesto): Promise<Problema | null> => {
    try {
      await eliminarPresupuesto(presupuesto.id);
      avisos.exito(`Se borró ${presupuesto.codigo}.`);
      recargar();
      return null;
    } catch (error) {
      return problemaDe(error, 'No se pudo borrar el presupuesto.');
    }
  };

  const vigente = resultado?.clave === clave ? resultado : null;

  return {
    cargando: vigente === null,
    datos: vigente && 'datos' in vigente ? vigente.datos : null,
    error: vigente && 'error' in vigente ? vigente.error : null,
    ocupados,
    errores,
    cambiados,
    crear,
    guardar,
    cambiarEstado,
    eliminar,
    recargar,
  };
}
