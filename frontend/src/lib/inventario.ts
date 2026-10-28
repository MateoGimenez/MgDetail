import { formatoPesos, leerMonto } from './cobro';

/**
 * Inventario (reportes/2026-10-27_17_finanzas-inventario-documentos.md) en funciones puras: unidades, formato de
 * cantidades es-AR, estado del stock, lectura de lo que escribe la persona y validación de los formularios.
 */

export const UNIDADES = ['unidad', 'litro', 'ml', 'kg', 'g', 'par', 'caja'] as const;
export type Unidad = (typeof UNIDADES)[number];

export const esUnidad = (valor: string): valor is Unidad => (UNIDADES as readonly string[]).includes(valor);

interface NombreUnidad {
  /** Cómo se escribe junto a un número: "4,5 L", "1 unidad", "3 unidades". */
  uno: string;
  varios: string;
  /** Para el desplegable del formulario. */
  etiqueta: string;
  /** Para hablar de la unidad en una frase ("por litro"). */
  singular: string;
}

const NOMBRES: Readonly<Record<Unidad, NombreUnidad>> = {
  unidad: { uno: 'unidad', varios: 'unidades', etiqueta: 'Unidades', singular: 'unidad' },
  litro: { uno: 'L', varios: 'L', etiqueta: 'Litros (L)', singular: 'litro' },
  ml: { uno: 'ml', varios: 'ml', etiqueta: 'Mililitros (ml)', singular: 'mililitro' },
  kg: { uno: 'kg', varios: 'kg', etiqueta: 'Kilos (kg)', singular: 'kilo' },
  g: { uno: 'g', varios: 'g', etiqueta: 'Gramos (g)', singular: 'gramo' },
  par: { uno: 'par', varios: 'pares', etiqueta: 'Pares', singular: 'par' },
  caja: { uno: 'caja', varios: 'cajas', etiqueta: 'Cajas', singular: 'caja' },
};

export const etiquetaDeUnidad = (unidad: Unidad): string => NOMBRES[unidad].etiqueta;
export const singularDeUnidad = (unidad: Unidad): string => NOMBRES[unidad].singular;

/** Tope de una cantidad (stock, uso, compra, mínimo): 999.999, con hasta 2 decimales. */
export const CANTIDAD_MAXIMA = 999_999;

/**
 * Número en es-AR: coma decimal, punto de miles, sin ceros de más y con 2 decimales como mucho. A mano: Intl pone
 * separadores distintos según el navegador.
 */
export function formatoNumero(n: number): string {
  const redondeado = Math.round(Math.abs(n) * 100) / 100;
  const [entera = '0', decimales = ''] = redondeado.toFixed(2).split('.');
  const miles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cola = decimales.replace(/0+$/, '');
  const signo = n < 0 && redondeado !== 0 ? '-' : '';
  return `${signo}${miles}${cola ? `,${cola}` : ''}`;
}

/** "4,5 L", "1 unidad", "3 unidades". */
export function formatoCantidad(cantidad: number, unidad: Unidad): string {
  const redondeada = Math.round(cantidad * 100) / 100;
  const nombre = redondeada === 1 ? NOMBRES[unidad].uno : NOMBRES[unidad].varios;
  return `${formatoNumero(cantidad)} ${nombre}`;
}

/** Cantidad de un movimiento con su signo: "+5 L", "−1,5 L" (menos de verdad, no guion). */
export function formatoCantidadConSigno(cantidad: number, unidad: Unidad): string {
  const signo = cantidad > 0 ? '+' : cantidad < 0 ? '−' : '';
  return `${signo}${formatoCantidad(Math.abs(cantidad), unidad)}`;
}

/* ---------- Estado del stock ---------- */

export type NivelStock = 'sin-stock' | 'bajo' | 'normal';

interface DatosDeStock {
  stock: number;
  stockMinimo: number;
}

/**
 * Sin stock (0), stock bajo (hay un mínimo y el stock no lo pasa; mismo criterio que `bajoStock` del backend) o
 * normal. "Sin stock" gana sobre "bajo": es lo más urgente.
 */
export function nivelDeStock({ stock, stockMinimo }: DatosDeStock): NivelStock {
  if (stock <= 0) return 'sin-stock';
  return stockMinimo > 0 && stock <= stockMinimo ? 'bajo' : 'normal';
}

export const TEXTO_NIVEL: Readonly<Record<NivelStock, string | null>> = {
  'sin-stock': 'Sin stock',
  bajo: 'Stock bajo',
  normal: null,
};

