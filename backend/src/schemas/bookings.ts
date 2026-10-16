import { z } from 'zod';
import { FRANJAS, VEHICULO_TIPOS } from '../domain/booking.js';
import { MAX_DAYS_AHEAD } from '../domain/booking-dates.js';
import { SERVICIO_IDS } from '../domain/servicios.js';
import { isValidCalendarDate } from '../lib/dates.js';

/*
 * Higiene del texto que llega del formulario.
 *
 * - Controles bidireccionales (propiedad Unicode Bidi_Control: LRM, RLM, LRE, RLE, PDF, LRO, RLO, LRI, RLI, FSI,
 *   PDI): se QUITAN. Son invisibles, pueden invertir el orden visual del texto en el panel ("spoofing") y,
 *   además, aparecen solos al copiar y pegar un contacto desde WhatsApp o la agenda del celular: rechazarlos
 *   haría fallar un teléfono que se ve perfecto.
 * - Controles C0/C1 y DEL (propiedad Cc): se RECHAZAN. Falsifican logs y terminales y no vienen de un copy-paste.
 *   El comentario puede tener saltos de línea y tabulaciones.
 *
 * Es validación de entrada, no escape de salida: quien muestre estos datos debe escaparlos igual (React lo hace
 * por defecto; nunca usar innerHTML / dangerouslySetInnerHTML con estos campos).
 *
 * Los patrones usan propiedades Unicode (ASCII puro) y no caracteres invisibles escritos en el código:
 * test/source-hygiene.test.ts verifica que ningún fuente contenga caracteres invisibles literales.
 */
const BIDI_CONTROLS = /\p{Bidi_Control}/gu;
/** Todos los caracteres de formato (Cf: bidi, ancho cero, BOM, guion blando). Un teléfono no necesita ninguno. */
const FORMAT_CHARS = /\p{Cf}/gu;
/** Espacios Unicode raros (NBSP, espacio fino, etc.) que se normalizan a un espacio común. */
const EXOTIC_SPACES = /\p{Zs}/gu;
const CONTROL_CHARS = /\p{Cc}/u;
/** Controles Cc salvo tab, LF y CR (para el comentario). */
const CONTROL_CHARS_EXCEPT_NEWLINES = /[^\P{Cc}\t\n\r]/u;

const stripBidi = (value: string): string => value.replace(BIDI_CONTROLS, '');
const cleanPhoneText = (value: string): string => value.replace(FORMAT_CHARS, '').replace(EXOTIC_SPACES, ' ');
const isSingleLine = (value: string): boolean => !CONTROL_CHARS.test(value);
const isMultiLine = (value: string): boolean => !CONTROL_CHARS_EXCEPT_NEWLINES.test(value);
const blankToNull = (value: string): string | null => (value === '' ? null : value);
const countDigits = (value: string): number => (value.match(/\d/g) ?? []).length;
/** En los campos opcionales, un `null` explícito equivale a omitirlo. */
const nullToUndefined = (value: unknown): unknown => (value === null ? undefined : value);

const TELEFONO_MSG = 'Revisá el teléfono: usá solo números, espacios, +, - y paréntesis (mínimo 8 dígitos).';
const EMAIL_MSG = 'Revisá el email.';

/**
 * Esquema de POST /api/bookings. Se arma por request porque el rango de fechas depende de "hoy".
 * Es estricto: cualquier campo que no esté acá se rechaza.
 */
export function createBookingSchema(range: { min: string; max: string }) {
  return z.strictObject({
    nombre: z
      .string({ error: 'Ingresá tu nombre.' })
      .transform(stripBidi)
      .pipe(
        z
          .string()
          .trim()
          .min(2, { error: 'El nombre tiene que tener al menos 2 caracteres.' })
          .max(80, { error: 'El nombre no puede tener más de 80 caracteres.' })
          .refine(isSingleLine, { error: 'El nombre tiene caracteres que no se permiten.' }),
      ),

    // Se guarda y se devuelve tal como lo escribió el cliente (con trim, y sin caracteres invisibles).
    telefono: z
      .string({ error: 'Ingresá tu teléfono.' })
      .transform(cleanPhoneText)
      .pipe(
        z
          .string()
          .trim()
          .min(8, { error: TELEFONO_MSG })
          .max(20, { error: TELEFONO_MSG })
          .regex(/^[0-9 +\-()]+$/, { error: TELEFONO_MSG })
          .refine((value) => countDigits(value) >= 8, { error: TELEFONO_MSG }),
      ),

    // Opcional: "" u omitido => null.
    email: z.preprocess(
      nullToUndefined,
      z
        .string({ error: EMAIL_MSG })
        .transform(stripBidi)
        .pipe(
          z
            .string()
            .trim()
            .toLowerCase()
            .max(120, { error: 'El email no puede tener más de 120 caracteres.' })
            .transform(blankToNull)
            .pipe(z.union([z.null(), z.email({ error: EMAIL_MSG })])),
        )
        .default(null),
    ),

    vehiculoTipo: z.enum(VEHICULO_TIPOS, { error: 'Elegí el tipo de vehículo (auto, camioneta o moto).' }),

    vehiculoModelo: z.preprocess(
      nullToUndefined,
      z
        .string({ error: 'Revisá el modelo del vehículo.' })
        .transform(stripBidi)
        .pipe(
          z
            .string()
            .trim()
            .max(80, { error: 'El modelo no puede tener más de 80 caracteres.' })
            .refine(isSingleLine, { error: 'El modelo tiene caracteres que no se permiten.' })
            .transform(blankToNull),
        )
        .default(null),
    ),

    servicioId: z.enum(SERVICIO_IDS, { error: 'Elegí un servicio de la lista.' }),

    // YYYY-MM-DD, existente en el calendario, desde hoy hasta hoy + 60 días (zona America/Argentina/La_Rioja).
    fechaPreferida: z
      .string({ error: 'Elegí la fecha del turno.' })
      .trim()
      .refine(isValidCalendarDate, { error: 'Elegí una fecha válida.', abort: true })
      .refine((value) => value >= range.min, { error: 'La fecha no puede ser anterior a hoy.', abort: true })
      .refine((value) => value <= range.max, {
        error: `Solo podés pedir turno con hasta ${String(MAX_DAYS_AHEAD)} días de anticipación.`,
      }),

    franja: z.enum(FRANJAS, { error: 'Elegí una franja horaria (mañana o tarde).' }),

    comentario: z.preprocess(
      nullToUndefined,
      z
        .string({ error: 'Revisá el comentario.' })
        .transform(stripBidi)
        .pipe(
          z
            .string()
            .trim()
            .max(500, { error: 'El comentario no puede tener más de 500 caracteres.' })
            .refine(isMultiLine, { error: 'El comentario tiene caracteres que no se permiten.' })
            .transform(blankToNull),
        )
        .default(null),
    ),

    // Honeypot: campo oculto en el formulario que una persona nunca completa. Si viene con contenido, es un bot.
    website: z.string({ error: 'Campo no válido.' }).optional(),
  });
}
