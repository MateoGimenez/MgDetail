import { useEffect, useState } from 'react';
import { actualizarServicio, crearServicio, listarServiciosPanel, ordenarServicios } from '../api/admin';
import { ApiError, esAbortado } from '../api/client';
import { CODIGO_SERVICIO_EXISTE, type CambiosServicio, type NuevoServicio, type ServicioPanel } from '../api/contract-panel';
import { esSesionPerdida } from '../api/sesion';
import { useAvisos } from './toast/contexto';
import type { Problema } from './useUsuarios';

type Resultado = { clave: number; servicios: ServicioPanel[] } | { clave: number; error: string };

const conCambio = (conjunto: ReadonlySet<string>, id: string, activo: boolean) => {
  const nuevo = new Set(conjunto);
  if (activo) nuevo.add(id);
  else nuevo.delete(id);
  return nuevo;
};

const sinClave = (registro: Readonly<Record<string, string>>, id: string) =>
  Object.fromEntries(Object.entries(registro).filter(([clave]) => clave !== id));

/** Mueve el elemento `desde` a la posición `hasta` (copia nueva). */
export function moverEnLista<T>(lista: readonly T[], desde: number, hasta: number): T[] {
  const copia = [...lista];
  const [elemento] = copia.splice(desde, 1);
  if (elemento === undefined) return copia;
  copia.splice(hasta, 0, elemento);
  return copia;
}

/**
 * Reemplaza un servicio con la versión del servidor. Si quedó destacado, el backend desmarcó al anterior en la
 * misma transacción: se refleja acá para no mostrar dos destacados.
 */
export function conServicio(servicios: readonly ServicioPanel[], actualizado: ServicioPanel): ServicioPanel[] {
  return servicios.map((s) => {
    if (s.id === actualizado.id) return actualizado;
    return actualizado.destacado && s.destacado ? { ...s, destacado: false } : s;
  });
}

/** Lo que anuncia la región en vivo al activar o desactivar desde la fila. Desactivar el destacado lo desmarca. */
export function mensajeActivo(servicio: ServicioPanel): string {
  if (!servicio.activo) return `${servicio.nombre} vuelve a verse en la web.`;
  return servicio.destacado
    ? `${servicio.nombre} ya no se ve en la web y dejó de estar destacado.`
    : `${servicio.nombre} ya no se ve en la web.`;
}

/**
 * Catálogo de servicios del panel: lo cargan todos los roles (Turnos lo usa para los nombres); crear, editar y
 * ordenar es de superadmin y admin (el backend responde 403 al resto).
 */
