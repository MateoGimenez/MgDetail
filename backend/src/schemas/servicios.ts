import { z } from 'zod';
import { VEHICULO_TIPOS, type VehiculoTipo } from '../domain/booking.js';
import {
  DESTACADO_INACTIVO_MSG,
  LIMITES_SERVICIO as L,
  SERVICIO_ID_MAX,
  SERVICIO_ID_REGEX,
  vehiculosCanonicos,
} from '../domain/servicios.js';

/*
 * Higiene del texto del catálogo (lo carga el dueño desde el panel y se muestra en la landing). Misma regla que el
 * formulario de turnos (ver schemas/bookings.ts): los controles bidireccionales se QUITAN y los controles C0/C1 se
 * RECHAZAN; la descripción admite saltos de línea y tabulaciones. Es validación de entrada, no escape de salida.
 */
const BIDI_CONTROLS = /\p{Bidi_Control}/gu;
const CONTROL_CHARS = /\p{Cc}/u;
/** Controles Cc salvo tab, LF y CR (para la descripción). */
const CONTROL_CHARS_EXCEPT_NEWLINES = /[^\P{Cc}\t\n\r]/u;

const stripBidi = (value: string): string => value.replace(BIDI_CONTROLS, '');

interface Mensajes {
  /** "el nombre", "cada ítem de incluye"... */
  campo: string;
  /** Mensaje si queda vacío (después del trim). */
  vacio: string;
}

const capitalizar = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);

/** Texto con trim, de 1 a `max` caracteres. Una sola línea salvo `multiLine`. */
function texto(max: number, { campo, vacio }: Mensajes, multiLine = false) {
  const prohibidos = multiLine ? CONTROL_CHARS_EXCEPT_NEWLINES : CONTROL_CHARS;
  return z
    .string({ error: `${capitalizar(campo)} tiene que ser un texto.` })
    .transform(stripBidi)
    .pipe(
      z
        .string()
        .trim()
        .min(1, { error: vacio })
        .max(max, { error: `${capitalizar(campo)} no puede tener más de ${String(max)} caracteres.` })
        .refine((value) => !prohibidos.test(value), {
          error: `${capitalizar(campo)} tiene caracteres que no se permiten.`,
        }),
    );
}

const ID_MSG =
  `El identificador tiene que tener solo minúsculas, números y guiones (por ejemplo, lavado-premium), ` +
  `hasta ${String(SERVICIO_ID_MAX)} caracteres.`;

/** Slug del servicio. Sin trim ni normalización: el id es exactamente lo que se guarda (y no cambia más). */
export const servicioIdSchema = z
  .string({ error: ID_MSG })
  .max(SERVICIO_ID_MAX, { error: ID_MSG })
  .regex(SERVICIO_ID_REGEX, { error: ID_MSG });

const nombre = texto(L.nombre, { campo: 'el nombre', vacio: 'Ingresá el nombre del servicio.' });
const resumen = texto(L.resumen, { campo: 'el resumen', vacio: 'Ingresá un resumen del servicio.' });
const descripcion = texto(L.descripcion, { campo: 'la descripción', vacio: 'Ingresá la descripción del servicio.' }, true);

const incluye = z
  .array(texto(L.incluyeItem, { campo: 'cada ítem de "incluye"', vacio: 'Completá el ítem o sacalo de la lista.' }), {
    error: '"Incluye" tiene que ser una lista de textos.',
  })
  .max(L.incluyeItems, { error: `"Incluye" puede tener hasta ${String(L.incluyeItems)} ítems.` });

const glosario = z
  .array(
    z.strictObject(
      {
        termino: texto(L.termino, { campo: 'el término', vacio: 'Completá el término o sacalo del glosario.' }),
        significado: texto(L.significado, { campo: 'el significado', vacio: 'Completá qué significa el término.' }),
      },
      { error: 'Cada entrada del glosario tiene que tener término y significado.' },
    ),
    { error: 'El glosario tiene que ser una lista de términos.' },
  )
  .max(L.glosarioItems, { error: `El glosario puede tener hasta ${String(L.glosarioItems)} términos.` });

/** "" o null => null (sin confirmar; en camioneta y moto, "usa la de auto"). */
const duracion = z
  .string({ error: 'La duración tiene que ser un texto o null.' })
  .transform(stripBidi)
  .pipe(
    z
      .string()
      .trim()
      .max(L.duracion, { error: `La duración no puede tener más de ${String(L.duracion)} caracteres.` })
      .refine((value) => !CONTROL_CHARS.test(value), { error: 'La duración tiene caracteres que no se permiten.' })
      .transform((value) => (value === '' ? null : value)),
  )
  .nullable();

