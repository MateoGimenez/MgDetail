import { leerEntorno } from './entorno';

/**
 * La app instalable es solo el panel: el manifest y las metas de iOS se agregan al <head> cuando se abre /admin
 * (nunca están en index.html, para no volver instalable la web pública) y se sacan al salir de /admin.
 */
const URL_MANIFEST = '/admin/manifest.webmanifest';
const URL_SERVICE_WORKER = '/admin/sw.js';

const METAS_IOS: readonly (readonly [string, string])[] = [
  ['mobile-web-app-capable', 'yes'],
  ['apple-mobile-web-app-capable', 'yes'],
  ['apple-mobile-web-app-title', 'MG Panel'],
  ['apple-mobile-web-app-status-bar-style', 'black'],
];

/** Agrega <link rel="manifest"> y las metas de iOS. Devuelve la función que las saca. */
export function inyectarManifest(documento: Document = document): () => void {
  const agregadas: Element[] = [];
  const enlace = documento.createElement('link');
  enlace.rel = 'manifest';
  enlace.href = URL_MANIFEST;
  documento.head.append(enlace);
  agregadas.push(enlace);
  for (const [nombre, contenido] of METAS_IOS) {
    const meta = documento.createElement('meta');
    meta.name = nombre;
    meta.content = contenido;
    documento.head.append(meta);
    agregadas.push(meta);
  }
  return () => {
    for (const elemento of agregadas) elemento.remove();
  };
}

let registroEnCurso: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Registra el service worker del panel (una sola vez). Prueba con alcance "/admin" (cubre también la ruta sin
 * barra, que es la de inicio de la app); si el servidor no manda `Service-Worker-Allowed`, queda en "/admin/".
 * Devuelve null si el navegador no lo soporta o falla: el panel funciona igual, solo sin avisos.
 */
export function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  registroEnCurso ??= (async () => {
    if (!leerEntorno().tieneServiceWorker || !window.isSecureContext) return null;
    try {
      return await navigator.serviceWorker.register(URL_SERVICE_WORKER, { scope: '/admin' });
    } catch {
      try {
        return await navigator.serviceWorker.register(URL_SERVICE_WORKER, { scope: '/admin/' });
      } catch {
        return null;
      }
    }
  })();
  return registroEnCurso;
}

/** Espera a que el service worker esté activo (para poder suscribirse); null si tarda demasiado. */
export async function registroActivo(): Promise<ServiceWorkerRegistration | null> {
  const registro = await registrarServiceWorker();
  if (!registro) return null;
  if (registro.active) return registro;
  const pendiente = registro.installing ?? registro.waiting;
  if (!pendiente) return null;
  return new Promise((resolver) => {
    const reloj = window.setTimeout(() => {
      resolver(registro.active ? registro : null);
    }, 10_000);
    pendiente.addEventListener('statechange', () => {
      if (pendiente.state === 'activated') {
        window.clearTimeout(reloj);
        resolver(registro);
      } else if (pendiente.state === 'redundant') {
        window.clearTimeout(reloj);
        resolver(null);
      }
    });
  });
}
