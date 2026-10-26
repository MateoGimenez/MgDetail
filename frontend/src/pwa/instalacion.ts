import { useSyncExternalStore } from 'react';
import { leerEntorno } from './entorno';

/**
 * Instalar la app. El navegador dispara `beforeinstallprompt` una sola vez y casi siempre antes de que la
 * persona abra los ajustes, así que se guarda acá apenas se abre el panel (escucharInstalacion) y los ajustes
 * lo leen cuando hace falta.
 */

/** Evento no estándar de Chrome/Edge/Samsung: ofrece el cuadro de instalación del sistema. */
export interface EventoDeInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface EstadoInstalacionApp {
  evento: EventoDeInstalacion | null;
  instalada: boolean;
}

let estado: EstadoInstalacionApp = { evento: null, instalada: false };
const oyentes = new Set<() => void>();
let referencias = 0;

function cambiar(siguiente: EstadoInstalacionApp) {
  estado = siguiente;
  oyentes.forEach((oyente) => {
    oyente();
  });
}

const alOfrecer = (evento: Event) => {
  // Se frena la barrita automática del navegador: la instalación se ofrece desde los ajustes.
  evento.preventDefault();
  cambiar({ ...estado, evento: evento as EventoDeInstalacion });
};
const alInstalar = () => {
  cambiar({ evento: null, instalada: true });
};

/** Empieza a escuchar. Devuelve la función que deja de hacerlo (se puede llamar desde varios lugares). */
export function escucharInstalacion(): () => void {
  if (referencias === 0) {
    estado = { evento: estado.evento, instalada: leerEntorno().instalada };
    window.addEventListener('beforeinstallprompt', alOfrecer);
    window.addEventListener('appinstalled', alInstalar);
  }
  referencias += 1;
  return () => {
    referencias -= 1;
    if (referencias === 0) {
      window.removeEventListener('beforeinstallprompt', alOfrecer);
      window.removeEventListener('appinstalled', alInstalar);
    }
  };
}

const suscribirse = (oyente: () => void) => {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
};
const instantanea = () => estado;

export function useInstalacion(): EstadoInstalacionApp {
  return useSyncExternalStore(suscribirse, instantanea, instantanea);
}

/** Muestra el cuadro de instalación del sistema. 'no-disponible' si el navegador no lo ofreció. */
export async function pedirInstalacion(): Promise<'aceptada' | 'rechazada' | 'no-disponible'> {
  const evento = estado.evento;
  if (!evento) return 'no-disponible';
  // El evento sirve una sola vez.
  cambiar({ ...estado, evento: null });
  try {
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    return outcome === 'accepted' ? 'aceptada' : 'rechazada';
  } catch {
    return 'no-disponible';
  }
}
