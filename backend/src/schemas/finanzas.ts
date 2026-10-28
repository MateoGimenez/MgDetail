import { z } from 'zod';
import {
  CATEGORIAS_GASTO,
  type CambiosGasto,
  GASTO_DESCRIPCION_MAX,
  GASTO_MONTO_MAX,
  GASTO_MONTO_MIN,
  GASTO_PROVEEDOR_MAX,
} from '../domain/gastos.js';
import { META_INGRESOS_MAX, META_TRABAJOS_MAX, type ObjetivosMeta } from '../domain/metas.js';
import { TALLER_DIRECCION_MAX, TALLER_LEYENDA_MAX, TALLER_NOMBRE_MAX, type Taller } from '../domain/taller.js';
import { isValidCalendarDate } from '../lib/dates.js';
import {
  BIDI_CONTROLS,
  DEFAULT_PAGE_SIZE,
  MAX_BUSQUEDA,
  MAX_OFFSET,
  MAX_PAGE_SIZE,
  MIN_BUSQUEDA,
  blankToUndefined,
  charLength,
  integerParam,
  trimToUndefined,
} from './admin.js';

/*
 * Esquemas de Finanzas (gastos, metas) y de los datos del taller. Estrictos (strictObject): un campo de más es un
 * 400 con su nombre. Acá solo formato; las reglas que dependen de "hoy" o de la base (fecha no futura, mes
 * permitido, gasto de inventario) las verifican los servicios.
 */

const CONTROL_DE_LINEA = /\p{Cc}/u;

/**
 * Texto de una sola línea: se quitan los controles bidireccionales (invisibles; pueden invertir el orden visual) y los
 * espacios de los extremos; cualquier otro carácter de control (también saltos de línea y tabulaciones) se rechaza.
 * Largo en caracteres (code points), como char_length de Postgres.
 */
function textoBase(max: number, mensaje: string) {
  return z
    .string({ error: mensaje })
    .transform((texto) => texto.replace(BIDI_CONTROLS, '').trim())
    .refine((texto) => !CONTROL_DE_LINEA.test(texto), { error: mensaje })
    .refine((texto) => charLength(texto) <= max, { error: mensaje });
}

/** Obligatorio: al menos un carácter. */
export const textoDeUnaLinea = (max: number, mensaje: string) =>
  textoBase(max, mensaje).refine((texto) => texto !== '', { error: mensaje });

/** Opcional: vacío cuenta como null. */
export const textoOpcionalDeUnaLinea = (max: number, mensaje: string) =>
  textoBase(max, mensaje).transform((texto) => (texto === '' ? null : texto));

const FECHA_MSG = 'La fecha tiene que ser una fecha válida con formato AAAA-MM-DD.';
const fechaSchema = z.string({ error: FECHA_MSG }).refine(isValidCalendarDate, { error: FECHA_MSG });

const CATEGORIA_MSG = `La categoría tiene que ser una de: ${CATEGORIAS_GASTO.join(', ')}.`;
const categoriaSchema = z.enum(CATEGORIAS_GASTO, { error: CATEGORIA_MSG });

const DESCRIPCION_MSG = `La descripción tiene que tener entre 1 y ${String(GASTO_DESCRIPCION_MAX)} caracteres, sin saltos de línea.`;
const descripcionSchema = textoDeUnaLinea(GASTO_DESCRIPCION_MAX, DESCRIPCION_MSG);

const PROVEEDOR_MSG = `El proveedor tiene que tener hasta ${String(GASTO_PROVEEDOR_MAX)} caracteres, sin saltos de línea, o null.`;
const proveedorSchema = textoOpcionalDeUnaLinea(GASTO_PROVEEDOR_MAX, PROVEEDOR_MSG).nullable();

const MONTO_MSG = `El monto tiene que ser un número entero de pesos entre ${GASTO_MONTO_MIN.toLocaleString('es-AR')} y ${GASTO_MONTO_MAX.toLocaleString('es-AR')}.`;
const montoSchema = z
  .number({ error: MONTO_MSG })
  .int({ error: MONTO_MSG })
  .min(GASTO_MONTO_MIN, { error: MONTO_MSG })
  .max(GASTO_MONTO_MAX, { error: MONTO_MSG });

