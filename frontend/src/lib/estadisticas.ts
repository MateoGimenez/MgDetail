import type { Granularidad, PeriodoEstadisticas } from '../api/estadisticas';
import { diaConMes, esFechaValida } from './fechas';

/**
 * Cuentas de la sección Estadísticas del panel, en funciones puras: formato en es-AR (pesos, abreviados para los
 * ejes), escalas y ticks "lindos", variación contra el período anterior, etiquetas del eje de tiempo, estados de los
 * turnos y niveles del mapa de calor. Los componentes de `admin/estadisticas/` solo dibujan lo que sale de acá.
 */

/* ---------- Formato (es-AR) ---------- */

const pesosFormato = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  // es-AR no agrupa los de cuatro cifras ("5000"); en plata queremos siempre "$ 5.000".
  useGrouping: 'always',
});
const enteroFormato = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0, useGrouping: 'always' });
const decimalFormato = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const NBSP = ' ';

/** "$ 60.000". */
export const pesos = (n: number) => pesosFormato.format(n);

/** "12.500" (siempre con punto de miles). */
export const entero = (n: number) => enteroFormato.format(n);

/** Un decimal como mucho y coma: "1,2". */
export const decimal = (n: number) => decimalFormato.format(n);

/** "10 %" (con espacio fino, como se escribe en castellano). `proporcion` va de 0 a 1. */
export const porcentaje = (proporcion: number) => `${decimal(Math.round(proporcion * 1000) / 10)}${NBSP}%`;

/** Pesos abreviados para los ejes y las etiquetas chicas: "$ 850", "$ 12 mil", "$ 1,2 M". */
export function pesosCorto(n: number): string {
  const valor = Math.max(0, n);
  if (valor < 1000) return `$${NBSP}${entero(Math.round(valor))}`;
  const miles = Math.round(valor / 100) / 10;
  if (miles < 1000) return `$${NBSP}${decimal(miles)}${NBSP}mil`;
  return `$${NBSP}${decimal(Math.round(valor / 1e5) / 10)}${NBSP}M`;
}

/** "1 trabajo", "3 trabajos". */
export const trabajos = (n: number) => `${entero(n)} ${n === 1 ? 'trabajo' : 'trabajos'}`;

/** "1 pedido", "3 pedidos". */
export const pedidos = (n: number) => `${entero(n)} ${n === 1 ? 'pedido' : 'pedidos'}`;

/* ---------- Variación contra el período anterior ---------- */

export type Variacion =
  | { tipo: 'sin-base' }
  | { tipo: 'igual' }
  | { tipo: 'sube'; pct: number }
  | { tipo: 'baja'; pct: number };

/** Cuánto cambió `actual` respecto de `anterior`. Si antes no hubo nada (0) no hay base para comparar. */
export function variacion(actual: number, anterior: number): Variacion {
  if (!(anterior > 0)) return { tipo: 'sin-base' };
  const pct = Math.round((Math.abs(actual - anterior) / anterior) * 100);
  if (pct === 0) return { tipo: 'igual' };
  return { tipo: actual > anterior ? 'sube' : 'baja', pct };
}

/** "25 % más que ayer", "Igual que ayer", "—" (sin base). `contra`: "ayer", "el mes pasado", "el año pasado". */
export function textoVariacion(v: Variacion, contra: string): string {
  if (v.tipo === 'sin-base') return '—';
  if (v.tipo === 'igual') return `Igual que ${contra}`;
  const numero = v.pct > 999 ? 'Más de 999' : entero(v.pct);
  return `${numero}${NBSP}% ${v.tipo === 'sube' ? 'más' : 'menos'} que ${contra}`;
}

/* ---------- Escalas y ticks ---------- */

export interface EjeLindo {
  /** Valor más alto del eje (múltiplo del paso, nunca menor que el máximo de los datos). */
  techo: number;
  paso: number;
  ticks: number[];
}

/**
 * Ticks "lindos" desde 0: pasos de 1, 2, 2,5 o 5 por potencias de diez. `soloEnteros` evita 0,5 trabajos.
 * Sin datos (máximo 0) devuelve 0 y 1, para que el eje no quede vacío.
 */
