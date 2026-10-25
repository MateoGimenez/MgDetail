import * as z from 'zod/mini';
import { esFechaValida, rangoDeTurno } from '../lib/fechas';

/**
 * CONTRATO CON EL BACKEND. Única definición de los valores que viajan por la
 * API, tomados de backend/src/domain/booking.ts y del contrato del catálogo
 * (reportes/2026-10-22_07_catalogo-editable.md).
 * Tipos, etiquetas y esquemas se derivan de acá: no repetir estos valores.
 */

export const VEHICULO_TIPOS = ['auto', 'camioneta', 'moto'] as const;
/** Sin ñ: en la interfaz se lee "Mañana". */
export const FRANJAS = ['manana', 'tarde'] as const;
export const ESTADOS = ['pendiente', 'confirmado', 'completado', 'cancelado'] as const;

/**
 * Id (slug) de un servicio. Ya no es una lista fija: el catálogo vive en la base y se edita desde el panel.
 * Que tenga la forma de SLUG_SERVICIO lo controla el front; que exista y esté activo lo decide el catálogo
 * cargado y, en última instancia, el backend.
 */
export type ServicioId = string;
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

export const esVehiculoTipo = incluido(VEHICULO_TIPOS);
export const esFranja = incluido(FRANJAS);
export const esEstado = incluido(ESTADOS);

/* ---------- Catálogo de servicios ---------- */

/** Formato del id de un servicio: minúsculas, números y guiones simples, hasta 64 caracteres. */
export const SLUG_SERVICIO = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_SERVICIO_MAXIMO = 64;

export const esSlugDeServicio = (valor: string): boolean =>
  valor.length <= SLUG_SERVICIO_MAXIMO && SLUG_SERVICIO.test(valor);

/** Campos públicos de un servicio (GET /api/servicios). El panel suma activo, orden y updatedAt. */
export const camposServicioPublico = {
  id: z.string(),
  nombre: z.string(),
  resumen: z.string(),
  descripcion: z.string(),
  incluye: z.array(z.string()),
  glosario: z.array(z.object({ termino: z.string(), significado: z.string() })),
  duracion: z.nullable(z.string()),
  /** Entero en pesos; null = "Consultá". */
  precioDesde: z.nullable(z.int()),
  destacado: z.boolean(),
};

/** La landing lee con tolerancia (z.object descarta campos de más); si la forma no cierra, usa el respaldo. */
export const servicioPublicoSchema = z.object(camposServicioPublico);
export type ServicioPublico = z.output<typeof servicioPublicoSchema>;

export const catalogoPublicoSchema = z.object({ servicios: z.array(servicioPublicoSchema) });

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
export const PROHIBIDO_VARIAS_LINEAS = /[^\P{Cc}\t\n\r]|\p{Bidi_Control}/u;
const CARACTERES_TELEFONO = /^[0-9 +\-()]+$/;
const contarDigitos = (valor: string) => (valor.match(/\d/g) ?? []).length;
const esEmail = z.email();

/**
 * Esquema de la solicitud de turno, con las mismas reglas que el backend.
 * Se arma con `now` porque el rango de fechas depende de "hoy", y con los ids del catálogo que
 * se está mostrando (sin lista, solo se controla la forma del id).
 */
export function crearEsquemaTurno(now: Date, idsDeServicio?: readonly string[]) {
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
    servicioId: z
      .string({ error: 'Elegí un servicio.' })
      .check(
        z.refine(
          (v) => esSlugDeServicio(v) && (idsDeServicio === undefined || idsDeServicio.includes(v)),
          'Elegí un servicio.',
        ),
      ),
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
  /** Lo que pidió el cliente: nunca se pisa. */
  fechaPreferida: z.string(),
  franja: z.enum(FRANJAS),
  /**
   * Fecha y franja que confirmó el taller (contrato de la agenda, reportes/2026-10-22_08_agenda.md).
   * null = vale lo que pidió el cliente. Van siempre juntas: las dos null o las dos con valor.
   */
  fechaConfirmada: z.nullable(z.string()),
  franjaConfirmada: z.nullable(z.enum(FRANJAS)),
  comentario: z.nullable(z.string()),
  estado: z.enum(ESTADOS),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Nota del taller (reportes/2026-10-23_10_notas-busqueda-historial.md). El cliente nunca la ve. */
  notasInternas: z.nullable(z.string()),
  /**
   * Cuántos turnos hay con el mismo telefonoWhatsapp, contando este y todos los estados (1 = primer turno).
   * Sin telefonoWhatsapp es null. Con teléfono también puede venir null: un turno viejo todavía sin normalizar
   * (backend/src/domain/booking.ts) no se cuenta hasta correr `npm run normalizar-telefonos`; ahí no hay sello.
   */
  turnosDelCliente: z.nullable(z.int().check(z.gte(1))),
}).check(
  z.refine(
    (t) => (t.fechaConfirmada === null) === (t.franjaConfirmada === null),
    'La fecha y la franja confirmadas van juntas.',
  ),
  z.refine(
    (t) => t.telefonoWhatsapp !== null || t.turnosDelCliente === null,
    'Sin teléfono de WhatsApp no hay historial.',
  ),
);
export type Turno = z.output<typeof turnoSchema>;

