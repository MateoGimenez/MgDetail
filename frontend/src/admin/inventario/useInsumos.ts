import { useEffect, useState } from 'react';
import { ApiError, esAbortado } from '../../api/client';
import {
  CODIGO_STOCK_INSUFICIENTE,
  actualizarInsumo,
  crearInsumo,
  listarInsumos,
  registrarMovimiento,
  type CambiosInsumo,
  type FiltroActivo,
  type Insumo,
  type ListaDeInsumos,
  type NuevoInsumo,
} from '../../api/inventario';
import { esSesionPerdida } from '../../api/sesion';
import { avisoDeMovimiento, type CuerpoMovimiento } from '../../lib/inventario';
import { useAvisos } from '../toast/contexto';
import type { Problema } from '../useUsuarios';

export const POR_PAGINA = 30;

export interface FiltrosInsumos {
  q: string | undefined;
  bajoStock: boolean;
  activo: FiltroActivo;
}

type Resultado = { clave: string; datos: ListaDeInsumos } | { clave: string; error: string };

const sinClave = (registro: Readonly<Record<string, string>>, id: string) =>
  Object.fromEntries(Object.entries(registro).filter(([clave]) => clave !== id));

/**
 * Cuentas de la lista cuando un insumo cambia en el lugar: cuántos están en stock bajo y, si el rol ve plata, el
 * valor total. Solo cuentan los activos (igual que el backend).
 */
export function recontar(datos: ListaDeInsumos, antes: Insumo, despues: Insumo): ListaDeInsumos {
  const bajo = (i: Insumo) => (i.activo && i.bajoStock ? 1 : 0);
  const valor = (i: Insumo) => (i.activo ? (i.valorEnStock ?? 0) : 0);
  return {
    ...datos,
    insumos: datos.insumos.map((i) => (i.id === despues.id ? despues : i)),
    bajoStock: Math.max(0, datos.bajoStock + bajo(despues) - bajo(antes)),
    valorTotal: datos.valorTotal === null ? null : Math.max(0, datos.valorTotal + valor(despues) - valor(antes)),
  };
}

/**
 * Inventario del panel. Todos los roles ven la lista y anotan usos; crear, editar, comprar y ajustar es de
 * superadmin y admin (el backend responde 403 al resto). Un cambio se refleja en el lugar con lo que devuelve el
 * servidor, sin volver a pedir la lista.
 */
