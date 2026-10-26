import type { Capacidades } from './entorno';

/** Qué muestra "Instalar la app". */
export type EstadoInstalacion =
  | 'oculto' // ya está instalada
  | 'boton' // el navegador ofrece instalar con un toque
  | 'ios' // iPhone/iPad: Compartir → Agregar a inicio
  | 'menu'; // el navegador no ofrece el botón: se instala desde su menú

export function decidirInstalacion(
  capacidades: Pick<Capacidades, 'esIOS' | 'instalada'>,
  hayPrompt: boolean,
): EstadoInstalacion {
  if (capacidades.instalada) return 'oculto';
  if (hayPrompt) return 'boton';
  if (capacidades.esIOS) return 'ios';
  return 'menu';
}

/** Lo que dijo el servidor en GET /api/admin/push/estado (null mientras carga; 'error' si falló). */
export type EstadoDelServidor = { disponible: boolean; clavePublica: string | null } | 'error' | null;

/** Qué muestra "Avisarme de turnos nuevos". */
export type EstadoAvisos =
  | { tipo: 'cargando' }
  | { tipo: 'oculto' } // el servidor no tiene avisos configurados
  | { tipo: 'instalar-primero' } // iPhone/iPad: solo funcionan con la app en la pantalla de inicio
  | { tipo: 'sin-soporte' }
  | { tipo: 'bloqueado' }
  | { tipo: 'inactivo' }
  | { tipo: 'activo' }
  | { tipo: 'error'; mensaje: string };

export interface EntradaAvisos {
  servidor: EstadoDelServidor;
  capacidades: Capacidades;
  /** Este dispositivo tiene una suscripción activa (null si todavía no se sabe). */
  suscripto: boolean | null;
  /** Error de la última acción (activar, desactivar, probar), si hubo. */
  error: string | null;
}

export function decidirAvisos({ servidor, capacidades, suscripto, error }: EntradaAvisos): EstadoAvisos {
  if (servidor === null) return { tipo: 'cargando' };
  if (servidor === 'error') {
    return { tipo: 'error', mensaje: error ?? 'No pudimos consultar los avisos. Probá de nuevo.' };
  }
  if (!servidor.disponible || !servidor.clavePublica) return { tipo: 'oculto' };
  if (capacidades.esIOS && !capacidades.instalada) return { tipo: 'instalar-primero' };
  if (!capacidades.puedePush) return { tipo: 'sin-soporte' };
  if (capacidades.permiso === 'denied') return { tipo: 'bloqueado' };
  if (error) return { tipo: 'error', mensaje: error };
  if (suscripto === null) return { tipo: 'cargando' };
  if (suscripto && capacidades.permiso === 'granted') return { tipo: 'activo' };
  return { tipo: 'inactivo' };
}
