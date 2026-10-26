import { useCallback, useEffect, useState } from 'react';
import { esAbortado } from '../api/client';
import { estadoDeAvisos } from '../api/push';
import { esSesionPerdida } from '../api/sesion';
import {
  activarAvisos,
  actualizarGlobito,
  desactivarAvisos,
  mensajeDeFallo,
  probarAviso,
  suscripcionActual,
} from './avisos';
import { capacidadesDe, leerEntorno } from './entorno';
import {
  decidirAvisos,
  decidirInstalacion,
  type EstadoAvisos,
  type EstadoDelServidor,
  type EstadoInstalacion,
} from './estadoAjustes';
import { pedirInstalacion, useInstalacion } from './instalacion';

export type Ocupado = 'activando' | 'desactivando' | 'probando' | 'instalando' | null;

export interface Ajustes {
  instalacion: EstadoInstalacion;
  avisos: EstadoAvisos;
  /** El interruptor está prendido (este dispositivo tiene los avisos activos). */
  encendido: boolean;
  /** No se pudo consultar al servidor: no se puede ni activar ni apagar nada hasta reintentar. */
  sinServidor: boolean;
  ocupado: Ocupado;
  /** Mensaje informativo de la última acción (no es un error). */
  nota: string | null;
  /** Se llama al abrir el diálogo: vuelve a leer permisos, suscripción y estado del servidor. */
  abrir: () => void;
  cerrar: () => void;
  instalar: () => Promise<void>;
  alternarAvisos: () => Promise<void>;
  reintentar: () => Promise<void>;
  probar: () => Promise<void>;
}

/** Estado y acciones de la pantalla de Ajustes de la app. */
export function useAjustes(alVencerSesion: (mensaje: string) => void, usuarioId: string): Ajustes {
  const instalacionApp = useInstalacion();
  const [abierto, setAbierto] = useState(false);
  const [entorno, setEntorno] = useState(leerEntorno);
  const [servidor, setServidor] = useState<EstadoDelServidor>(null);
  const [suscripto, setSuscripto] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!abierto) return;
    const control = new AbortController();
    estadoDeAvisos(control.signal)
      .then((estado) => {
        setServidor(estado);
      })
      .catch((falla: unknown) => {
        if (esAbortado(falla)) return;
        if (esSesionPerdida(falla)) {
          alVencerSesion(falla.message);
          return;
        }
        setServidor('error');
        setError(mensajeDeFallo(falla, 'No pudimos consultar los avisos. Probá de nuevo.'));
      });
    suscripcionActual()
      .then((suscripcion) => {
        setSuscripto(suscripcion !== null);
      })
      .catch(() => {
        setSuscripto(false);
      });
    return () => {
      control.abort();
    };
  }, [abierto, intento, alVencerSesion]);

  const abrir = useCallback(() => {
    setEntorno(leerEntorno());
    setServidor(null);
    setSuscripto(null);
    setError(null);
    setNota(null);
    setIntento((n) => n + 1);
    setAbierto(true);
  }, []);
  const cerrar = useCallback(() => {
    setAbierto(false);
  }, []);

  const capacidades = capacidadesDe(entorno);
  const instalacion = decidirInstalacion(
    { esIOS: capacidades.esIOS, instalada: capacidades.instalada || instalacionApp.instalada },
    instalacionApp.evento !== null,
  );
  const avisos = decidirAvisos({ servidor, capacidades, suscripto, error });

  const instalar = async () => {
    setOcupado('instalando');
    setNota(null);
    const resultado = await pedirInstalacion();
    setOcupado(null);
    if (resultado === 'aceptada') setNota('Listo, se está instalando. La vas a encontrar en tu pantalla de inicio.');
  };

  const activar = async () => {
    if (servidor === null || servidor === 'error' || !servidor.clavePublica) return;
    setOcupado('activando');
    setError(null);
    setNota(null);
    try {
      const resultado = await activarAvisos(servidor.clavePublica, usuarioId);
      setEntorno(leerEntorno());
      if (resultado === 'activado') {
        setSuscripto(true);
        void actualizarGlobito();
      } else if (Notification.permission === 'default') {
        setNota('No diste el permiso, así que los avisos siguen apagados. Podés probar de nuevo cuando quieras.');
      }
    } catch (falla) {
      if (esSesionPerdida(falla)) alVencerSesion(falla.message);
      else setError(mensajeDeFallo(falla, falla instanceof Error ? falla.message : undefined));
      setEntorno(leerEntorno());
    } finally {
      setOcupado(null);
    }
  };

  const desactivar = async () => {
    setOcupado('desactivando');
    setError(null);
    setNota(null);
    try {
      await desactivarAvisos();
      setSuscripto(false);
    } catch (falla) {
      if (esSesionPerdida(falla)) alVencerSesion(falla.message);
      else setError(mensajeDeFallo(falla, 'No pudimos apagar los avisos. Probá de nuevo.'));
    } finally {
      setOcupado(null);
    }
  };

  const alternarAvisos = async () => {
    if (suscripto === true && capacidades.permiso === 'granted') await desactivar();
    else await activar();
  };

  const reintentar = async () => {
    if (servidor === 'error') {
      setServidor(null);
      setError(null);
      setIntento((n) => n + 1);
      return;
    }
    if (suscripto === true) await desactivar();
    else await activar();
  };

  const probar = async () => {
    setOcupado('probando');
    setError(null);
    setNota(null);
    try {
      await probarAviso();
      setNota('Mandamos un aviso de prueba. Si no lo ves, revisá que las notificaciones de esta app estén permitidas en tu celular.');
    } catch (falla) {
      setError(mensajeDeFallo(falla, 'No pudimos mostrar el aviso de prueba. Probá de nuevo.'));
    } finally {
      setOcupado(null);
    }
  };

  return { instalacion, avisos, encendido: suscripto === true && capacidades.permiso === 'granted', sinServidor: servidor === 'error', ocupado, nota, abrir, cerrar, instalar, alternarAvisos, reintentar, probar };
}