export function useInsumos(filtros: FiltrosInsumos, pagina: number, alVencerSesion: (mensaje: string) => void) {
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(new Set());
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
  /** Cuenta los movimientos registrados por insumo: el historial abierto se vuelve a pedir cuando cambia. */
  const [versiones, setVersiones] = useState<Readonly<Record<string, number>>>({});
  const avisos = useAvisos();

  const { q, bajoStock, activo } = filtros;
  const clave = JSON.stringify([q ?? null, bajoStock, activo, pagina, recarga]);

  useEffect(() => {
    const control = new AbortController();
    listarInsumos({ q, bajoStock, activo, limit: POR_PAGINA, offset: pagina * POR_PAGINA }, control.signal)
      .then((datos) => {
        setResultado({ clave, datos });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({ clave, error: error instanceof Error ? error.message : 'No pudimos cargar el inventario.' });
      });
    return () => {
      control.abort();
    };
  }, [clave, q, bajoStock, activo, pagina, alVencerSesion]);

  const recargar = () => {
    setRecarga((r) => r + 1);
  };

  const cambiarEnLista = (antes: Insumo, despues: Insumo) => {
    setResultado((previo) => (previo && 'datos' in previo ? { ...previo, datos: recontar(previo.datos, antes, despues) } : previo));
  };

  /** Traduce un error: null si la sesión se perdió (el panel ya vuelve al ingreso). */
  const problemaDe = (error: unknown, porDefecto: string, contexto: 'nombre' | 'otro' = 'otro'): Problema | null => {
    if (esSesionPerdida(error)) {
      alVencerSesion(error.message);
      return null;
    }
    if (error instanceof ApiError && error.status === 404) {
      recargar();
      return { mensaje: 'Ese insumo ya no está. Actualizamos la lista.' };
    }
    if (error instanceof ApiError && error.code === CODIGO_STOCK_INSUFICIENTE) {
      return { mensaje: error.message, campos: error.fields ?? { cantidad: error.message } };
    }
    if (error instanceof ApiError && error.status === 409 && contexto === 'nombre') {
      return {
        mensaje: 'Ya hay un insumo activo con ese nombre.',
        campos: error.fields?.nombre ? error.fields : { nombre: 'Ya hay un insumo activo con ese nombre. Usá otro o desactivá el que está.' },
      };
    }
    if (error instanceof ApiError) return { mensaje: error.message, campos: error.fields };
    return { mensaje: porDefecto };
  };

  const crear = async (datos: NuevoInsumo): Promise<Problema | null> => {
    try {
      const creado = await crearInsumo(datos);
      avisos.exito(`Se agregó ${creado.nombre} al inventario.`);
      recargar();
      return null;
    } catch (error) {
      return problemaDe(error, 'No se pudo crear el insumo.', 'nombre');
    }
  };

  const guardar = async (insumo: Insumo, cambios: CambiosInsumo): Promise<Problema | null> => {
    try {
      const actualizado = await actualizarInsumo(insumo.id, cambios);
      cambiarEnLista(insumo, actualizado);
      setErrores((previos) => sinClave(previos, insumo.id));
      avisos.exito(`Se guardaron los cambios de ${actualizado.nombre}.`);
      return null;
    } catch (error) {
      return problemaDe(error, 'No se pudieron guardar los cambios.', 'nombre');
    }
  };

  /** Desactivar o reactivar desde la tarjeta. El error queda en la tarjeta. */
  const cambiarActivo = async (insumo: Insumo) => {
    setOcupados((o) => new Set(o).add(insumo.id));
    setErrores((previos) => sinClave(previos, insumo.id));
    try {
      const actualizado = await actualizarInsumo(insumo.id, { activo: !insumo.activo });
      cambiarEnLista(insumo, actualizado);
      avisos.exito(
        actualizado.activo
          ? `${actualizado.nombre} volvió al inventario.`
          : `${actualizado.nombre} salió del inventario. Lo encontrás en «Inactivos».`,
      );
    } catch (error) {
      const problema = problemaDe(error, 'No se pudo guardar el cambio.', 'nombre');
      if (problema) {
        const nombreRepetido = problema.campos?.nombre;
        setErrores((previos) => ({
          ...previos,
          [insumo.id]: nombreRepetido ? `${nombreRepetido} Cambiale el nombre antes de reactivarlo.` : problema.mensaje,
        }));
      }
    } finally {
      setOcupados((o) => {
        const nuevo = new Set(o);
        nuevo.delete(insumo.id);
        return nuevo;
      });
    }
  };

  /** Uso, compra o ajuste. null = quedó anotado (o la sesión se perdió). */
  const registrar = async (insumo: Insumo, cuerpo: CuerpoMovimiento): Promise<Problema | null> => {
    try {
      const { insumo: actualizado } = await registrarMovimiento(insumo.id, cuerpo);
      cambiarEnLista(insumo, actualizado);
      setVersiones((v) => ({ ...v, [insumo.id]: (v[insumo.id] ?? 0) + 1 }));
      avisos.exito(avisoDeMovimiento(cuerpo.tipo, actualizado.nombre, actualizado.stock, actualizado.unidad));
      return null;
    } catch (error) {
      return problemaDe(error, 'No se pudo anotar el movimiento.');
    }
  };

  const vigente = resultado?.clave === clave ? resultado : null;

  return {
    cargando: vigente === null,
    datos: vigente && 'datos' in vigente ? vigente.datos : null,
    error: vigente && 'error' in vigente ? vigente.error : null,
    ocupados,
    errores,
    versiones,
    crear,
    guardar,
    cambiarActivo,
    registrar,
    recargar,
  };
}
