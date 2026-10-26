import type { Booking } from './booking.js';

/**
 * Avisos push al celular cuando entra un turno nuevo (contrato: reportes/2026-10-26_13_panel-pulido-y-app.md, bloque A).
 */

/** Máximo de dispositivos por persona: al pasar ese número se descarta el más viejo. */
export const MAX_DISPOSITIVOS_POR_USUARIO = 10;

/** Largo máximo del endpoint (la misma cota que el CHECK de la base). */
export const MAX_ENDPOINT = 2048;

/**
 * Hosts de servicios de push de los navegadores. Es una lista permitida a propósito: el backend le hace un pedido
 * HTTPS a cada endpoint guardado, y sin esta lista cualquier usuario del panel podría apuntarlo a una dirección
 * cualquiera (SSRF).
 *   - FCM (Chrome, Edge, Opera, Brave, Samsung): fcm.googleapis.com
 *   - Firefox: updates.push.services.mozilla.com
 *   - Edge/Windows (WNS): *.notify.windows.com
 *   - Safari: web.push.apple.com y *.push.apple.com
 */
const HOSTS_EXACTOS: readonly string[] = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
const SUFIJOS_PERMITIDOS: readonly string[] = ['.notify.windows.com', '.push.apple.com'];

/**
 * true si el texto es una URL https, sin credenciales ni puerto raro, de un servicio de push conocido. Se aplica al
 * guardar la suscripción y otra vez antes de enviar.
 */
export function esEndpointPermitido(endpoint: string): boolean {
  // Literal 'https://' en minúsculas, como lo exige el CHECK de la base: new URL() también acepta 'HTTPS://', 'https:host/x'
  // y 'https:/host/x' (los normaliza), pero esos textos no pasarían el CHECK y darían un 500 en vez de un 400.
  if (endpoint.length > MAX_ENDPOINT || !endpoint.startsWith('https://') || /[\s\\]/.test(endpoint)) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return false;
  if (url.port !== '' && url.port !== '443') return false;
  // new URL ya baja el host a minúsculas (y pasa los nombres con acentos a punycode, que nunca coincide). Un punto
  // final ("fcm.googleapis.com.") no coincide con la lista: se rechaza.
  const host = url.hostname;
  if (HOSTS_EXACTOS.includes(host)) return true;
  // El sufijo exige al menos una etiqueta delante del punto: "notify.windows.com" solo no cuenta.
  return SUFIJOS_PERMITIDOS.some((sufijo) => host.endsWith(sufijo) && host.length > sufijo.length);
}

/** Una suscripción tal como la entrega PushSubscription.toJSON() (ya validada). */
export interface NuevaSuscripcion {
  endpoint: string;
  p256dh: string;
  auth: string;
  agente: string | null;
}

/** Lo que hace falta para mandar un aviso a un dispositivo. */
export interface DestinoPush {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Contenido del aviso: nunca nombre, teléfono, email, vehículo ni comentario. */
export interface PayloadPush {
  titulo: string;
  cuerpo: string;
  /** Cantidad de turnos pendientes (para el globito del ícono). */
  pendientes: number;
  url: string;
}

export interface PushRepository {
  /**
   * Guarda (o reasigna) el dispositivo a `perfilId` en una transacción: si el endpoint ya existía, se reemplaza la
   * fila (aunque fuera de otra persona: mismo aparato, otra persona). Si la persona queda con más de
   * MAX_DISPOSITIVOS_POR_USUARIO, se borran los más viejos.
   */
  guardar(perfilId: string, suscripcion: NuevaSuscripcion): Promise<void>;
  /** Borra el dispositivo con ese endpoint. true si existía. */
  borrarPorEndpoint(endpoint: string): Promise<boolean>;
  /** Dispositivos de las personas ACTIVAS del panel. */
  destinosActivos(): Promise<DestinoPush[]>;
  /** Borra dispositivos por id (el servicio de push respondió 404/410). Devuelve cuántos borró. */
  borrarPorIds(ids: readonly string[]): Promise<number>;
  /** Marca el último aviso entregado. */
  marcarAvisados(ids: readonly string[], now: Date): Promise<void>;
  /** Cantidad de turnos en estado pendiente (consulta barata: count sobre el índice por estado). */
  contarPendientes(): Promise<number>;
}

/** El servicio de push respondió con un error HTTP (o `status` 0 si no respondió). Nunca incluye endpoint ni claves. */
export class PushError extends Error {
  constructor(readonly status: number) {
    super(`El servicio de push respondió ${String(status)}`);
    this.name = 'PushError';
  }
}

/** Lo que el alta de turnos necesita del push: avisar de un turno nuevo. Nunca se rechaza. */
export interface BookingPushNotifier {
  avisarTurnoNuevo(booking: Booking, servicioNombre: string): Promise<void>;
}

/** Cliente de envío (web-push en producción; un doble en los tests). Se rechaza con PushError si no se entregó. */
export interface PushSender {
  send(destino: Pick<DestinoPush, 'endpoint' | 'p256dh' | 'auth'>, payload: string): Promise<void>;
}