const PRECIO_MSG = 'El precio tiene que ser un número entero de pesos, de 0 a 99.999.999, o null ("Consultá").';
const precio = z
  .number({ error: PRECIO_MSG })
  .int({ error: PRECIO_MSG })
  .min(0, { error: PRECIO_MSG })
  .max(L.precioMax, { error: PRECIO_MSG })
  .nullable();

const VEHICULOS_MSG = 'Elegí al menos un vehículo (auto, camioneta o moto) para el servicio.';
/** Lista de tipos de vehículo, de 1 a 3, sin repetidos; sale en orden canónico (auto, camioneta, moto). */
const vehiculos = z
  .array(z.unknown(), { error: VEHICULOS_MSG })
  .min(1, { error: VEHICULOS_MSG })
  // Todos los errores salen en fields.vehiculos (y no en vehiculos.0): el panel tiene un solo grupo de casillas.
  .refine((lista): lista is VehiculoTipo[] => lista.every((tipo) => VEHICULO_TIPOS.some((valido) => valido === tipo)), {
    error: 'Los vehículos válidos son auto, camioneta y moto.',
  })
  .refine((lista) => new Set(lista).size === lista.length, { error: 'No repitas vehículos en la lista.' })
  .transform(vehiculosCanonicos);

const destacado = z.boolean({ error: 'destacado tiene que ser true o false.' });
const activo = z.boolean({ error: 'activo tiene que ser true o false.' });

/**
 * Ids que no se pueden usar para un servicio nuevo porque son segmentos de ruta de /api/admin/servicios/ (hoy
 * PUT /orden). Con distinto método no chocarían, pero un servicio llamado "orden" sería confuso en la API y en el
 * panel. Solo se exige al crear: el id no cambia después.
 */
export const SERVICIO_IDS_RESERVADOS: readonly string[] = ['orden'];

/** POST /api/admin/servicios. Estricto (un campo desconocido, incluido `orden`, => 400). */
export const createServicioSchema = z.strictObject({
  id: servicioIdSchema.refine((id) => !SERVICIO_IDS_RESERVADOS.includes(id), {
    error: 'Ese identificador está reservado. Elegí otro.',
  }),
  nombre,
  resumen,
  descripcion,
  incluye: incluye.default([]),
  glosario: glosario.default([]),
  duracion: duracion.default(null),
  duracionCamioneta: duracion.default(null),
  duracionMoto: duracion.default(null),
  precioDesde: precio.default(null),
  precioDesdeCamioneta: precio.default(null),
  precioDesdeMoto: precio.default(null),
  vehiculos: vehiculos.default([...VEHICULO_TIPOS]),
  destacado: destacado.default(false),
  activo: activo.default(true),
}).refine((servicio) => !(servicio.destacado && !servicio.activo), {
  // No se puede destacar un servicio inactivo (el destacado se ve en la landing; un inactivo, no).
  error: DESTACADO_INACTIVO_MSG,
  path: ['destacado'],
});

/**
 * PATCH /api/admin/servicios/:id. Estricto: el id no se puede cambiar (si viene, 400 como cualquier campo
 * desconocido). Que venga al menos un campo lo verifica la ruta.
 */
export const updateServicioSchema = z.strictObject({
  nombre: nombre.optional(),
  resumen: resumen.optional(),
  descripcion: descripcion.optional(),
  incluye: incluye.optional(),
  glosario: glosario.optional(),
  duracion: duracion.optional(),
  duracionCamioneta: duracion.optional(),
  duracionMoto: duracion.optional(),
  precioDesde: precio.optional(),
  precioDesdeCamioneta: precio.optional(),
  precioDesdeMoto: precio.optional(),
  vehiculos: vehiculos.optional(),
  destacado: destacado.optional(),
  activo: activo.optional(),
}).refine((cambios) => !(cambios.destacado === true && cambios.activo === false), {
  // Desactivar y destacar en el mismo cambio. Destacar uno que YA está inactivo lo rechaza el repositorio (necesita
  // ver la base).
  error: DESTACADO_INACTIVO_MSG,
  path: ['destacado'],
});

/** Tope de ids en el reordenamiento: muy por encima de un catálogo real y lejos del límite de `orden` (smallint). */
const MAX_IDS_ORDEN = 500;

/** PUT /api/admin/servicios/orden { ids }. Que estén todos (ni falten ni sobren) lo verifica el repositorio. */
export const ordenServiciosSchema = z.strictObject({
  ids: z
    .array(servicioIdSchema, { error: 'Mandá la lista de ids de servicios en el orden nuevo.' })
    .min(1, { error: 'Mandá la lista de ids de servicios en el orden nuevo.' })
    .max(MAX_IDS_ORDEN, { error: 'La lista tiene demasiados servicios.' })
    .refine((ids) => new Set(ids).size === ids.length, { error: 'La lista tiene servicios repetidos.' }),
});
