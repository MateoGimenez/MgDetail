import webpush from 'web-push';
import type { PushConfig } from '../config.js';
import { PushError, type PushSender } from '../domain/push.js';

/** Cuánto vive un aviso en el servicio de push si el dispositivo está apagado (1 hora; un turno nuevo no es urgente). */
const TTL_SEGUNDOS = 60 * 60;

/** Status HTTP de un error de web-push (WebPushError.statusCode); 0 si no hubo respuesta (red, timeout, claves). */
function statusDe(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const { statusCode } = error;
    if (typeof statusCode === 'number' && Number.isInteger(statusCode)) return statusCode;
  }
  return 0;
}

/**
 * Envío real con la librería web-push (cifrado RFC 8291 + VAPID RFC 8292). Las claves VAPID viajan solo en la
 * cabecera Authorization firmada. Si falla se rechaza con PushError(status): el error original (que puede traer el
 * endpoint o las cabeceras) no sale de acá. web-push no sigue redirecciones.
 */
export function createWebPushSender(config: PushConfig, timeoutMs: number): PushSender {
  const vapidDetails = { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey };
  return {
    async send(destino, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: destino.endpoint, keys: { p256dh: destino.p256dh, auth: destino.auth } },
          payload,
          { vapidDetails, TTL: TTL_SEGUNDOS, urgency: 'normal', timeout: timeoutMs },
        );
      } catch (error) {
        throw new PushError(statusDe(error));
      }
    },
  };
}
