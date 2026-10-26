/**
 * Qué puede hacer este dispositivo con la app instalable y los avisos. Todo lo de acá es puro (recibe los datos
 * ya leídos) para poder probarlo sin navegador; la lectura real está en `leerEntorno()`.
 */

export type Permiso = NotificationPermission | 'no-soportado';

export interface DatosDelEntorno {
  userAgent: string;
  /** navigator.platform (en iPad con iPadOS 13+ dice "MacIntel"). */
  plataforma: string;
  puntosTactiles: number;
  /** La app está abierta como app instalada (sin barra del navegador). */
  instalada: boolean;
  /** Página servida por https o localhost: sin eso no hay service worker ni avisos. */
  contextoSeguro: boolean;
  tieneServiceWorker: boolean;
  tienePushManager: boolean;
  tieneNotification: boolean;
  permiso: Permiso;
}

/** iPhone, iPod o iPad (incluido el iPad que se hace pasar por Mac). */
export function esDispositivoIOS(userAgent: string, plataforma: string, puntosTactiles: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return plataforma === 'MacIntel' && puntosTactiles > 1;
}

export interface Capacidades {
  esIOS: boolean;
  instalada: boolean;
  /** El navegador sabe de avisos push (service worker, PushManager y Notification, en contexto seguro). */
  puedePush: boolean;
  permiso: Permiso;
}

export function capacidadesDe(datos: DatosDelEntorno): Capacidades {
  return {
    esIOS: esDispositivoIOS(datos.userAgent, datos.plataforma, datos.puntosTactiles),
    instalada: datos.instalada,
    puedePush:
      datos.contextoSeguro && datos.tieneServiceWorker && datos.tienePushManager && datos.tieneNotification,
    permiso: datos.tieneNotification ? datos.permiso : 'no-soportado',
  };
}

/** Lee el navegador real. */
export function leerEntorno(): DatosDelEntorno {
  const nav = navigator as Navigator & { standalone?: boolean };
  const tieneNotification = 'Notification' in window;
  return {
    userAgent: nav.userAgent,
    plataforma: nav.platform,
    puntosTactiles: nav.maxTouchPoints,
    instalada: window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true,
    contextoSeguro: window.isSecureContext,
    tieneServiceWorker: 'serviceWorker' in nav,
    tienePushManager: 'PushManager' in window,
    tieneNotification,
    permiso: tieneNotification ? Notification.permission : 'no-soportado',
  };
}

/** Nombre corto del aparato ("Chrome · Android") para que la persona lo reconozca. Máximo 120 caracteres. */
export function agenteCorto(userAgent: string): string {
  const navegador = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /SamsungBrowser/.test(userAgent)
        ? 'Samsung Internet'
        : /Firefox|FxiOS/.test(userAgent)
          ? 'Firefox'
          : /Chrome|CriOS/.test(userAgent)
            ? 'Chrome'
            : /Safari/.test(userAgent)
              ? 'Safari'
              : 'Navegador';
  const sistema = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPod/.test(userAgent)
      ? 'iPhone'
      : /iPad/.test(userAgent)
        ? 'iPad'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(userAgent)
            ? 'Mac'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : '';
  return (sistema ? `${navegador} · ${sistema}` : navegador).slice(0, 120);
}
