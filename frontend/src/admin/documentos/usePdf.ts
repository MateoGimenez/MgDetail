import { useEffect, useRef, useState } from 'react';
import { esAbortado } from '../../api/client';
import { descargarPdf } from '../../api/pdf';
import { esSesionPerdida } from '../../api/sesion';
import { useMontado } from '../dialogo';
import { useAvisos } from '../toast/contexto';
import { clasificarFallaDeCompartir, compartirArchivo, guardarArchivo } from './entregaPdf';

export type Haciendo = 'descargar' | 'compartir' | null;

interface Datos {
  /** Ruta del PDF sin /api (`/admin/presupuestos/<id>/pdf`). */
  ruta: string;
  /** Cambia cuando el documento cambia (por ejemplo `updatedAt`): el PDF guardado en memoria deja de valer. */
  version: string;
  nombreDeArchivo: string;
  /** Título de la hoja de compartir. */
  titulo: string;
  alVencerSesion: (mensaje: string) => void;
}

/**
 * Descargar o compartir el PDF de un documento. Guarda en memoria el último PDF bajado: si el navegador pide un
 * toque nuevo para compartir (pasa en iPhone cuando el PDF tarda), el segundo toque comparte al instante.
 */
export function usePdf({ ruta, version, nombreDeArchivo, titulo, alVencerSesion }: Datos) {
  const montado = useMontado();
  const avisos = useAvisos();
  const [haciendo, setHaciendo] = useState<Haciendo>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const guardado = useRef<{ clave: string; blob: Blob } | null>(null);
  const control = useRef<AbortController | null>(null);
  const clave = `${ruta}|${version}`;

  useEffect(
    () => () => {
      control.current?.abort();
    },
    [],
  );

  const obtener = async (): Promise<Blob> => {
    if (guardado.current?.clave === clave) return guardado.current.blob;
    control.current = new AbortController();
    const blob = await descargarPdf(ruta, control.current.signal);
    guardado.current = { clave, blob };
    return blob;
  };

  const fallo = (e: unknown) => {
    if (esAbortado(e)) return;
    if (esSesionPerdida(e)) {
      alVencerSesion(e.message);
      return;
    }
    setError(e instanceof Error ? e.message : 'No pudimos armar el PDF. Probá de nuevo.');
  };

  const descargar = async () => {
    if (haciendo) return;
    setHaciendo('descargar');
    setError(null);
    setAviso(null);
    try {
      const blob = await obtener();
      guardarArchivo(blob, nombreDeArchivo);
      avisos.exito(`Se descargó ${nombreDeArchivo}.`);
    } catch (e) {
      if (montado.current) fallo(e);
    } finally {
      if (montado.current) setHaciendo(null);
    }
  };

  const compartir = async () => {
    if (haciendo) return;
    setHaciendo('compartir');
    setError(null);
    setAviso(null);
    try {
      const blob = await obtener();
      try {
        await compartirArchivo(blob, nombreDeArchivo, titulo);
      } catch (e) {
        const falla = clasificarFallaDeCompartir(e);
        if (falla === 'toque' && montado.current) setAviso('El PDF ya está listo. Tocá Compartir otra vez para mandarlo.');
        else if (falla === 'otra' && montado.current) setError('No pudimos abrir el menú de compartir. Descargalo y mandalo desde ahí.');
      }
    } catch (e) {
      if (montado.current) fallo(e);
    } finally {
      if (montado.current) setHaciendo(null);
    }
  };

  return { haciendo, error, aviso, descargar, compartir };
}
