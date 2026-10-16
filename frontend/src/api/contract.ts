import * as z from 'zod/mini';
import { esFechaValida, rangoDeTurno } from '../lib/fechas';

/**
 * CONTRATO CON EL BACKEND. Única definición de los valores que viajan por la
 * API, tomados de backend/src/domain/booking.ts y backend/src/data/servicios.ts.
 * Tipos, etiquetas y esquemas se derivan de acá: no repetir estos valores.
 */

export const SERVICIO_IDS = [
  'lavado-basico',
  'lavado-premium',
  'pulido',
  'encerado',
  'restauracion-opticas',
] as const;
export const VEHICULO_TIPOS = ['auto', 'camioneta', 'moto'] as const;
/** Sin ñ: en la interfaz se lee "Mañana". */
export const FRANJAS = ['manana', 'tarde'] as const;
export const ESTADOS = ['pendiente', 'confirmado', 'completado', 'cancelado'] as const;

export type ServicioId = (typeof SERVICIO_IDS)[number];
export type VehiculoTipo = (typeof VEHICULO_TIPOS)[number];
export type Franja = (typeof FRANJAS)[number];
export type Estado = (typeof ESTADOS)[number];

export const ETIQUETA_VEHICULO: Readonly<Record<VehiculoTipo, string>> = {
  auto: 'Auto',
  camioneta: 'Camioneta',
  moto: 'Moto',
};

export const ETIQUETA_FRANJA: Readonly<Record<Franja, string>> = {
  manana: 'Mañana',
  tarde: 'Tarde',
};

/** Para frases: "por la mañana", "por la tarde". */
export const FRANJA_EN_FRASE: Readonly<Record<Franja, string>> = {
  manana: 'por la mañana',
  tarde: 'por la tarde',
};

export const ETIQUETA_ESTADO: Readonly<Record<Estado, string>> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

const incluido =
  <T extends string>(lista: readonly T[]) =>
  (valor: string): valor is T =>
    (lista as readonly string[]).includes(valor);

export const esServicioId = incluido(SERVICIO_IDS);
export const esVehiculoTipo = incluido(VEHICULO_TIPOS);
export const esFranja = incluido(FRANJAS);
export const esEstado = incluido(ESTADOS);

/** Límites de POST /api/bookings (backend/src/schemas/bookings.ts). */
export const LIMITES = {
  nombre: { min: 2, max: 80 },
  telefono: { min: 8, max: 20, digitos: 8 },
  email: { max: 120 },
  vehiculoModelo: { max: 80 },
  comentario: { max: 500 },
} as const;

/* El backend rechaza caracteres de control y de dirección de texto (no se escriben con el teclado). */
const PROHIBIDO_UNA_LINEA = /[\p{Cc}\p{Bidi_Control}]/u;
const PROHIBIDO_VARIAS_LINEAS = /[^\P{Cc}\t\n\r]|\p{Bidi_Control}/u;
const CARACTERES_TELEFONO = /^[0-9 +\-()]+$/;
const contarDigitos = (valor: string) => (valor.match(/\d/g) ?? []).length;
const esEmail = z.email();

/**
 * Esquema de la solicitud de turno, con las mismas reglas que el backend.
 * Se arma con `now` porque el rango de fechas depende de "hoy".
 */