export function ticksLindos(maximo: number, aproximados = 4, soloEnteros = false): EjeLindo {
  if (!(maximo > 0) || !Number.isFinite(maximo)) return { techo: 1, paso: 1, ticks: [0, 1] };
  const crudo = maximo / Math.max(1, aproximados);
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const f = crudo / potencia;
  const base = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  let paso = base * potencia;
  if (soloEnteros) paso = Math.max(1, Math.ceil(paso));
  const cuantos = Math.ceil(maximo / paso - 1e-9);
  const redondear = (n: number) => Math.round(n * 1e6) / 1e6;
  const ticks = Array.from({ length: cuantos + 1 }, (_, i) => redondear(i * paso));
  return { techo: redondear(cuantos * paso), paso: redondear(paso), ticks };
}

/** Escala lineal de un dominio a un rango (el rango puede ir invertido, como el eje Y de un SVG). */
export function escalaLineal(dominio: readonly [number, number], rango: readonly [number, number]): (valor: number) => number {
  const [d0, d1] = dominio;
  const [r0, r1] = rango;
  if (d0 === d1) return () => r0;
  return (valor) => r0 + ((valor - d0) / (d1 - d0)) * (r1 - r0);
}

/** Cada cuántas posiciones va una etiqueta del eje para que entren sin pisarse. */
export function saltoDeEtiquetas(cantidad: number, anchoUtil: number, anchoEtiqueta: number): number {
  if (cantidad <= 0 || anchoUtil <= 0) return 1;
  return Math.max(1, Math.ceil(anchoEtiqueta / (anchoUtil / cantidad)));
}

/** Posición (0..cantidad-1) que corresponde a una coordenada x dentro de la zona de barras. */
export function indiceEnX(x: number, izquierda: number, anchoUtil: number, cantidad: number): number {
  if (cantidad <= 0 || anchoUtil <= 0) return 0;
  const indice = Math.floor(((x - izquierda) / anchoUtil) * cantidad);
  return Math.min(cantidad - 1, Math.max(0, indice));
}

/** Ancho de una barra dentro de su casillero: deja aire, y nunca pasa de 24 px (regla de marcas). */
export function anchoDeBarra(casillero: number): number {
  return Math.max(1.5, Math.min(24, casillero * 0.62));
}

/* ---------- Eje de tiempo ---------- */

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

export const nombreDelMes = (mes: number) => MESES[mes - 1] ?? '';
export const nombreCortoDelMes = (mes: number) => MESES_CORTOS[mes - 1] ?? '';

/** Parte una clave de la serie (`YYYY-MM-DD` o `YYYY-MM`) en números. */
function partesDeClave(clave: string): { anio: number; mes: number; dia: number | null } {
  const [anio, mes, dia] = clave.split('-');
  return { anio: Number(anio), mes: Number(mes), dia: dia === undefined ? null : Number(dia) };
}

/** Etiqueta completa: "jueves 22 de octubre" o "octubre 2026". */
export function etiquetaDeClave(clave: string): string {
  const { anio, mes, dia } = partesDeClave(clave);
  if (dia === null) return `${nombreDelMes(mes)} ${String(anio)}`;
  return esFechaValida(clave) ? diaConMes(clave) : clave;
}

/**
 * Etiqueta corta del eje: el número del día ("22", y "1 oct" al empezar un mes o la serie) o el mes ("oct", y
 * "ene 27" cuando cambia el año).
 */
export function etiquetaDeEje(clave: string, posicion: number): string {
  const { anio, mes, dia } = partesDeClave(clave);
  if (dia === null) {
    return posicion === 0 || mes === 1 ? `${nombreCortoDelMes(mes)} ${String(anio).slice(2)}` : nombreCortoDelMes(mes);
  }
  return posicion === 0 || dia === 1 ? `${String(dia)} ${nombreCortoDelMes(mes)}` : String(dia);
}

/** Cuántos días tiene el rango (extremos incluidos); NaN si alguna fecha no es válida. */
export function diasDelRango(desde: string, hasta: string): number {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) return Number.NaN;
  const ms = (f: string) => {
    const [a, m, d] = f.split('-').map(Number);
    return Date.UTC(a ?? 0, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000) + 1;
}