export interface BarraDeStock {
  /** 0 a 1: cuánto de la barra está lleno. */
  relleno: number;
  /** 0 a 1: dónde cae el mínimo en la barra. */
  minimo: number;
}

/**
 * La barra mide el stock contra el mínimo: el mínimo queda a la mitad cuando el stock está justo al doble, y se
 * corre hacia la izquierda si hay más. Sin mínimo cargado no hay con qué comparar: devuelve null (no se dibuja).
 */
export function barraDeStock({ stock, stockMinimo }: DatosDeStock): BarraDeStock | null {
  if (stockMinimo <= 0) return null;
  const tope = Math.max(stock, stockMinimo * 2);
  return {
    relleno: Math.min(1, Math.max(0, stock / tope)),
    minimo: Math.min(1, stockMinimo / tope),
  };
}

/** Línea de texto de la barra: "Mínimo 2 L" o "Sin mínimo cargado". */
export function textoDelMinimo(i: DatosDeStock & { unidad: Unidad }): string {
  return i.stockMinimo > 0 ? `Mínimo ${formatoCantidad(i.stockMinimo, i.unidad)}` : 'Sin mínimo cargado';
}

/** "3 insumos con stock bajo" / "1 insumo con stock bajo". */
export function textoStockBajo(cantidad: number): string {
  return cantidad === 1 ? '1 insumo con stock bajo' : `${String(cantidad)} insumos con stock bajo`;
}

/* ---------- Leer lo que escribe la persona ---------- */

export type ResultadoCantidad = { valor: number } | { error: string };

export const MENSAJE_CANTIDAD_NUMERO = 'Escribí un número, por ejemplo 2 o 1,5.';
export const MENSAJE_CANTIDAD_DECIMALES = 'Usá hasta 2 decimales.';
export const MENSAJE_CANTIDAD_POSITIVA = 'Tiene que ser más que cero.';

interface OpcionesCantidad {
  max?: number;
  /** Permite 0 (stock mínimo, conteo real). */
  cero?: boolean;
}

/**
 * Lee "4,5", "4.5", "1.250" (mil doscientos cincuenta) o "1.250,5". La coma es siempre el decimal; un punto es
 * decimal salvo que arme grupos de tres cifras ("1.250"). Hasta 2 decimales.
 */
export function leerCantidad(texto: string, { max = CANTIDAD_MAXIMA, cero = false }: OpcionesCantidad = {}): ResultadoCantidad {
  const limpio = texto.trim();
  if (limpio === '') return { error: 'Escribí cuánto.' };

  let normal: string | null = null;
  if (limpio.includes(',')) {
    const [entera = '', decimal = '', ...resto] = limpio.split(',');
    if (resto.length === 0 && /^(\d+|\d{1,3}(\.\d{3})+)$/.test(entera) && /^\d+$/.test(decimal)) {
      normal = `${entera.replaceAll('.', '')}.${decimal}`;
    }
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    normal = limpio.replaceAll('.', '');
  } else if (/^\d+(\.\d+)?$/.test(limpio)) {
    normal = limpio;
  }
  if (normal === null) return { error: MENSAJE_CANTIDAD_NUMERO };

  const decimales = normal.split('.')[1]?.length ?? 0;
  if (decimales > 2) return { error: MENSAJE_CANTIDAD_DECIMALES };
  const valor = Number(normal);
  if (!Number.isFinite(valor)) return { error: MENSAJE_CANTIDAD_NUMERO };
  if (valor === 0 && !cero) return { error: MENSAJE_CANTIDAD_POSITIVA };
  if (valor > max) return { error: `Es demasiado: el máximo es ${formatoNumero(max)}.` };
  return { valor };
}

/** Lo que va en un campo al editarlo: la cantidad con coma decimal y sin separador de miles. */
export const cantidadParaCampo = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

/* ---------- Formularios ---------- */

export const LIMITES_INSUMO = { nombre: 80, categoria: 40, nota: 200, proveedor: 80 } as const;

export interface FormularioInsumo {
  nombre: string;
  categoria: string;
  unidad: Unidad;
  /** Solo al crear. */
  stockInicial: string;
  stockMinimo: string;
  costoUnitario: string;
}

export const formularioInsumoVacio = (): FormularioInsumo => ({
  nombre: '',
  categoria: '',
  unidad: 'unidad',
  stockInicial: '',
  stockMinimo: '',
  costoUnitario: '',
});

export interface DatosInsumo {
  nombre: string;
  categoria: string | null;
  unidad: Unidad;
  stockInicial: number | null;
  stockMinimo: number;
  costoUnitario: number | null;
}

