import { z } from 'zod';
import { MAX_ENDPOINT, esEndpointPermitido } from '../domain/push.js';

export const ENDPOINT_MSG =
  'El dispositivo no es válido: la dirección tiene que ser https y de un servicio de avisos conocido (Chrome, Firefox, Edge o Safari).';
const CLAVE_MSG = 'La clave del dispositivo no es válida.';

/** base64url sin relleno (el formato de PushSubscription.toJSON()). */
const base64url = (min: number, max: number) =>
  z
    .string({ error: CLAVE_MSG })
    .min(min, { error: CLAVE_MSG })
    .max(max, { error: CLAVE_MSG })
    .regex(/^[A-Za-z0-9_-]+$/, { error: CLAVE_MSG });

/**
 * POST /api/admin/push/suscripciones: la forma de PushSubscription.toJSON(). `expirationTime` lo manda el navegador
 * (casi siempre null): se acepta y se ignora. Cualquier otro campo se rechaza.
 */
export const suscripcionSchema = z.strictObject({
  endpoint: z
    .string({ error: ENDPOINT_MSG })
    .max(MAX_ENDPOINT, { error: ENDPOINT_MSG })
    .refine(esEndpointPermitido, { error: ENDPOINT_MSG }),
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject(
    {
      p256dh: base64url(80, 100), // punto P-256 sin comprimir: 65 bytes = 87 caracteres
      auth: base64url(16, 32), // secreto de 16 bytes = 22 caracteres
    },
    { error: CLAVE_MSG },
  ),
  agente: z
    .string({ error: 'El nombre del dispositivo no es válido.' })
    .trim()
    .min(1, { error: 'El nombre del dispositivo no puede estar vacío.' })
    .max(120, { error: 'El nombre del dispositivo es demasiado largo (máximo 120 caracteres).' })
    .regex(/^[^\p{Cc}]+$/u, { error: 'El nombre del dispositivo tiene caracteres no permitidos.' })
    .nullable()
    .optional(),
});

/** DELETE /api/admin/push/suscripciones: solo el endpoint (si no existe, no pasa nada). */
export const bajaSchema = z.strictObject({
  endpoint: z
    .string({ error: 'Falta la dirección del dispositivo.' })
    .min(1, { error: 'Falta la dirección del dispositivo.' })
    .max(MAX_ENDPOINT, { error: ENDPOINT_MSG }),
});
