import { z } from 'zod';
import {
  CANTIDAD_MAX,
  COSTO_TOTAL_MAX,
  INSUMO_CATEGORIA_MAX,
  INSUMO_COSTO_MAX,
  INSUMO_NOMBRE_MAX,
  MOVIMIENTO_NOTA_MAX,
  MOVIMIENTO_PROVEEDOR_MAX,
  TIPOS_MOVIMIENTO,
  UNIDADES,
  type CambiosInsumo,
  type NuevoInsumo,
  type PedidoMovimiento,
} from '../domain/inventario.js';
import {
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
 * Esquemas del inventario. Estrictos (strictObject): un campo de más es un 400 con su nombre. Acá solo formato; las
 * reglas que dependen de la base (nombre repetido, stock insuficiente, turno inexistente) las verifica el servicio.
 */

const NOMBRE_MSG = `El nombre tiene que tener entre 1 y ${String(INSUMO_NOMBRE_MAX)} caracteres, sin saltos de línea.`;
const CATEGORIA_MSG = `La categoría tiene que tener hasta ${String(INSUMO_CATEGORIA_MAX)} caracteres, sin saltos de línea, o null.`;
const UNIDAD_MSG = `La unidad tiene que ser una de: ${UNIDADES.join(', ')}.`;
const NOTA_MSG = `La nota tiene que tener hasta ${String(MOVIMIENTO_NOTA_MAX)} caracteres, sin saltos de línea, o null.`;
const PROVEEDOR_MSG = `El proveedor tiene que tener hasta ${String(MOVIMIENTO_PROVEEDOR_MAX)} caracteres, sin saltos de línea, o null.`;
const COSTO_UNITARIO_MSG = `El costo unitario tiene que ser un número entero de pesos entre 0 y ${INSUMO_COSTO_MAX.toLocaleString('es-AR')}, o null.`;
const COSTO_TOTAL_MSG = `El costo total tiene que ser un número entero de pesos entre 0 y ${COSTO_TOTAL_MAX.toLocaleString('es-AR')}, o null.`;
const TURNO_MSG = 'El turno tiene que ser un identificador válido, o null.';

/** true si el número tiene a lo sumo 2 decimales. */
function tieneHastaDosDecimales(valor: number): boolean {
  return Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6;
}

/** Cantidad con hasta 2 decimales entre `min` y CANTIDAD_MAX. */
function cantidadSchema(mensaje: string, minimoExclusivo: boolean) {
  return z
    .number({ error: mensaje })
    .refine(
      (valor) =>
        Number.isFinite(valor) &&
        (minimoExclusivo ? valor > 0 : valor >= 0) &&
        valor <= CANTIDAD_MAX &&
        tieneHastaDosDecimales(valor),
      { error: mensaje },
    )
    // Ya redondeada a centésimas: 0.30000000000000004 no llega así a la base ni a las comparaciones de stock.
    .transform((valor) => Math.round(valor * 100) / 100);
}

const rangoMsg = (cosa: string, minimo: string) =>
  `${cosa} tiene que ser un número ${minimo} ${CANTIDAD_MAX.toLocaleString('es-AR')}, con hasta 2 decimales.`;

const nombreSchema = textoDeUnaLinea(INSUMO_NOMBRE_MAX, NOMBRE_MSG);
const categoriaSchema = textoOpcionalDeUnaLinea(INSUMO_CATEGORIA_MAX, CATEGORIA_MSG).nullable();
const unidadSchema = z.enum(UNIDADES, { error: UNIDAD_MSG });
const stockMinimoSchema = cantidadSchema(rangoMsg('El stock mínimo', 'entre 0 y'), false);
const costoUnitarioSchema = z
  .number({ error: COSTO_UNITARIO_MSG })
  .int({ error: COSTO_UNITARIO_MSG })
  .min(0, { error: COSTO_UNITARIO_MSG })
  .max(INSUMO_COSTO_MAX, { error: COSTO_UNITARIO_MSG })
  .nullable();
const notaSchema = textoOpcionalDeUnaLinea(MOVIMIENTO_NOTA_MAX, NOTA_MSG).nullable();

/** POST /api/admin/insumos { nombre, categoria?, unidad, stockInicial?, stockMinimo?, costoUnitario? }. */
export const crearInsumoSchema = z
  .strictObject({
    nombre: nombreSchema,
    categoria: categoriaSchema.optional(),
    unidad: unidadSchema,
    stockInicial: cantidadSchema(rangoMsg('El stock inicial', 'entre 0 y'), false).optional(),
    stockMinimo: stockMinimoSchema.optional(),
    costoUnitario: costoUnitarioSchema.optional(),
  })
  .transform(
    (valor): NuevoInsumo => ({
      nombre: valor.nombre,
      categoria: valor.categoria ?? null,
      unidad: valor.unidad,
      stockInicial: valor.stockInicial ?? 0,
      stockMinimo: valor.stockMinimo ?? 0,
      costoUnitario: valor.costoUnitario ?? null,
    }),
  );

/** PATCH /api/admin/insumos/:id: cualquier campo; "al menos uno" lo exige la ruta. */
export const actualizarInsumoSchema = z
  .strictObject({
    nombre: nombreSchema.optional(),
    categoria: categoriaSchema.optional(),
    unidad: unidadSchema.optional(),
    stockMinimo: stockMinimoSchema.optional(),
    costoUnitario: costoUnitarioSchema.optional(),
    activo: z.boolean({ error: 'Indicá si el insumo está activo (true o false).' }).optional(),
  })
  .transform((valor): CambiosInsumo => {
    const cambios: CambiosInsumo = {};
    if (valor.nombre !== undefined) cambios.nombre = valor.nombre;
    if (valor.categoria !== undefined) cambios.categoria = valor.categoria;
    if (valor.unidad !== undefined) cambios.unidad = valor.unidad;
    if (valor.stockMinimo !== undefined) cambios.stockMinimo = valor.stockMinimo;
    if (valor.costoUnitario !== undefined) cambios.costoUnitario = valor.costoUnitario;
    if (valor.activo !== undefined) cambios.activo = valor.activo;
    return cambios;
  });

const COSTO_POR_UNIDAD_MSG = 'El costo por unidad es demasiado alto: revisá la cantidad o el total.';
const CANTIDAD_MSG = rangoMsg('La cantidad', 'mayor que 0 y de hasta');
const STOCK_REAL_MSG = rangoMsg('El stock real', 'entre 0 y');
const cantidadMovimiento = cantidadSchema(CANTIDAD_MSG, true);

const turnoIdSchema = z.uuid({ error: TURNO_MSG }).nullable();
const proveedorSchema = textoOpcionalDeUnaLinea(MOVIMIENTO_PROVEEDOR_MAX, PROVEEDOR_MSG).nullable();

const TIPO_MSG = `El tipo tiene que ser uno de: ${TIPOS_MOVIMIENTO.join(', ')}.`;

/** POST /api/admin/insumos/:id/movimientos: según `tipo` (uso, compra o ajuste). Quién puede cada uno lo ve la ruta. */
export const movimientoSchema = z
  .discriminatedUnion(
    'tipo',
    [
      z.strictObject({
        tipo: z.literal('uso'),
        cantidad: cantidadMovimiento,
        nota: notaSchema.optional(),
        turnoId: turnoIdSchema.optional(),
      }),
      z.strictObject({
        tipo: z.literal('compra'),
        cantidad: cantidadMovimiento,
        costoTotal: z
          .number({ error: COSTO_TOTAL_MSG })
          .int({ error: COSTO_TOTAL_MSG })
          .min(0, { error: COSTO_TOTAL_MSG })
          .max(COSTO_TOTAL_MAX, { error: COSTO_TOTAL_MSG })
          .nullable()
          .optional(),
        proveedor: proveedorSchema.optional(),
        nota: notaSchema.optional(),
      }).superRefine((valor, ctx) => {
        // El costo por unidad (costoTotal ÷ cantidad, redondeado) tiene que entrar en el CHECK de insumos.costo_unitario.
        const costo = valor.costoTotal ?? 0;
        if (costo > 0 && Math.round(costo / valor.cantidad) > INSUMO_COSTO_MAX) {
          ctx.addIssue({ code: 'custom', path: ['costoTotal'], message: COSTO_POR_UNIDAD_MSG });
        }
      }),
      z.strictObject({
        tipo: z.literal('ajuste'),
        stockReal: cantidadSchema(STOCK_REAL_MSG, false),
        nota: notaSchema.optional(),
      }),
    ],
    { error: TIPO_MSG },
  )
  .transform((valor): PedidoMovimiento => {
    switch (valor.tipo) {
      case 'uso':
        return { tipo: 'uso', cantidad: valor.cantidad, nota: valor.nota ?? null, turnoId: valor.turnoId ?? null };
      case 'compra':
        return {
          tipo: 'compra',
          cantidad: valor.cantidad,
          costoTotal: valor.costoTotal ?? null,
          proveedor: valor.proveedor ?? null,
          nota: valor.nota ?? null,
        };
      case 'ajuste':
        return { tipo: 'ajuste', stockReal: valor.stockReal, nota: valor.nota ?? null };
    }
  });

const BUSQUEDA_MSG = `La búsqueda tiene que tener entre ${String(MIN_BUSQUEDA)} y ${String(MAX_BUSQUEDA)} caracteres.`;
const BAJO_STOCK_MSG = 'bajoStock tiene que ser true o false.';
const ACTIVO_MSG = 'activo tiene que ser true, false o todos.';
const LIMIT_MSG = `El límite tiene que ser un número entre 1 y ${String(MAX_PAGE_SIZE)}.`;
const OFFSET_MSG = 'El desplazamiento tiene que ser un número entero mayor o igual a 0.';

/**
 * GET /api/admin/insumos?q=&bajoStock=true&activo=true|false|todos&limit=&offset= (los parámetros desconocidos se
 * ignoran). Por omisión, solo los activos.
 */
export const listarInsumosQuerySchema = z.object({
  q: z.preprocess(
    trimToUndefined,
    z
      .string({ error: BUSQUEDA_MSG })
      .refine((texto) => charLength(texto) >= MIN_BUSQUEDA && charLength(texto) <= MAX_BUSQUEDA, { error: BUSQUEDA_MSG })
      .optional(),
  ),
  bajoStock: z.preprocess(
    blankToUndefined,
    z
      .enum(['true', 'false'], { error: BAJO_STOCK_MSG })
      .transform((valor) => valor === 'true')
      .optional(),
  ),
  activo: z.preprocess(blankToUndefined, z.enum(['true', 'false', 'todos'], { error: ACTIVO_MSG }).default('true')),
  limit: z.preprocess(blankToUndefined, integerParam(1, MAX_PAGE_SIZE, LIMIT_MSG).default(DEFAULT_PAGE_SIZE)),
  offset: z.preprocess(blankToUndefined, integerParam(0, MAX_OFFSET, OFFSET_MSG).default(0)),
});

/** GET /api/admin/insumos/:id/movimientos?limit=&offset=. */
export const listarMovimientosQuerySchema = z.object({
  limit: z.preprocess(blankToUndefined, integerParam(1, MAX_PAGE_SIZE, LIMIT_MSG).default(DEFAULT_PAGE_SIZE)),
  offset: z.preprocess(blankToUndefined, integerParam(0, MAX_OFFSET, OFFSET_MSG).default(0)),
});

/** Los ids de insumos son UUID aleatorios. Cualquier otra cosa no puede existir => 404. */
export const insumoIdSchema = z.uuid();
