import { useEffect, useState } from 'react';
import { esAbortado } from '../../api/client';
import { listarMovimientos, type Movimiento } from '../../api/inventario';
import { esSesionPerdida } from '../../api/sesion';

const POR_PAGINA = 20;

type Estado = { clave: string; items: Movimiento[]; total: number } | { clave: string; error: string };

/**
 * Historial de un insumo, más nuevos primero, de a 20. `version` cambia cuando se registra un movimiento: la lista
 * vuelve a pedirse desde el principio.
 */
export function useMovimientos(insumoId: string, version: number, alVencerSesion: (mensaje: string) => void) {
  const [reintento, setReintento] = useState(0);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [errorMas, setErrorMas] = useState<string | null>(null);
  const clave = `${insumoId}|${String(version)}|${String(reintento)}`;

  useEffect(() => {
    const control = new AbortController();
    listarMovimientos(insumoId, { limit: POR_PAGINA, offset: 0 }, control.signal)
      .then(({ movimientos, total }) => {
        setEstado({ clave, items: movimientos, total });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setEstado({ clave, error: error instanceof Error ? error.message : 'No pudimos cargar el historial.' });
      });
    return () => {
      control.abort();
    };
  }, [clave, insumoId, alVencerSesion]);

  const vigente = estado?.clave === clave ? estado : null;
  const items = vigente && 'items' in vigente ? vigente.items : null;

  const cargarMas = async () => {
    if (!vigente || !('items' in vigente) || cargandoMas) return;
    setCargandoMas(true);
    setErrorMas(null);
    try {
      const { movimientos, total } = await listarMovimientos(insumoId, { limit: POR_PAGINA, offset: vigente.items.length });
      setEstado((previo) =>
        previo && 'items' in previo && previo.clave === clave ? { ...previo, items: [...previo.items, ...movimientos], total } : previo,
      );
    } catch (error) {
      if (esSesionPerdida(error)) alVencerSesion(error.message);
      else setErrorMas(error instanceof Error ? error.message : 'No pudimos cargar más movimientos.');
    } finally {
      setCargandoMas(false);
    }
  };

  return {
    cargando: vigente === null,
    items,
    total: vigente && 'items' in vigente ? vigente.total : 0,
    error: vigente && 'error' in vigente ? vigente.error : null,
    cargandoMas,
    errorMas,
    cargarMas,
    reintentar: () => {
      setReintento((n) => n + 1);
    },
  };
}