/** POST /api/admin/gastos { fecha, categoria, descripcion, monto, proveedor? }. */
export const crearGastoSchema = z.strictObject({
  fecha: fechaSchema,
  categoria: categoriaSchema,
  descripcion: descripcionSchema,
  monto: montoSchema,
  proveedor: proveedorSchema.optional(),
});

/** PATCH /api/admin/gastos/:id: cualquier campo; "al menos uno" lo exige la ruta. */
export const actualizarGastoSchema = z
  .strictObject({
    fecha: fechaSchema.optional(),
    categoria: categoriaSchema.optional(),
    descripcion: descripcionSchema.optional(),
    monto: montoSchema.optional(),
    proveedor: proveedorSchema.optional(),
  })
  .transform((valor): CambiosGasto => {
    const cambios: CambiosGasto = {};
    if (valor.fecha !== undefined) cambios.fecha = valor.fecha;
    if (valor.categoria !== undefined) cambios.categoria = valor.categoria;
    if (valor.descripcion !== undefined) cambios.descripcion = valor.descripcion;
    if (valor.monto !== undefined) cambios.monto = valor.monto;
    if (valor.proveedor !== undefined) cambios.proveedor = valor.proveedor;
    return cambios;
  });

const BUSQUEDA_MSG = `La búsqueda tiene que tener entre ${String(MIN_BUSQUEDA)} y ${String(MAX_BUSQUEDA)} caracteres.`;

/** Un parámetro de fecha opcional del listado: YYYY-MM-DD existente en el calendario. */
function fechaOpcional(campo: 'desde' | 'hasta') {
  const message = `Indicá "${campo}" como una fecha válida con formato AAAA-MM-DD.`;
  return z.preprocess(
    blankToUndefined,
    z.string({ error: message }).refine(isValidCalendarDate, { error: message }).optional(),
  );
}

/**
 * GET /api/admin/gastos?desde=&hasta=&categoria=&q=&limit=&offset= (los parámetros desconocidos se ignoran, como en el
 * resto de los listados). `q`: trim, 2 a 80 caracteres (vacío = no enviado).
 */