/**
 * Cuerpo de PATCH /api/admin/bookings/:id: al menos uno de `estado`, la fecha/franja confirmadas (viajan juntas;
 * null las dos = volver a lo que pidió el cliente) o `notasInternas`, en cualquier combinación. Cambiar la fecha
 * es solo de superadmin y admin; la nota la cambia cualquier rol, en cualquier estado.
 */
export type FechaConfirmada =
  | { fechaConfirmada: string; franjaConfirmada: Franja }
  | { fechaConfirmada: null; franjaConfirmada: null };
type CambioEstado = { estado: Estado };
/** Texto ya recortado, de hasta NOTA_MAXIMO caracteres, o null para borrarla. */
type CambioNota = { notasInternas: string | null };
export type CambiosTurno =
  | CambioEstado
  | FechaConfirmada
  | CambioNota
  | (CambioEstado & FechaConfirmada)
  | (CambioEstado & CambioNota)
  | (FechaConfirmada & CambioNota)
  | (CambioEstado & FechaConfirmada & CambioNota);

/** Nota interna: hasta 1000 caracteres, con saltos de línea y tabulaciones. */
export const NOTA_MAXIMO = 1000;

/** `q` del listado: se recorta y tiene que quedar de 2 a 80 caracteres. */
export const BUSQUEDA = { min: 2, max: 80 } as const;
export const MENSAJE_BUSQUEDA = 'Escribí entre 2 y 80 caracteres para buscar.';

/** `cliente` del listado: un telefonoWhatsapp exacto. */
export const TELEFONO_WHATSAPP = /^\d{8,15}$/;

export const listaDeTurnosSchema = z.object({
  bookings: z.array(turnoSchema),
  total: z.int().check(z.gte(0)),
});

export const respuestaTurnoSchema = z.object({ booking: turnoSchema });

/* ---------- Disponibilidad y seguimiento (reportes/2026-10-23_11_disponibilidad-seguimiento-recordatorios.md) ---------- */

const fechaIso = z.string().check(z.refine(esFechaValida, 'Fecha inválida.'));
const cantidad = z.int().check(z.gte(0));

/**
 * Cupos de un día del rango de la agenda (GET /api/admin/agenda). `abierto` ya resuelve el día especial sobre el
 * horario semanal; un cupo en 0 cierra esa franja. Los ocupados cuentan pendientes, confirmados y completados.
 */
export const cupoDiaSchema = z.object({
  fecha: fechaIso,
  abierto: z.boolean(),
  cupoManana: cantidad,
  cupoTarde: cantidad,
  ocupadosManana: cantidad,
  ocupadosTarde: cantidad,
});
export type CupoDia = z.output<typeof cupoDiaSchema>;

/**
 * GET /api/admin/agenda: turnos no cancelados del rango, ya ordenados por fecha de agenda, franja y llegada, y los
 * cupos de cada día. Los cupos se leen con tolerancia: si faltan o no cierran, la agenda sigue funcionando sin ellos.
 */
export const agendaSchema = z.object({
  turnos: z.array(turnoSchema),
  cupos: z.catch(z.optional(z.array(cupoDiaSchema)), undefined),
});

/**
 * Un día de GET /api/disponibilidad (público). `manana` y `tarde` dicen si queda lugar; nunca vienen cantidades.
 * Un día cerrado trae las dos franjas en false.
 */
export const diaDisponibleSchema = z.object({
  fecha: fechaIso,
  abierto: z.boolean(),
  manana: z.boolean(),
  tarde: z.boolean(),
});
export type DiaDisponible = z.output<typeof diaDisponibleSchema>;

export const disponibilidadSchema = z.object({ dias: z.array(diaDisponibleSchema) });

/** 409 de POST /api/bookings cuando la franja se llenó (o tiene cupo 0) mientras el cliente completaba el formulario. */
export const CODIGO_FRANJA_LLENA = 'FRANJA_LLENA';

/** Ruta relativa /turno/<id>: nunca se arma un enlace a otro sitio con lo que diga una respuesta. */
const RUTA_SEGUIMIENTO = /^\/turno\/[0-9A-Za-z-]{1,64}$/;
export const esRutaDeSeguimiento = (valor: string) => RUTA_SEGUIMIENTO.test(valor);

/** Formato del id de un turno (UUID). Lo demás da el mismo "No encontramos ese turno" sin preguntarle al backend. */
export const ID_TURNO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const textoOpcional = z.catch(z.optional(z.string()), undefined);

/**
 * POST /api/bookings: con un 2xx el turno ya quedó creado, así que se lee con tolerancia. `seguimientoUrl` es la
 * ruta relativa /turno/<id>; se acepta arriba o dentro de `booking`.
 */
export const turnoCreadoSchema = z.catch(
  z.object({
    booking: z.looseObject({ id: textoOpcional, seguimientoUrl: textoOpcional }),
    seguimientoUrl: textoOpcional,
  }),
  { booking: {} },
);

/**
 * GET /api/turnos/:id (público). Solo lo que el cliente puede ver: servicio, fecha y franja de agenda, estado y
 * cuándo se actualizó. z.object descarta cualquier otro campo: aunque el backend mandara de más, no llega a la página.
 */
export const seguimientoSchema = z.object({
  turno: z.object({
    id: z.string(),
    servicioNombre: z.string(),
    fecha: fechaIso,
    franja: z.enum(FRANJAS),
    estado: z.enum(ESTADOS),
    actualizadoEl: z.string(),
  }),
});
export type TurnoSeguido = z.output<typeof seguimientoSchema>['turno'];
