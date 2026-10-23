import { z } from 'zod';
import { type Confirmada, type Estado, ESTADOS, FRANJAS } from '../domain/booking.js';
import { MAX_DIAS_AGENDA } from '../domain/booking-dates.js';
import { daysBetween, isValidCalendarDate } from '../lib/dates.js';

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

/** Un parámetro de fecha de la agenda: obligatorio, YYYY-MM-DD y existente en el calendario. */
function fechaParam(campo: 'desde' | 'hasta') {
  const message = `Indicá "${campo}" como una fecha válida con formato AAAA-MM-DD.`;
  return z.preprocess(
    blankToUndefined,
    z.string({ error: message }).refine(isValidCalendarDate, { error: message }),
  );
}

/**
 * GET /api/admin/agenda?desde=&hasta= (inclusive; los parámetros desconocidos se ignoran, como en el listado).
 * `hasta` no puede ser anterior a `desde` y el rango abarca a lo sumo 42 días.
 */
export const agendaQuerySchema = z
  .object({ desde: fechaParam('desde'), hasta: fechaParam('hasta') })
  .superRefine(({ desde, hasta }, ctx) => {
    // zod corre este refinamiento aunque una de las fechas haya fallado su propio refine: ya está informada.
    if (!isValidCalendarDate(desde) || !isValidCalendarDate(hasta)) return;
    const dias = daysBetween(desde, hasta);
    if (dias < 0) {
      ctx.addIssue({ code: 'custom', path: ['hasta'], message: '"hasta" no puede ser anterior a "desde".' });
    } else if (dias + 1 > MAX_DIAS_AGENDA) {
      ctx.addIssue({
        code: 'custom',
        path: ['hasta'],
        message: `La agenda se consulta de a ${String(MAX_DIAS_AGENDA)} días como máximo.`,
      });
    }
  });

const FECHA_CONFIRMADA_MSG = 'La fecha confirmada tiene que ser una fecha válida AAAA-MM-DD, o null.';
const FRANJA_CONFIRMADA_MSG = 'La franja confirmada tiene que ser manana, tarde o null.';
const JUNTAS_MSG = 'Mandá la fecha y la franja confirmadas juntas (las dos con valor o las dos en null).';
const VACIO_MSG = 'Indicá el estado nuevo, o la fecha y la franja confirmadas.';

/** Lo que pide un PATCH ya validado. `confirmada`: undefined = no se toca; null = volver a la fecha pedida. */
export interface CambiosTurno {
  estado?: Estado;
  confirmada?: Confirmada | null;
}

/**
 * PATCH /api/admin/bookings/:id { estado?, fechaConfirmada?, franjaConfirmada? }. Estricto. Al menos uno de
 * `estado` o la pareja fecha + franja (juntas). Acá solo el formato: el rango de fechas (depende de "hoy"), los
 * permisos y el estado del turno los verifica la ruta.
 */
export const updateBookingSchema = z
  .strictObject({
    estado: z.enum(ESTADOS, { error: ESTADO_MSG }).optional(),
    fechaConfirmada: z
      .string({ error: FECHA_CONFIRMADA_MSG })
      .refine(isValidCalendarDate, { error: FECHA_CONFIRMADA_MSG })
      .nullable()
      .optional(),
    franjaConfirmada: z.enum(FRANJAS, { error: FRANJA_CONFIRMADA_MSG }).nullable().optional(),
  })
  .superRefine(({ estado, fechaConfirmada: fecha, franjaConfirmada: franja }, ctx) => {
    if (estado === undefined && fecha === undefined && franja === undefined) {
      // Mismo campo que antes de la agenda: un body vacío sigue informando "estado".
      ctx.addIssue({ code: 'custom', path: ['estado'], message: VACIO_MSG });
      return;
    }
    // Falta una de las dos, o una es null y la otra no: el error va en la que falta (o en la que es null).
    if (fecha === undefined && franja !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['fechaConfirmada'], message: JUNTAS_MSG });
    } else if (franja === undefined && fecha !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['franjaConfirmada'], message: JUNTAS_MSG });
    } else if (fecha === null && franja !== null) {
      ctx.addIssue({ code: 'custom', path: ['fechaConfirmada'], message: JUNTAS_MSG });
    } else if (franja === null && fecha !== null) {
      ctx.addIssue({ code: 'custom', path: ['franjaConfirmada'], message: JUNTAS_MSG });
    }
  })
  .transform(({ estado, fechaConfirmada: fecha, franjaConfirmada: franja }): CambiosTurno => {
    const cambios: CambiosTurno = {};
    if (estado !== undefined) cambios.estado = estado;
    if (fecha === null || franja === null) cambios.confirmada = null;
    else if (fecha !== undefined && franja !== undefined) cambios.confirmada = { fecha, franja };
    return cambios;
  });

/** Los ids de turnos son UUID aleatorios. Cualquier otra cosa no puede existir => 404. */
export const bookingIdSchema = z.uuid();
