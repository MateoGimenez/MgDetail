import { z } from 'zod';
import { ESTADOS } from '../domain/booking.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 1_000_000;

const ESTADO_MSG = 'El estado tiene que ser pendiente, confirmado, completado o cancelado.';

/** Un parámetro de query vacío (`?estado=`) cuenta como no enviado. */
const blankToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

function integerParam(min: number, max: number, message: string) {
  return z
    .string({ error: message })
    .regex(/^\d{1,7}$/, { error: message })
    .transform(Number)
    .refine((value) => value >= min && value <= max, { error: message });
}

/** GET /api/admin/bookings?estado=&limit=&offset= (los parámetros desconocidos se ignoran). */
export const listBookingsQuerySchema = z.object({
  estado: z.preprocess(blankToUndefined, z.enum(ESTADOS, { error: ESTADO_MSG }).optional()),
  limit: z.preprocess(
    blankToUndefined,
    integerParam(1, MAX_PAGE_SIZE, `El límite tiene que ser un número entre 1 y ${String(MAX_PAGE_SIZE)}.`).default(
      DEFAULT_PAGE_SIZE,
    ),
  ),
  offset: z.preprocess(
    blankToUndefined,
    integerParam(0, MAX_OFFSET, 'El desplazamiento tiene que ser un número entero mayor o igual a 0.').default(0),
  ),
});

/** PATCH /api/admin/bookings/:id */
export const updateEstadoSchema = z.strictObject({
  estado: z.enum(ESTADOS, { error: ESTADO_MSG }),
});

/** Los ids de turnos son UUID aleatorios. Cualquier otra cosa no puede existir => 404. */
export const bookingIdSchema = z.uuid();