export function crearEsquemaTurno(now: Date) {
  const { min, max } = rangoDeTurno(now);

  return z.strictObject({
    nombre: z
      .string()
      .check(
        z.trim(),
        z.minLength(LIMITES.nombre.min, 'Escribí tu nombre (al menos 2 letras).'),
        z.maxLength(LIMITES.nombre.max, 'El nombre puede tener hasta 80 caracteres.'),
        z.refine((v) => !PROHIBIDO_UNA_LINEA.test(v), 'El nombre tiene caracteres que no se permiten.'),
      ),
    telefono: z.string().check(
      z.trim(),
      z.superRefine((valor, ctx) => {
        const problema =
          valor === ''
            ? 'Dejanos un teléfono para confirmarte el turno.'
            : !CARACTERES_TELEFONO.test(valor)
              ? 'Usá solo números, espacios, +, - o paréntesis.'
              : valor.length < LIMITES.telefono.min || contarDigitos(valor) < LIMITES.telefono.digitos
                ? 'El teléfono tiene que tener al menos 8 números.'
                : valor.length > LIMITES.telefono.max
                  ? 'El teléfono puede tener hasta 20 caracteres.'
                  : null;
        if (problema) ctx.issues.push({ code: 'custom', message: problema, input: valor });
      }),
    ),
    email: z
      .string()
      .check(
        z.trim(),
        z.maxLength(LIMITES.email.max, 'El email puede tener hasta 120 caracteres.'),
        z.refine((v) => v === '' || z.safeParse(esEmail, v).success, 'Revisá el email: parece que le falta algo.'),
      ),
    vehiculoTipo: z.enum(VEHICULO_TIPOS, { error: 'Elegí el tipo de vehículo.' }),
    vehiculoModelo: z
      .string()
      .check(
        z.trim(),
        z.maxLength(LIMITES.vehiculoModelo.max, 'El modelo puede tener hasta 80 caracteres.'),
        z.refine((v) => !PROHIBIDO_UNA_LINEA.test(v), 'El modelo tiene caracteres que no se permiten.'),
      ),
    servicioId: z.enum(SERVICIO_IDS, { error: 'Elegí un servicio.' }),
    fechaPreferida: z.string().check(
      z.trim(),
      z.superRefine((valor, ctx) => {
        const problema =
          valor === ''
            ? 'Elegí qué día te queda bien.'
            : !esFechaValida(valor)
              ? 'Esa fecha no es válida.'
              : valor < min
                ? 'Elegí una fecha de hoy en adelante.'
                : valor > max
                  ? 'Podés pedir turno hasta 60 días adelante.'
                  : null;
        if (problema) ctx.issues.push({ code: 'custom', message: problema, input: valor });
      }),
    ),
    franja: z.enum(FRANJAS, { error: 'Elegí si te queda mejor a la mañana o a la tarde.' }),
    comentario: z
      .string()
      .check(
        z.trim(),
        z.maxLength(LIMITES.comentario.max, 'El comentario puede tener hasta 500 caracteres.'),
        z.refine((v) => !PROHIBIDO_VARIAS_LINEAS.test(v), 'El comentario tiene caracteres que no se permiten.'),
      ),
    /** Honeypot: una persona nunca lo completa. */
    website: z.string(),
  });
}

/** Cuerpo de POST /api/bookings: exactamente estos campos, ni uno más. */
export type TurnoNuevo = z.output<ReturnType<typeof crearEsquemaTurno>>;
export type CampoTurno = keyof TurnoNuevo;

/* ---------- Respuestas (estrictas: el contrato es fijo) ---------- */

export const turnoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  /** Tal como lo escribió el cliente. */
  telefono: z.string(),
  /** Solo dígitos, formato internacional, normalizado por el backend. null si no se pudo. */
  telefonoWhatsapp: z.nullable(z.string()),
  email: z.nullable(z.string()),
  vehiculoTipo: z.enum(VEHICULO_TIPOS),
  vehiculoModelo: z.nullable(z.string()),
  /** Texto libre: un turno viejo puede apuntar a un servicio que ya no está en el catálogo. */
  servicioId: z.string(),
  fechaPreferida: z.string(),
  franja: z.enum(FRANJAS),
  comentario: z.nullable(z.string()),
  estado: z.enum(ESTADOS),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Turno = z.output<typeof turnoSchema>;

export const listaDeTurnosSchema = z.object({
  bookings: z.array(turnoSchema),
  total: z.int().check(z.gte(0)),
});

export const respuestaTurnoSchema = z.object({ booking: turnoSchema });

export const respuestaAdminSchema = z.object({ admin: z.object({ email: z.string() }) });

/** POST /api/bookings: con un 2xx el turno ya quedó creado, así que se lee con tolerancia. */
export const turnoCreadoSchema = z.catch(
  z.object({ booking: z.looseObject({ id: z.optional(z.string()) }) }),
  { booking: {} },
);