export type ErroresInsumo = Partial<Record<'nombre' | 'categoria' | 'stockInicial' | 'stockMinimo' | 'costoUnitario', string>>;

const largo = (texto: string) => Array.from(texto).length;

export function validarInsumo(
  f: FormularioInsumo,
  { alta }: { alta: boolean },
): { ok: true; datos: DatosInsumo } | { ok: false; errores: ErroresInsumo } {
  const errores: ErroresInsumo = {};
  const nombre = f.nombre.trim();
  const categoria = f.categoria.trim();
  if (nombre === '') errores.nombre = 'Escribí el nombre del insumo.';
  else if (largo(nombre) > LIMITES_INSUMO.nombre) errores.nombre = `Máximo ${String(LIMITES_INSUMO.nombre)} caracteres.`;
  if (largo(categoria) > LIMITES_INSUMO.categoria) errores.categoria = `Máximo ${String(LIMITES_INSUMO.categoria)} caracteres.`;

  let stockInicial: number | null = null;
  if (alta && f.stockInicial.trim() !== '') {
    const lectura = leerCantidad(f.stockInicial, { cero: true });
    if ('error' in lectura) errores.stockInicial = lectura.error;
    else stockInicial = lectura.valor;
  }

  let stockMinimo = 0;
  if (f.stockMinimo.trim() !== '') {
    const lectura = leerCantidad(f.stockMinimo, { cero: true });
    if ('error' in lectura) errores.stockMinimo = lectura.error;
    else stockMinimo = lectura.valor;
  }

  let costoUnitario: number | null = null;
  const costo = leerMonto(f.costoUnitario);
  if ('error' in costo) errores.costoUnitario = costo.error;
  else costoUnitario = costo.valor;

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return { ok: true, datos: { nombre, categoria: categoria === '' ? null : categoria, unidad: f.unidad, stockInicial, stockMinimo, costoUnitario } };
}

export type TipoMovimiento = 'compra' | 'uso' | 'ajuste';
export const TIPOS_MOVIMIENTO: readonly TipoMovimiento[] = ['compra', 'uso', 'ajuste'];

export const ETIQUETA_MOVIMIENTO: Readonly<Record<TipoMovimiento, string>> = {
  compra: 'Compra',
  uso: 'Uso',
  ajuste: 'Ajuste',
};

export interface FormularioMovimiento {
  /** uso y compra: cuánto. ajuste: el conteo real. */
  cantidad: string;
  costoTotal: string;
  proveedor: string;
  nota: string;
}

export const formularioMovimientoVacio = (): FormularioMovimiento => ({ cantidad: '', costoTotal: '', proveedor: '', nota: '' });

export type ErroresMovimiento = Partial<Record<'cantidad' | 'stockReal' | 'costoTotal' | 'proveedor' | 'nota', string>>;

/** Lo que se manda a POST /insumos/:id/movimientos, según el tipo. */
export type CuerpoMovimiento =
  | { tipo: 'uso'; cantidad: number; nota?: string }
  | { tipo: 'compra'; cantidad: number; costoTotal?: number; proveedor?: string; nota?: string }
  | { tipo: 'ajuste'; stockReal: number; nota?: string };

export function validarMovimiento(
  tipo: TipoMovimiento,
  f: FormularioMovimiento,
): { ok: true; cuerpo: CuerpoMovimiento } | { ok: false; errores: ErroresMovimiento } {
  const errores: ErroresMovimiento = {};
  const campoCantidad = tipo === 'ajuste' ? 'stockReal' : 'cantidad';
  const nota = f.nota.trim();
  const proveedor = f.proveedor.trim();

  const lectura = leerCantidad(f.cantidad, { cero: tipo === 'ajuste' });
  if ('error' in lectura) {
    errores[campoCantidad] = tipo === 'ajuste' && f.cantidad.trim() === '' ? 'Escribí cuánto hay ahora.' : lectura.error;
  }
  if (largo(nota) > LIMITES_INSUMO.nota) errores.nota = `Máximo ${String(LIMITES_INSUMO.nota)} caracteres.`;

  let costoTotal: number | null = null;
  if (tipo === 'compra') {
    const costo = leerMonto(f.costoTotal);
    if ('error' in costo) errores.costoTotal = costo.error;
    else costoTotal = costo.valor;
    if (largo(proveedor) > LIMITES_INSUMO.proveedor) errores.proveedor = `Máximo ${String(LIMITES_INSUMO.proveedor)} caracteres.`;
  }
  if (Object.keys(errores).length > 0 || 'error' in lectura) return { ok: false, errores };

  const valor = lectura.valor;
  if (tipo === 'uso') return { ok: true, cuerpo: { tipo, cantidad: valor, ...(nota ? { nota } : {}) } };
  if (tipo === 'ajuste') return { ok: true, cuerpo: { tipo, stockReal: valor, ...(nota ? { nota } : {}) } };
  return {
    ok: true,
    cuerpo: {
      tipo,
      cantidad: valor,
      ...(costoTotal !== null && costoTotal > 0 ? { costoTotal } : {}),
      ...(proveedor ? { proveedor } : {}),
      ...(nota ? { nota } : {}),
    },
  };
}

