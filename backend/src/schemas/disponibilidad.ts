import { z } from 'zod';
import { MAX_DIAS_DISPONIBILIDAD } from '../domain/booking-dates.js';
import { DIAS_SEMANA, MAX_CUPO } from '../domain/disponibilidad.js';
import { daysBetween, isValidCalendarDate } from '../lib/dates.js';

/** Un parámetro de query vacío (`?desde=`) cuenta como no enviado. */
const blankToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

/**
 * GET /api/disponibilidad?desde=&hasta= (los dos opcionales; los parámetros desconocidos se ignoran). Sin `desde`,
 * hoy; sin `hasta`, hoy + 60. Las dos fechas dentro de [hoy, hoy + 60] (hora de La Rioja), `hasta >= desde` y a lo
 * sumo 62 días. Se arma por request porque el rango depende de "hoy".
 */
export function disponibilidadQuerySchema(range: { min: string; max: string }) {
  const fecha = (campo: 'desde' | 'hasta', porDefecto: string) => {
    const message = `Indicá "${campo}" como una fecha válida con formato AAAA-MM-DD.`;
    return z.preprocess(
      blankToUndefined,
      z
        .string({ error: message })
        .refine(isValidCalendarDate, { error: message, abort: true })
        .refine((value) => value >= range.min && value <= range.max, {
          error: `"${campo}" tiene que estar entre ${range.min} y ${range.max}.`,
        })
        .default(porDefecto),
    );
  };
  return z
    .object({ desde: fecha('desde', range.min), hasta: fecha('hasta', range.max) })
    .superRefine(({ desde, hasta }, ctx) => {
      if (!isValidCalendarDate(desde) || !isValidCalendarDate(hasta)) return;
      const dias = daysBetween(desde, hasta);
      if (dias < 0) {
        ctx.addIssue({ code: 'custom', path: ['hasta'], message: '"hasta" no puede ser anterior a "desde".' });
      } else if (dias + 1 > MAX_DIAS_DISPONIBILIDAD) {
        ctx.addIssue({
          code: 'custom',
          path: ['hasta'],
          message: `La disponibilidad se consulta de a ${String(MAX_DIAS_DISPONIBILIDAD)} días como máximo.`,
        });
      }
    });
}

const CUPO_MSG = `El cupo tiene que ser un número entero entre 0 y ${String(MAX_CUPO)}.`;
const cupoSchema = z.int({ error: CUPO_MSG }).min(0, { error: CUPO_MSG }).max(MAX_CUPO, { error: CUPO_MSG });
const ABIERTO_MSG = 'Indicá si se atiende (abierto: true o false).';

const HORARIO_MSG = 'Mandá los 7 días de la semana (dia de 0 = domingo a 6 = sábado), cada uno una sola vez.';

/** PUT /api/admin/disponibilidad/horario-semanal { dias: [7 × { dia, abierto, cupoManana, cupoTarde }] }. Estricto. */
export const horarioSemanalSchema = z.strictObject({
  dias: z
    .array(
      z.strictObject({
        dia: z.int({ error: HORARIO_MSG }).min(0, { error: HORARIO_MSG }).max(6, { error: HORARIO_MSG }),
        abierto: z.boolean({ error: ABIERTO_MSG }),
        cupoManana: cupoSchema,
        cupoTarde: cupoSchema,
      }),
      { error: HORARIO_MSG },
    )
    .length(DIAS_SEMANA.length, { error: HORARIO_MSG })
    .refine((dias) => new Set(dias.map((d) => d.dia)).size === DIAS_SEMANA.length, { error: HORARIO_MSG }),
});

export const MAX_MOTIVO = 80;
const MOTIVO_MSG = `El motivo tiene que ser un texto de una línea de hasta ${String(MAX_MOTIVO)} caracteres, o null.`;
/** Controles bidireccionales: se quitan (como en el resto de los textos). Controles C0/C1: se rechazan. */
const BIDI_CONTROLS = /\p{Bidi_Control}/gu;
const CONTROL_CHARS = /\p{Cc}/u;

/** motivo: trim, una línea, hasta 80 caracteres (code points, como char_length); vacío o null => null. */
const motivoSchema = z
  .string({ error: MOTIVO_MSG })
  .transform((text) => text.replace(BIDI_CONTROLS, '').trim())
  .refine((text) => !CONTROL_CHARS.test(text), { error: MOTIVO_MSG })
  .refine((text) => Array.from(text).length <= MAX_MOTIVO, { error: MOTIVO_MSG })
  .transform((text) => (text === '' ? null : text))
  .nullable();

const CUPOS_OBLIGATORIOS_MSG = 'Si el día está abierto, indicá los cupos de la mañana y de la tarde.';

/**
 * PUT /api/admin/disponibilidad/dias-especiales/:fecha { abierto, cupoManana?, cupoTarde?, motivo? }. Estricto.
 * Abierto: los dos cupos son obligatorios. Cerrado: los cupos se ignoran (se guardan en null).
 */
export const diaEspecialSchema = z
  .strictObject({
    abierto: z.boolean({ error: ABIERTO_MSG }),
    cupoManana: cupoSchema.nullable().optional(),
    cupoTarde: cupoSchema.nullable().optional(),
    motivo: motivoSchema.optional(),
  })
  .superRefine(({ abierto, cupoManana, cupoTarde }, ctx) => {
    if (!abierto) return;
    if (cupoManana === undefined || cupoManana === null) {
      ctx.addIssue({ code: 'custom', path: ['cupoManana'], message: CUPOS_OBLIGATORIOS_MSG });
    }
    if (cupoTarde === undefined || cupoTarde === null) {
      ctx.addIssue({ code: 'custom', path: ['cupoTarde'], message: CUPOS_OBLIGATORIOS_MSG });
    }
  });

/** La fecha de la ruta /dias-especiales/:fecha: YYYY-MM-DD existente. */
export const fechaDiaEspecialSchema = z.string().refine(isValidCalendarDate);
