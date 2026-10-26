import { useEffect } from 'react';
import { escucharInstalacion } from './instalacion';
import { inyectarManifest, registrarServiceWorker } from './registro';

/**
 * Vuelve instalable el panel mientras está abierto /admin: manifest y metas de iOS en el <head>, service worker
 * registrado y escucha del ofrecimiento de instalación. Se llama desde AdminApp (que solo se carga en /admin).
 */
export function useInstalablePanel(): void {
  useEffect(() => {
    const quitarManifest = inyectarManifest();
    const dejarDeEscuchar = escucharInstalacion();
    void registrarServiceWorker();
    return () => {
      quitarManifest();
      dejarDeEscuchar();
    };
  }, []);
}
