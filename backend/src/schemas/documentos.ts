import { z } from 'zod';
import { COMPROBANTE_NOTAS_MAX, type DatosComprobante, FORMAS_DE_PAGO } from '../domain/comprobantes.js';
import {
  ESTADOS_PRESUPUESTO,
  ITEM_CANTIDAD_MAX,
  ITEM_DESCRIPCION_MAX,
  ITEM_PRECIO_MAX,
  PRESUPUESTO_CLIENTE_MAX,
  PRESUPUESTO_DESCUENTO_MAX,
  PRESUPUESTO_ITEMS_MAX,
  PRESUPUESTO_ITEMS_MIN,
  PRESUPUESTO_NOTAS_MAX,
  PRESUPUESTO_VEHICULO_MAX,
  VALIDEZ_DIAS_MAX,
  VALIDEZ_DIAS_MIN,
} from '../domain/presupuestos.js';
import { telefonoWhatsapp } from '../domain/telefono.js';
import {
  BIDI_CONTROLS,
  CONTROL_CHARS,
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
import { textoDeUnaLinea, textoOpcionalDeUnaLinea } from './finanzas.js';

/*
 * Esquemas de los presupuestos y los comprobantes. Estrictos (strictObject): un campo de más es un 400 con su nombre.
 * Los errores de los ítems llevan el campo con su posición: items.0.descripcion, items.2.cantidad,
 * items.1.precioUnitario. Las cuentas (subtotal, total) las hace domain/presupuestos.ts.
 */

const CLIENTE_MSG = `El nombre del cliente tiene que tener entre 1 y ${String(PRESUPUESTO_CLIENTE_MAX)} caracteres, sin saltos de línea.`;
const TELEFONO_MSG = 'No pudimos interpretar ese teléfono. Escribilo con el código de área (por ejemplo 380 412-3456), o dejalo vacío.';
const VEHICULO_MSG = `El vehículo tiene que tener hasta ${String(PRESUPUESTO_VEHICULO_MAX)} caracteres, sin saltos de línea, o null.`;
const NOTAS_MSG = `Las notas tienen que tener hasta ${String(PRESUPUESTO_NOTAS_MAX)} caracteres, o null.`;
const NOTAS_CONTROL_MSG = 'Las notas no pueden tener caracteres de control (solo se permiten saltos de línea y tabulaciones).';
const ITEMS_MSG = `El presupuesto tiene que llevar entre ${String(PRESUPUESTO_ITEMS_MIN)} y ${String(PRESUPUESTO_ITEMS_MAX)} ítems.`;
const ITEM_MSG = 'Cada ítem tiene que ser un objeto con descripción, cantidad y precio unitario.';
const ITEM_DESCRIPCION_MSG = `La descripción tiene que tener entre 1 y ${String(ITEM_DESCRIPCION_MAX)} caracteres, sin saltos de línea.`;
const ITEM_CANTIDAD_MSG = `La cantidad tiene que ser un número mayor que 0 y de hasta ${String(ITEM_CANTIDAD_MAX)}, con hasta 2 decimales.`;
const ITEM_PRECIO_MSG = `El precio unitario tiene que ser un número entero de pesos entre 0 y ${ITEM_PRECIO_MAX.toLocaleString('es-AR')}.`;
const DESCUENTO_MSG = `El descuento tiene que ser un número entero de pesos entre 0 y ${PRESUPUESTO_DESCUENTO_MAX.toLocaleString('es-AR')}.`;
const VALIDEZ_MSG = `La validez tiene que ser un número entero de días entre ${String(VALIDEZ_DIAS_MIN)} y ${String(VALIDEZ_DIAS_MAX)}.`;
const ESTADO_MSG = `El estado tiene que ser uno de: ${ESTADOS_PRESUPUESTO.join(', ')}.`;
const TURNO_MSG = 'El turno tiene que ser un identificador válido, o null.';

/** Teléfono => solo dígitos, formato internacional (549... si es celular argentino). Vacío = null. */
const telefonoSchema = z
  .string({ error: TELEFONO_MSG })
  .transform((texto) => texto.trim())
  .refine((texto) => texto.length <= 40, { error: TELEFONO_MSG })
  .refine((texto) => texto === '' || telefonoWhatsapp(texto) !== null, { error: TELEFONO_MSG })
  .transform((texto) => (texto === '' ? null : telefonoWhatsapp(texto)))
  .nullable();

/**
 * Texto de varias líneas (las notas): se quitan los controles bidireccionales; \r\n pasa a \n; cualquier otro control
 * (salvo tabulación y salto de línea) se rechaza. Largo en caracteres. Vacío = null.
 */
const notasSchema = z
  .string({ error: NOTAS_MSG })
  .transform((texto) => texto.replace(BIDI_CONTROLS, '').replace(/\r\n/g, '\n').trim())
  .refine((texto) => !CONTROL_CHARS.test(texto), { error: NOTAS_CONTROL_MSG })
  .refine((texto) => charLength(texto) <= PRESUPUESTO_NOTAS_MAX, { error: NOTAS_MSG })
  .transform((texto) => (texto === '' ? null : texto))
  .nullable();

/** true si el número tiene a lo sumo 2 decimales. */
function tieneHastaDosDecimales(valor: number): boolean {
  return Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6;
}

const itemSchema = z.strictObject(
  {
    descripcion: textoDeUnaLinea(ITEM_DESCRIPCION_MAX, ITEM_DESCRIPCION_MSG),
    cantidad: z
      .number({ error: ITEM_CANTIDAD_MSG })
      .refine((valor) => Number.isFinite(valor) && valor > 0 && valor <= ITEM_CANTIDAD_MAX && tieneHastaDosDecimales(valor), {
        error: ITEM_CANTIDAD_MSG,
      })
      // 1.7000000000000002 pasa la tolerancia de arriba pero la base (CHECK de 2 decimales exactos) lo rechazaría: se
      // guarda ya redondeado a centésimas.
      .transform((valor) => Math.round(valor * 100) / 100),
    precioUnitario: z
      .number({ error: ITEM_PRECIO_MSG })
      .int({ error: ITEM_PRECIO_MSG })
      .min(0, { error: ITEM_PRECIO_MSG })
      .max(ITEM_PRECIO_MAX, { error: ITEM_PRECIO_MSG }),
  },
  { error: ITEM_MSG },
);

const itemsSchema = z
  .array(itemSchema, { error: ITEMS_MSG })
  .min(PRESUPUESTO_ITEMS_MIN, { error: ITEMS_MSG })
  .max(PRESUPUESTO_ITEMS_MAX, { error: ITEMS_MSG });

const clienteNombreSchema = textoDeUnaLinea(PRESUPUESTO_CLIENTE_MAX, CLIENTE_MSG);
const vehiculoSchema = textoOpcionalDeUnaLinea(PRESUPUESTO_VEHICULO_MAX, VEHICULO_MSG).nullable();
const descuentoSchema = z
  .number({ error: DESCUENTO_MSG })
  .int({ error: DESCUENTO_MSG })
  .min(0, { error: DESCUENTO_MSG })
  .max(PRESUPUESTO_DESCUENTO_MAX, { error: DESCUENTO_MSG });
const validezSchema = z
  .number({ error: VALIDEZ_MSG })
  .int({ error: VALIDEZ_MSG })
  .min(VALIDEZ_DIAS_MIN, { error: VALIDEZ_MSG })
  .max(VALIDEZ_DIAS_MAX, { error: VALIDEZ_MSG });
const turnoIdSchema = z.uuid({ error: TURNO_MSG }).nullable();

/** Lo que pide el alta ya validado en su formato (el servicio calcula el total y pone quién lo creó). */
export interface DatosNuevoPresupuesto {
  clienteNombre: string;
  clienteTelefono: string | null;
  vehiculo: string | null;
  items: { descripcion: string; cantidad: number; precioUnitario: number }[];
  descuento: number;
  validezDias: number | undefined;
  notas: string | null;
  turnoId: string | null;
}

/** POST /api/admin/presupuestos { clienteNombre, clienteTelefono?, vehiculo?, items, descuento?, validezDias?, notas?, turnoId? }. */
export const crearPresupuestoSchema = z
  .strictObject({
    clienteNombre: clienteNombreSchema,
    clienteTelefono: telefonoSchema.optional(),
    vehiculo: vehiculoSchema.optional(),
    items: itemsSchema,
    descuento: descuentoSchema.optional(),
    validezDias: validezSchema.optional(),
    notas: notasSchema.optional(),
    turnoId: turnoIdSchema.optional(),
  })
  .transform(
    (valor): DatosNuevoPresupuesto => ({
      clienteNombre: valor.clienteNombre,
      clienteTelefono: valor.clienteTelefono ?? null,
      vehiculo: valor.vehiculo ?? null,
      items: valor.items,
      descuento: valor.descuento ?? 0,
      validezDias: valor.validezDias,
      notas: valor.notas ?? null,
      turnoId: valor.turnoId ?? null,
    }),
  );

/** Cambios de un PATCH ya validados: undefined = no se toca; null (donde se permite) = vaciar. */
export interface DatosCambiosPresupuesto {
  clienteNombre?: string;
  clienteTelefono?: string | null;
  vehiculo?: string | null;
  items?: { descripcion: string; cantidad: number; precioUnitario: number }[];
  descuento?: number;
  validezDias?: number;
  estado?: (typeof ESTADOS_PRESUPUESTO)[number];
  notas?: string | null;
  turnoId?: string | null;
}

/** PATCH /api/admin/presupuestos/:id: cualquier campo; "al menos uno" lo exige la ruta. `items` se reemplaza entero. */
export const actualizarPresupuestoSchema = z
  .strictObject({
    clienteNombre: clienteNombreSchema.optional(),
    clienteTelefono: telefonoSchema.optional(),
    vehiculo: vehiculoSchema.optional(),
    items: itemsSchema.optional(),
    descuento: descuentoSchema.optional(),
    validezDias: validezSchema.optional(),
    estado: z.enum(ESTADOS_PRESUPUESTO, { error: ESTADO_MSG }).optional(),
    notas: notasSchema.optional(),
    turnoId: turnoIdSchema.optional(),
  })
  .transform((valor): DatosCambiosPresupuesto => {
    const cambios: DatosCambiosPresupuesto = {};
    if (valor.clienteNombre !== undefined) cambios.clienteNombre = valor.clienteNombre;
    if (valor.clienteTelefono !== undefined) cambios.clienteTelefono = valor.clienteTelefono;
    if (valor.vehiculo !== undefined) cambios.vehiculo = valor.vehiculo;
    if (valor.items !== undefined) cambios.items = valor.items;
    if (valor.descuento !== undefined) cambios.descuento = valor.descuento;
    if (valor.validezDias !== undefined) cambios.validezDias = valor.validezDias;
    if (valor.estado !== undefined) cambios.estado = valor.estado;
    if (valor.notas !== undefined) cambios.notas = valor.notas;
    if (valor.turnoId !== undefined) cambios.turnoId = valor.turnoId;
    return cambios;
  });

const BUSQUEDA_MSG = `La búsqueda tiene que tener entre ${String(MIN_BUSQUEDA)} y ${String(MAX_BUSQUEDA)} caracteres.`;

/** GET /api/admin/presupuestos?estado=&q=&limit=&offset= (los parámetros desconocidos se ignoran). */
export const listarPresupuestosQuerySchema = z.object({
  estado: z.preprocess(blankToUndefined, z.enum(ESTADOS_PRESUPUESTO, { error: ESTADO_MSG }).optional()),
  q: z.preprocess(
    trimToUndefined,
    z
      .string({ error: BUSQUEDA_MSG })
      .refine((texto) => charLength(texto) >= MIN_BUSQUEDA && charLength(texto) <= MAX_BUSQUEDA, { error: BUSQUEDA_MSG })
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

/** Los ids de presupuestos y comprobantes son UUID aleatorios. Cualquier otra cosa no puede existir => 404. */
export const documentoIdSchema = z.uuid();

const FORMA_PAGO_MSG = `La forma de pago tiene que ser una de: ${FORMAS_DE_PAGO.join(', ')}.`;
const NOTAS_COMPROBANTE_MSG = `Las notas tienen que tener hasta ${String(COMPROBANTE_NOTAS_MAX)} caracteres, sin saltos de línea, o null.`;

/** POST /api/admin/bookings/:id/comprobante { formaPago, notas? }. */
export const emitirComprobanteSchema = z
  .strictObject({
    formaPago: z.enum(FORMAS_DE_PAGO, { error: FORMA_PAGO_MSG }),
    notas: textoOpcionalDeUnaLinea(COMPROBANTE_NOTAS_MAX, NOTAS_COMPROBANTE_MSG).nullable().optional(),
  })
  .transform((valor): DatosComprobante => ({ formaPago: valor.formaPago, notas: valor.notas ?? null }));