export function useServicios(alVencerSesion: (mensaje: string) => void) {
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(new Set());
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
  const [ordenando, setOrdenando] = useState(false);
  const [errorOrden, setErrorOrden] = useState<string | null>(null);
  /** Lo hecho con éxito se avisa con un toast ("Pulido subió al puesto 2 de 5."). */
  const avisos = useAvisos();

  useEffect(() => {
    const control = new AbortController();
    listarServiciosPanel(control.signal)
      .then((servicios) => {
        setResultado({ clave: recarga, servicios });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({ clave: recarga, error: error instanceof Error ? error.message : 'No pudimos cargar los servicios.' });
      });
    return () => {
      control.abort();
    };
  }, [recarga, alVencerSesion]);

  const cambiarLista = (cambio: (servicios: ServicioPanel[]) => ServicioPanel[]) => {
    setResultado((previo) => (previo && 'servicios' in previo ? { ...previo, servicios: cambio(previo.servicios) } : previo));
  };
  const recargar = () => {
    setRecarga((r) => r + 1);
  };

  /** Traduce un error: null si la sesión se perdió (el panel ya vuelve al ingreso). */
  const problemaDe = (error: unknown, porDefecto: string): Problema | null => {
    if (esSesionPerdida(error)) {
      alVencerSesion(error.message);
      return null;
    }
    if (error instanceof ApiError && error.code === CODIGO_SERVICIO_EXISTE) {
      return {
        mensaje: 'Ya hay un servicio con ese identificador.',
        campos: { id: 'Ya está en uso (puede ser un servicio inactivo). Elegí otro.' },
      };
    }
    if (error instanceof ApiError && error.status === 404) {
      recargar();
      return { mensaje: 'Ese servicio ya no está en el catálogo. Actualizamos la lista.' };
    }
    if (error instanceof ApiError) return { mensaje: error.message, campos: error.fields };
    return { mensaje: porDefecto };
  };

  /** Alta desde el diálogo. null = se creó (o la sesión se perdió). */
  const crear = async (datos: NuevoServicio): Promise<Problema | null> => {
    try {
      const creado = await crearServicio(datos);
      cambiarLista((servicios) => conServicio([...servicios.filter((s) => s.id !== creado.id), creado], creado));
      avisos.exito(`Se creó ${creado.nombre}.`);
      return null;
    } catch (error) {
      return problemaDe(error, 'No se pudo crear el servicio.');
    }
  };

  /** Cambios desde el diálogo. null = se guardaron (o la sesión se perdió). */
  const guardar = async (servicio: ServicioPanel, cambios: CambiosServicio): Promise<Problema | null> => {
    try {
      const actualizado = await actualizarServicio(servicio.id, cambios);
      cambiarLista((servicios) => conServicio(servicios, actualizado));
      setErrores((previos) => sinClave(previos, servicio.id));
      avisos.exito(`Se guardaron los cambios de ${actualizado.nombre}.`);
      return null;
    } catch (error) {
      return problemaDe(error, 'No se pudieron guardar los cambios.');
    }
  };

  /** Cambio rápido desde la fila (activar, destacar). El error queda en la fila. */
  const cambiar = async (servicio: ServicioPanel, cambios: CambiosServicio, hecho: string) => {
    setOcupados((o) => conCambio(o, servicio.id, true));
    setErrores((previos) => sinClave(previos, servicio.id));
    try {
      const actualizado = await actualizarServicio(servicio.id, cambios);
      cambiarLista((servicios) => conServicio(servicios, actualizado));
      avisos.exito(hecho);
    } catch (error) {
      const problema = problemaDe(error, 'No se pudo guardar el cambio.');
      if (problema) setErrores((previos) => ({ ...previos, [servicio.id]: problema.mensaje }));
    } finally {
      setOcupados((o) => conCambio(o, servicio.id, false));
    }
  };

  /** Sube (-1) o baja (+1) un puesto. Se ve al instante; si el servidor no lo acepta, vuelve atrás. */
  const mover = async (servicio: ServicioPanel, delta: -1 | 1) => {
    const actuales = resultado && 'servicios' in resultado ? resultado.servicios : null;
    if (!actuales || ordenando) return;
    const desde = actuales.findIndex((s) => s.id === servicio.id);
    const hasta = desde + delta;
    if (desde < 0 || hasta < 0 || hasta >= actuales.length) return;

    const nuevos = moverEnLista(actuales, desde, hasta);
    cambiarLista(() => nuevos);
    setOrdenando(true);
    setErrorOrden(null);
    try {
      const guardados = await ordenarServicios(nuevos.map((s) => s.id));
      cambiarLista(() => guardados);
      const puesto = guardados.findIndex((s) => s.id === servicio.id) + 1;
      avisos.exito(`${servicio.nombre} ${delta < 0 ? 'subió' : 'bajó'} al puesto ${String(puesto)} de ${String(guardados.length)}.`);
    } catch (error) {
      cambiarLista(() => actuales);
      if (esSesionPerdida(error)) {
        alVencerSesion(error.message);
        return;
      }
      if (error instanceof ApiError && error.status === 400) {
        // Faltan o sobran ids: alguien cambió el catálogo mientras tanto.
        setErrorOrden('La lista cambió mientras la ordenabas. La actualizamos: probá de nuevo.');
        recargar();
        return;
      }
      setErrorOrden(error instanceof Error ? error.message : 'No se pudo guardar el orden.');
    } finally {
      setOrdenando(false);
    }
  };

  const vigente = resultado?.clave === recarga ? resultado : null;

  return {
    cargando: vigente === null,
    servicios: vigente && 'servicios' in vigente ? vigente.servicios : null,
    error: vigente && 'error' in vigente ? vigente.error : null,
    ocupados,
    errores,
    ordenando,
    errorOrden,
    crear,
    guardar,
    cambiar,
    mover,
    recargar: () => {
      setErrorOrden(null);
      recargar();
    },
  };
}

export type Catalogo = ReturnType<typeof useServicios>;

/** ids de las flechas de cada fila: después de mover, el foco vuelve a la flecha del servicio movido. */
export const idSubir = (id: string) => `servicio-${id}-subir`;
export const idBajar = (id: string) => `servicio-${id}-bajar`;
