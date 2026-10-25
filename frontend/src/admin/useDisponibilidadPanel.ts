import { useEffect, useState } from 'react';
import { guardarDiaEspecial, guardarHorarioSemanal, quitarDiaEspecial, verDisponibilidad } from '../api/admin';
import { ApiError, esAbortado } from '../api/client';
import type { CambioDiaEspecial, DiaEspecial, HorarioDia } from '../api/contract-panel';
import { esSesionPerdida } from '../api/sesion';
import type { Problema } from './useUsuarios';

interface Datos {
  horarioSemanal: HorarioDia[];
  diasEspeciales: DiaEspecial[];
}

type Resultado = ({ clave: number } & Datos) | { clave: number; error: string };

/** Días especiales ordenados por fecha, con el nuevo reemplazando al de la misma fecha. */
export function conDiaEspecial(dias: readonly DiaEspecial[], dia: DiaEspecial): DiaEspecial[] {
  return [...dias.filter((d) => d.fecha !== dia.fecha), dia].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Horario semanal y días especiales del panel. Lo ven todos los roles; guardar es de superadmin y admin (el backend
 * responde 403 al resto). Cada cambio devuelve null si salió bien (o si la sesión se perdió) o el problema.
 */
export function useDisponibilidadPanel(alVencerSesion: (mensaje: string) => void) {
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  /** Último cambio guardado, para la región en vivo. */
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    const control = new AbortController();
    verDisponibilidad(control.signal)
      .then((datos) => {
        setResultado({ clave: recarga, ...datos });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({
          clave: recarga,
          error: error instanceof Error ? error.message : 'No pudimos cargar la disponibilidad.',
        });
      });
    return () => {
      control.abort();
    };
  }, [recarga, alVencerSesion]);

  const cambiarDatos = (cambio: (datos: Datos) => Datos) => {
    setResultado((previo) => (previo && 'horarioSemanal' in previo ? { ...previo, ...cambio(previo) } : previo));
  };

  const problemaDe = (error: unknown, porDefecto: string): Problema | null => {
    if (esSesionPerdida(error)) {
      alVencerSesion(error.message);
      return null;
    }
    if (error instanceof ApiError) return { mensaje: error.message, campos: error.fields };
    return { mensaje: porDefecto };
  };

  const guardarHorario = async (dias: readonly HorarioDia[]): Promise<Problema | null> => {
    try {
      const horarioSemanal = await guardarHorarioSemanal(dias);
      cambiarDatos((datos) => ({ ...datos, horarioSemanal }));
      setAviso('Se guardó el horario habitual.');
      return null;
    } catch (error) {
      return problemaDe(error, 'No se pudo guardar el horario.');
    }
  };

  /** `aviso`: lo que dice la región en vivo si sale bien (vacío = no cambia; la selección de varios días avisa al final). */
  const guardarDia = async (fecha: string, cambio: CambioDiaEspecial, aviso = 'Se guardó el día.'): Promise<Problema | null> => {
    try {
      const dia = await guardarDiaEspecial(fecha, cambio);
      cambiarDatos((datos) => ({ ...datos, diasEspeciales: conDiaEspecial(datos.diasEspeciales, dia) }));
      if (aviso) setAviso(aviso);
      return null;
    } catch (error) {
      return problemaDe(error, 'No se pudo guardar el día.');
    }
  };

  const quitarDia = async (
    fecha: string,
    aviso = 'Ese día volvió al horario habitual.',
  ): Promise<Problema | null> => {
    try {
      await quitarDiaEspecial(fecha);
    } catch (error) {
      // Ya no estaba: el resultado es el mismo que se buscaba.
      if (!(error instanceof ApiError && error.status === 404)) return problemaDe(error, 'No se pudo quitar el día.');
    }
    cambiarDatos((datos) => ({ ...datos, diasEspeciales: datos.diasEspeciales.filter((d) => d.fecha !== fecha) }));
    if (aviso) setAviso(aviso);
    return null;
  };

  const vigente = resultado?.clave === recarga ? resultado : null;

  return {
    cargando: vigente === null,
    datos: vigente && 'horarioSemanal' in vigente ? vigente : null,
    error: vigente && 'error' in vigente ? vigente.error : null,
    aviso,
    guardarHorario,
    guardarDia,
    quitarDia,
    avisar: setAviso,
    recargar: () => {
      setRecarga((r) => r + 1);
    },
  };
}
