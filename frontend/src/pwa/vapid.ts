/** Conversiones de la clave VAPID y de la suscripción push (puras, sin navegador). */

/** Clave pública VAPID: un punto de curva P-256 sin comprimir (65 bytes, empieza con 0x04). */
const LARGO_CLAVE = 65;

/** Convierte la clave VAPID (base64url, con o sin relleno) en los bytes que pide `PushManager.subscribe`. */
export function claveVapidABytes(clave: string): Uint8Array<ArrayBuffer> {
  const limpia = clave.trim().replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]+$/.test(limpia) || limpia.length % 4 === 1) {
    throw new Error('La clave de avisos del servidor no es válida.');
  }
  const base64 = limpia.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(limpia.length / 4) * 4, '=');
  const texto = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(texto.length));
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i);
  if (bytes.length !== LARGO_CLAVE || bytes[0] !== 4) throw new Error('La clave de avisos del servidor no es válida.');
  return bytes;
}

/** true si la clave con la que se suscribió el navegador es la misma que publica el servidor. */
export function mismaClave(actual: ArrayBuffer | null | undefined, esperada: Uint8Array): boolean {
  if (!actual) return false;
  const bytes = new Uint8Array(actual);
  return bytes.length === esperada.length && bytes.every((byte, i) => byte === esperada[i]);
}

export interface CuerpoSuscripcion {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  agente?: string;
}

/** Arma el cuerpo de POST /api/admin/push/suscripciones desde `PushSubscription.toJSON()`; null si falta algo. */
export function cuerpoSuscripcion(json: PushSubscriptionJSON, agente?: string): CuerpoSuscripcion | null {
  const { endpoint, keys } = json;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (!endpoint || !/^https:\/\//i.test(endpoint) || !p256dh || !auth) return null;
  const cuerpo: CuerpoSuscripcion = { endpoint, keys: { p256dh, auth } };
  const nombre = agente?.trim();
  if (nombre) cuerpo.agente = nombre.slice(0, 120);
  return cuerpo;
}
