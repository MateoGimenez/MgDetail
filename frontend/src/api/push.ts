import * as z from 'zod/mini';
import { requestAdmin } from './sesion';

/** Contrato de los avisos push (reportes/2026-10-26_13_panel-pulido-y-app.md, bloque A). */

export const estadoPushSchema = z.object({
  disponible: z.boolean(),
  clavePublica: z.nullable(z.string()),
});

export const suscripcionGuardadaSchema = z.object({ ok: z.literal(true) });

export type EstadoPush = z.infer<typeof estadoPushSchema>;

/** Lo que se manda al servidor: la forma de `PushSubscription.toJSON()` más un nombre corto del aparato. */
export interface SuscripcionPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  agente?: string;
}

/** GET /api/admin/push/estado → si el servidor tiene avisos configurados y su clave pública. */
export async function estadoDeAvisos(signal?: AbortSignal): Promise<EstadoPush> {
  return requestAdmin('/admin/push/estado', { signal, schema: estadoPushSchema });
}

/** POST /api/admin/push/suscripciones → 201. Si el endpoint ya existía, el servidor lo reasigna a esta persona. */
export async function registrarSuscripcion(suscripcion: SuscripcionPush, signal?: AbortSignal): Promise<void> {
  await requestAdmin('/admin/push/suscripciones', {
    method: 'POST',
    body: suscripcion,
    signal,
    schema: suscripcionGuardadaSchema,
  });
}

/** DELETE /api/admin/push/suscripciones → 204 (también si no existía). */
export async function borrarSuscripcion(endpoint: string, signal?: AbortSignal): Promise<void> {
  await requestAdmin('/admin/push/suscripciones', { method: 'DELETE', body: { endpoint }, signal });
}