/** Hasta cuántos días el gráfico va por día; más largo, por mes (igual que el backend). */
export const DIAS_POR_DIA = 62;

export function resolverGranularidad(desde: string, hasta: string): Granularidad {
  return diasDelRango(desde, hasta) <= DIAS_POR_DIA ? 'dia' : 'mes';
}

/* ---------- Estados de los turnos ---------- */

export const ESTADOS_BARRA = ['pendiente', 'confirmado', 'completado', 'cancelado'] as const;
export type EstadoBarra = (typeof ESTADOS_BARRA)[number];

export const ETIQUETA_ESTADO_PLURAL: Readonly<Record<EstadoBarra, string>> = {
  pendiente: 'Pendientes',
  confirmado: 'Confirmados',
  completado: 'Completados',
  cancelado: 'Cancelados',
};

export interface PartesDelEstado {
  estado: EstadoBarra;
  etiqueta: string;
  cantidad: number;
  /** De 0 a 1, sobre el total de turnos del período. */
  proporcion: number;
}

/** Cuántos turnos hay en cada estado y qué parte del total es. Sin turnos, todo en 0. */
export function partesPorEstado(periodo: Pick<PeriodoEstadisticas, 'pendientes' | 'confirmados' | 'completados' | 'cancelados'>): PartesDelEstado[] {
  const cantidades: Record<EstadoBarra, number> = {
    pendiente: periodo.pendientes,
    confirmado: periodo.confirmados,
    completado: periodo.completados,
    cancelado: periodo.cancelados,
  };
  const total = ESTADOS_BARRA.reduce((suma, estado) => suma + cantidades[estado], 0);
  return ESTADOS_BARRA.map((estado) => ({
    estado,
    etiqueta: ETIQUETA_ESTADO_PLURAL[estado],
    cantidad: cantidades[estado],
    proporcion: total > 0 ? cantidades[estado] / total : 0,
  }));
}

/**
 * Anchos (en la unidad que se pase) de los segmentos de una barra apilada. Cada segmento descuenta el hueco que lo
 * separa del vecino; los vacíos no se dibujan. Devuelve `x` y `ancho` por estado, en orden.
 */
export function segmentosApilados(
  partes: readonly PartesDelEstado[],
  anchoTotal: number,
  hueco: number,
): { estado: EstadoBarra; x: number; ancho: number }[] {
  const visibles = partes.filter((p) => p.cantidad > 0);
  const util = Math.max(0, anchoTotal - hueco * Math.max(0, visibles.length - 1));
  let x = 0;
  return visibles.map((p) => {
    const ancho = util * p.proporcion;
    const segmento = { estado: p.estado, x, ancho };
    x += ancho + hueco;
    return segmento;
  });
}

/* ---------- Mapa de calor: día de la semana × franja ---------- */

/** Nombres del día de la semana del backend (0 = domingo … 6 = sábado). */
export const DIAS_SEMANA_BACKEND = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;
export const DIAS_SEMANA_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
/** Orden en la grilla: la semana empieza el lunes. */
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

/** Nivel de intensidad de 0 (nada) a 4 según qué parte del máximo es el valor. */
export function nivelDeCalor(valor: number, maximo: number): 0 | 1 | 2 | 3 | 4 {
  if (!(valor > 0) || !(maximo > 0)) return 0;
  const razon = valor / maximo;
  if (razon <= 0.25) return 1;
  if (razon <= 0.5) return 2;
  if (razon <= 0.75) return 3;
  return 4;
}

export interface MomentoMovido {
  dia: number;
  franja: 'manana' | 'tarde';
  valor: number;
}

/** El día y la franja con más pedidos (el primero de la semana si empatan). Null si no hay ninguno. */
export function momentoMasMovido(filas: readonly { dia: number; manana: number; tarde: number }[]): MomentoMovido | null {
  let mejor: MomentoMovido | null = null;
  for (const fila of filas) {
    for (const franja of ['manana', 'tarde'] as const) {
      if (fila[franja] > (mejor?.valor ?? 0)) mejor = { dia: fila.dia, franja, valor: fila[franja] };
    }
  }
  return mejor;
}