export const listarGastosQuerySchema = z.object({
  desde: fechaOpcional('desde'),
  hasta: fechaOpcional('hasta'),
  categoria: z.preprocess(blankToUndefined, categoriaSchema.optional()),
  q: z.preprocess(
    trimToUndefined,
    z
      .string({ error: BUSQUEDA_MSG })
      .refine((texto) => charLength(texto) >= MIN_BUSQUEDA && charLength(texto) <= MAX_BUSQUEDA, {
        error: BUSQUEDA_MSG,
      })
      .optional(),
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

/** Los ids de gastos son UUID aleatorios. Cualquier otra cosa no puede existir => 404. */
export const gastoIdSchema = z.uuid();

/* ----------------------------------------------------------------------------------------------- metas */

const MES_MSG = 'El mes tiene que tener formato AAAA-MM (por ejemplo 2026-10).';
/** YYYY-MM con mes 01 a 12 y año de 2000 a 2999. */
export const mesSchema = z.string({ error: MES_MSG }).regex(/^2\d{3}-(0[1-9]|1[0-2])$/, { error: MES_MSG });

const INGRESOS_META_MSG = `El objetivo de ingresos tiene que ser un número entero de pesos entre 1 y ${META_INGRESOS_MAX.toLocaleString('es-AR')}, o null.`;
const TRABAJOS_META_MSG = `El objetivo de trabajos tiene que ser un número entero entre 1 y ${META_TRABAJOS_MAX.toLocaleString('es-AR')}, o null.`;

/** PUT /api/admin/metas/:mes { ingresosObjetivo?, trabajosObjetivo? } (null vacía ese objetivo). */
export const guardarMetaSchema = z
  .strictObject({
    ingresosObjetivo: z
      .number({ error: INGRESOS_META_MSG })
      .int({ error: INGRESOS_META_MSG })
      .min(1, { error: INGRESOS_META_MSG })
      .max(META_INGRESOS_MAX, { error: INGRESOS_META_MSG })
      .nullable()
      .optional(),
    trabajosObjetivo: z
      .number({ error: TRABAJOS_META_MSG })
      .int({ error: TRABAJOS_META_MSG })
      .min(1, { error: TRABAJOS_META_MSG })
      .max(META_TRABAJOS_MAX, { error: TRABAJOS_META_MSG })
      .nullable()
      .optional(),
  })
  .transform((valor): Partial<ObjetivosMeta> => {
    const cambios: Partial<ObjetivosMeta> = {};
    if (valor.ingresosObjetivo !== undefined) cambios.ingresosObjetivo = valor.ingresosObjetivo;
    if (valor.trabajosObjetivo !== undefined) cambios.trabajosObjetivo = valor.trabajosObjetivo;
    return cambios;
  });

const ANIO_MSG = 'El año tiene que tener 4 dígitos (por ejemplo 2026).';
/** GET /api/admin/metas?anio=YYYY (sin año, el actual). */
export const listarMetasQuerySchema = z.object({
  anio: z.preprocess(
    blankToUndefined,
    z
      .string({ error: ANIO_MSG })
      .regex(/^2\d{3}$/, { error: ANIO_MSG })
      .transform(Number)
      .optional(),
  ),
});

/* ----------------------------------------------------------------------------------------------- taller */

const NOMBRE_TALLER_MSG = `El nombre tiene que tener entre 1 y ${String(TALLER_NOMBRE_MAX)} caracteres, sin saltos de línea.`;
const TELEFONO_MSG =
  'El teléfono tiene que ser solo dígitos con código de país, de 8 a 15 (por ejemplo 5493804781737), o null.';
const DIRECCION_MSG = `La dirección tiene que tener hasta ${String(TALLER_DIRECCION_MAX)} caracteres, sin saltos de línea, o null.`;
const INSTAGRAM_MSG =
  'El usuario de Instagram va sin @ y solo con letras, números, puntos y guiones bajos (hasta 30), o null.';
const CUIT_MSG = 'El CUIT tiene que tener 11 dígitos, con o sin guiones (20-12345678-9), o null.';
const LEYENDA_MSG = `La leyenda tiene que tener hasta ${String(TALLER_LEYENDA_MAX)} caracteres, sin saltos de línea, o null.`;

/** Un opcional con formato fijo: recorta, vacío = null, y valida. */
function opcionalConFormato(formato: RegExp, mensaje: string) {
  return z
    .string({ error: mensaje })
    .transform((texto) => texto.trim())
    .refine((texto) => texto === '' || formato.test(texto), { error: mensaje })
    .transform((texto) => (texto === '' ? null : texto))
    .nullable();
}

/**
 * PUT /api/admin/taller: reemplaza los seis campos. `nombre` es obligatorio; los otros cinco aceptan null (o no
 * mandarse, o un texto vacío) para vaciarlos.
 */
export const guardarTallerSchema = z
  .strictObject({
    nombre: textoDeUnaLinea(TALLER_NOMBRE_MAX, NOMBRE_TALLER_MSG),
    telefono: opcionalConFormato(/^\d{8,15}$/, TELEFONO_MSG).optional(),
    direccion: textoOpcionalDeUnaLinea(TALLER_DIRECCION_MAX, DIRECCION_MSG).nullable().optional(),
    instagram: opcionalConFormato(/^[A-Za-z0-9._]{1,30}$/, INSTAGRAM_MSG).optional(),
    cuit: opcionalConFormato(/^(\d{11}|\d{2}-\d{8}-\d)$/, CUIT_MSG).optional(),
    leyendaPdf: textoOpcionalDeUnaLinea(TALLER_LEYENDA_MAX, LEYENDA_MSG).nullable().optional(),
  })
  .transform(
    (valor): Taller => ({
      nombre: valor.nombre,
      telefono: valor.telefono ?? null,
      direccion: valor.direccion ?? null,
      instagram: valor.instagram ?? null,
      cuit: valor.cuit ?? null,
      leyendaPdf: valor.leyendaPdf ?? null,
    }),
  );