/** "Con $ 12.500 serían $ 2.500 por litro" mientras se escribe una compra. null si falta algún dato. */
export function costoPorUnidad(cantidad: number, costoTotal: number | null, unidad: Unidad): string | null {
  if (costoTotal === null || costoTotal <= 0 || cantidad <= 0) return null;
  return `${formatoPesos(Math.round(costoTotal / cantidad))} por ${singularDeUnidad(unidad)}`;
}

/** Diferencia de un conteo contra lo registrado: "1,5 L menos que lo registrado", "igual que lo registrado". */
export function textoDeDiferencia(stockActual: number, stockReal: number, unidad: Unidad): string {
  const diferencia = Math.round((stockReal - stockActual) * 100) / 100;
  if (diferencia === 0) return 'Es lo mismo que figura: no cambia nada.';
  const cuanto = formatoCantidad(Math.abs(diferencia), unidad);
  return diferencia > 0 ? `Son ${cuanto} más de lo que figura.` : `Son ${cuanto} menos de lo que figura.`;
}

/** Quién y cuánto de un movimiento para el historial: "Compra · +5 L". */
export function resumenDeMovimiento(m: { tipo: TipoMovimiento; cantidad: number }, unidad: Unidad): string {
  return `${ETIQUETA_MOVIMIENTO[m.tipo]} · ${formatoCantidadConSigno(m.cantidad, unidad)}`;
}

/* ---------- Avisos ---------- */

export function avisoDeMovimiento(tipo: TipoMovimiento, nombre: string, stockNuevo: number, unidad: Unidad): string {
  const queda = formatoCantidad(stockNuevo, unidad);
  if (tipo === 'uso') return `Anotado: ${nombre}. Quedan ${queda}.`;
  if (tipo === 'compra') return `Compra de ${nombre} cargada. Ahora hay ${queda}.`;
  return `Stock de ${nombre} ajustado: ahora hay ${queda}.`;
}

/** Parámetro `?bajoStock=1` de la dirección (el aviso de Hoy lleva al inventario ya filtrado). */
export const pideStockBajo = (busqueda: string): boolean => new URLSearchParams(busqueda).get('bajoStock') === '1';

/* ---------- Cuerpos para el backend ---------- */

interface InsumoGuardado {
  nombre: string;
  categoria: string | null;
  unidad: Unidad;
  stockMinimo: number;
  costoUnitario: number | null;
}

/** Lo que cambió respecto del insumo guardado (vacío = nada para guardar). Vaciar un opcional va como null. */
export function cambiosDeInsumo(original: InsumoGuardado, datos: DatosInsumo) {
  const cambios: {
    nombre?: string;
    categoria?: string | null;
    unidad?: Unidad;
    stockMinimo?: number;
    costoUnitario?: number | null;
  } = {};
  if (datos.nombre !== original.nombre) cambios.nombre = datos.nombre;
  if (datos.categoria !== original.categoria) cambios.categoria = datos.categoria;
  if (datos.unidad !== original.unidad) cambios.unidad = datos.unidad;
  if (datos.stockMinimo !== original.stockMinimo) cambios.stockMinimo = datos.stockMinimo;
  if (datos.costoUnitario !== original.costoUnitario) cambios.costoUnitario = datos.costoUnitario;
  return cambios;
}

/** Cuerpo del alta: lo vacío no se manda. */
export function altaDeInsumo(datos: DatosInsumo) {
  return {
    nombre: datos.nombre,
    unidad: datos.unidad,
    ...(datos.categoria ? { categoria: datos.categoria } : {}),
    ...(datos.stockInicial !== null && datos.stockInicial > 0 ? { stockInicial: datos.stockInicial } : {}),
    ...(datos.stockMinimo > 0 ? { stockMinimo: datos.stockMinimo } : {}),
    ...(datos.costoUnitario !== null ? { costoUnitario: datos.costoUnitario } : {}),
  };
}
