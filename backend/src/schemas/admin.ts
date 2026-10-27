import { z } from 'zod';
import { type Confirmada, type Estado, ESTADOS, FRANJAS, MONTO_MAX } from '../domain/booking.js';
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

export const MIN_BUSQUEDA = 2;
export const MAX_BUSQUEDA = 80;
const BUSQUEDA_MSG = `La búsqueda tiene que tener entre ${String(MIN_BUSQUEDA)} y ${String(MAX_BUSQUEDA)} caracteres.`;
const CLIENTE_MSG = 'El cliente tiene que ser un teléfono normalizado: solo dígitos, de 8 a 15.';

/** Recorta los espacios de un texto (y, si queda vacío, cuenta como no enviado). Otros tipos pasan tal cual. */
const trimToUndefined = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Largo en caracteres (code points), como char_length de Postgres: un emoji cuenta 1, no 2. */
const charLength = (text: string): number => Array.from(text).length;

/**
 * GET /api/admin/bookings?estado=&q=&cliente=&limit=&offset= (los parámetros desconocidos se ignoran).
 * `q`: trim, 2 a 80 caracteres (vacío o solo espacios = no enviado). `cliente`: un telefonoWhatsapp exacto.
 */
export const listBookingsQuerySchema = z.object({
  estado: z.preprocess(blankToUndefined, z.enum(ESTADOS, { error: ESTADO_MSG }).optional()),
  q: z.preprocess(
    trimToUndefined,
    z
      .string({ error: BUSQUEDA_MSG })
      .refine((text) => charLength(text) >= MIN_BUSQUEDA && charLength(text) <= MAX_BUSQUEDA, { error: BUSQUEDA_MSG })
      .optional(),
  ),
  cliente: z.preprocess(
    blankToUndefined,
    z.string({ error: CLIENTE_MSG }).regex(/^\d{8,15}$/, { error: CLIENTE_MSG }).optional(),
  ),
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

const MONTO_MSG = `El monto tiene que ser un número entero de pesos entre 0 y ${MONTO_MAX.toLocaleString('es-AR')}, o null.`;
const TRABAJADOR_MSG = 'El trabajador tiene que ser el id de una persona del panel, o null.';
const FECHA_CONFIRMADA_MSG = 'La fecha confirmada tiene que ser una fecha válida AAAA-MM-DD, o null.';
const FRANJA_CONFIRMADA_MSG = 'La franja confirmada tiene que ser manana, tarde o null.';
const JUNTAS_MSG = 'Mandá la fecha y la franja confirmadas juntas (las dos con valor o las dos en null).';
const VACIO_MSG = 'Indicá el estado nuevo, la fecha y la franja confirmadas, la nota interna o el cobro.';

export const MAX_NOTAS_INTERNAS = 1000;
const NOTAS_MSG = `La nota interna tiene que ser un texto de hasta ${String(MAX_NOTAS_INTERNAS)} caracteres, o null.`;
const NOTAS_CONTROL_MSG = 'La nota interna no puede tener caracteres de control (solo se permiten saltos de línea y tabulaciones).';
/** Caracteres de control C0 y C1 y DEL, salvo tabulación (\t) y salto de línea (\n). */
// eslint-disable-next-line no-control-regex -- justamente se buscan caracteres de control
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/;
/**
 * Controles bidireccionales (LRM, RLO, ...): se QUITAN, como en el comentario del turno y en el catálogo
 * (schemas/bookings.ts, schemas/servicios.ts). Son invisibles y pueden invertir el orden visual de la nota en el panel.
 */
const BIDI_CONTROLS = /\p{Bidi_Control}/gu;

/**
 * notasInternas: string o null. Los controles bidireccionales se quitan. Un salto de línea de Windows (\r\n) cuenta
 * como salto de línea (\n); cualquier otro carácter de control se rechaza. Se recortan los espacios de los extremos;
 * vacío o solo espacios => null.
 */
const notasInternasSchema = z
  .string({ error: NOTAS_MSG })
  .transform((text) => text.replace(BIDI_CONTROLS, '').replace(/\r\n/g, '\n').trim())
  .refine((text) => !CONTROL_CHARS.test(text), { error: NOTAS_CONTROL_MSG })
  .refine((text) => charLength(text) <= MAX_NOTAS_INTERNAS, { error: NOTAS_MSG })
  .transform((text) => (text === '' ? null : text))
  .nullable();

/**
 * Lo que pide un PATCH ya validado. `confirmada`: undefined = no se toca; null = volver a la fecha pedida.
 * `notasInternas`: undefined = no se toca; null = borrar la nota.
 */
export interface CambiosTurno {
  estado?: Estado;
  confirmada?: Confirmada | null;
  notasInternas?: string | null;
  /** Pesos cobrados. undefined = no se toca; null = borrarlo. Solo vale si el turno queda completado. */
  monto?: number | null;
  /** Quién hizo el trabajo (id de perfil). undefined = no se toca; null = dejarlo sin asignar. */
  trabajadorId?: string | null;
}

/**
 * PATCH /api/admin/bookings/:id { estado?, fechaConfirmada?, franjaConfirmada?, notasInternas?, monto?, trabajadorId? }.
 * Estricto. Al menos uno de `estado`, la pareja fecha + franja (juntas), `notasInternas`, `monto` o
 * `trabajadorId`. Acá solo el formato: el rango de fechas (depende de "hoy"), los permisos, el estado del turno y
 * que la persona exista y esté activa los verifica el servicio (services/agenda.ts).
 */
export const updateBookingSchema = z
  .strictObject({
    estado: z.enum(ESTADOS, { error: ESTADO_MSG }).optional(),
    notasInternas: notasInternasSchema.optional(),
    monto: z.number({ error: MONTO_MSG }).int({ error: MONTO_MSG }).min(0, { error: MONTO_MSG }).max(MONTO_MAX, { error: MONTO_MSG }).nullable().optional(),
    trabajadorId: z
      .uuid({ error: TRABAJADOR_MSG })
      .transform((id) => id.toLowerCase())
      .nullable()
      .optional(),
    fechaConfirmada: z
      .string({ error: FECHA_CONFIRMADA_MSG })
      .refine(isValidCalendarDate, { error: FECHA_CONFIRMADA_MSG })
      .nullable()
      .optional(),
    franjaConfirmada: z.enum(FRANJAS, { error: FRANJA_CONFIRMADA_MSG }).nullable().optional(),
  })
  .superRefine(({ estado, fechaConfirmada: fecha, franjaConfirmada: franja, notasInternas, monto, trabajadorId }, ctx) => {
    if (
      estado === undefined &&
      fecha === undefined &&
      franja === undefined &&
      notasInternas === undefined &&
      monto === undefined &&
      trabajadorId === undefined
    ) {
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
  .transform(({ estado, fechaConfirmada: fecha, franjaConfirmada: franja, notasInternas, monto, trabajadorId }): CambiosTurno => {
    const cambios: CambiosTurno = {};
    if (estado !== undefined) cambios.estado = estado;
    if (notasInternas !== undefined) cambios.notasInternas = notasInternas;
    if (monto !== undefined) cambios.monto = monto;
    if (trabajadorId !== undefined) cambios.trabajadorId = trabajadorId;
    if (fecha === null || franja === null) cambios.confirmada = null;
    else if (fecha !== undefined && franja !== undefined) cambios.confirmada = { fecha, franja };
    return cambios;
  });

/** Los ids de turnos son UUID aleatorios. Cualquier otra cosa no puede existir => 404. */
export const bookingIdSchema = z.uuid();

/** Un parámetro de fecha de las estadísticas: opcional (el servicio pone el valor por omisión), YYYY-MM-DD y existente. */
function fechaOpcionalParam(campo: 'desde' | 'hasta') {
  const message = `Indicá "${campo}" como una fecha válida con formato AAAA-MM-DD.`;
  return z.preprocess(
    blankToUndefined,
    z.string({ error: message }).refine(isValidCalendarDate, { error: message }).optional(),
  );
}

/**
 * GET /api/admin/estadisticas y /estadisticas/mias ?desde=&hasta= (inclusive; los parámetros desconocidos se
 * ignoran). Acá solo el formato; que `hasta` no sea anterior a `desde` y el máximo de 366 días los verifica el
 * servicio después de poner los valores por omisión (mes actual hasta hoy), en domain/estadisticas.ts.
 */
export const estadisticasQuerySchema = z.object({
  desde: fechaOpcionalParam('desde'),
  hasta: fechaOpcionalParam('hasta'),
});
