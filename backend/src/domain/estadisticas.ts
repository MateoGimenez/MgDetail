import {
  addDays,
  daysBetween,
  isValidCalendarDate,
  monthKeysBetween,
  sameDayPreviousMonth,
  sameDayPreviousYear,
  startOfMonth,
} from '../lib/dates.js';

/**
 * Estadísticas del taller (contrato: reportes/2026-10-26_15_estadisticas-y-permisos.md).
 *
 * Todo se agrupa por la FECHA DE AGENDA del turno (la confirmada si existe, si no la pedida) en hora de La Rioja.
 * Pedidos = turnos no cancelados. Vendidos / completados = turnos completados. Ingresos = suma de `monto` de los
 * completados (solo lo registrado: nunca se estima con el precio "desde"). Ticket promedio = ingresos / completados
 * CON monto. Tasa de cancelación = cancelados / todos los turnos del período.
 */

/** Cuántos días puede abarcar un rango (inclusive). */
export const MAX_DIAS_ESTADISTICAS = 366;

/** Hasta cuántos días la serie va por día; con más, va por mes. */
export const MAX_DIAS_SERIE_DIARIA = 62;

export type Granularidad = 'dia' | 'mes';

/** Rango inclusivo de fechas YYYY-MM-DD. */
export interface Rango {
  desde: string;
  hasta: string;
}

export interface Totales {
  completados: number;
  ingresos: number;
}

/** Totales de un período con la plata que salió: gastos y ganancia (ingresos - gastos; puede ser negativa). */
export interface TotalesConGastos extends Totales {
  gastos: number;
  ganancia: number;
}

export interface Comparacion {
  actual: TotalesConGastos;
  anterior: TotalesConGastos;
}

export interface ResumenFijo {
  hoy: Comparacion;
  mes: Comparacion;
  anio: Comparacion;
}

/** Conteos crudos de un período (lo que sale de la base). */
export interface ConteoPeriodo {
  turnos: number;
  pendientes: number;
  confirmados: number;
  completados: number;
  cancelados: number;
  ingresos: number;
  /** Completados con monto cargado. */
  completadosConMonto: number;
}

export interface PeriodoTurnos {
  turnos: number;
  pedidos: number;
  pendientes: number;
  confirmados: number;
  completados: number;
  cancelados: number;
  ingresos: number;
  /** Suma de los gastos del período (por fecha del gasto). */
  gastos: number;
  /** ingresos - gastos; puede ser negativa. */
  gananciaNeta: number;
  /** gananciaNeta / ingresos (4 decimales); null si los ingresos son 0. */
  margen: number | null;
  ticketPromedio: number | null;
  completadosSinMonto: number;
  tasaCancelacion: number | null;
}

export interface PuntoSerie extends Totales {
  /** YYYY-MM-DD (granularidad día) o YYYY-MM (mes). */
  clave: string;
  gastos: number;
}

/** Lo que sale de la base para la serie: ingresos y completados (los gastos van aparte). */
export interface PuntoSerieTurnos extends Totales {
  clave: string;
}

export interface GastosDeUnPunto {
  clave: string;
  gastos: number;
}

export interface FilaGastoCategoria {
  categoria: string;
  monto: number;
}

export interface FilaServicio {
  servicioId: string;
  nombre: string;
  pedidos: number;
  completados: number;
  ingresos: number;
}

export interface FilaTrabajador {
  /** null = "Sin asignar". */
  id: string | null;
  nombre: string;
  completados: number;
  ingresos: number;
}

export interface FilaDiaSemana {
  /** 0 = domingo ... 6 = sábado. */
  dia: number;
  manana: number;
  tarde: number;
}

export interface Estadisticas {
  rango: Rango;
  granularidad: Granularidad;
  resumen: ResumenFijo;
  periodo: PeriodoTurnos;
  serie: PuntoSerie[];
  porServicio: FilaServicio[];
  porTrabajador: FilaTrabajador[];
  porDiaSemana: FilaDiaSemana[];
  completadosSinTrabajador: number;
  /** Por monto descendente; solo categorías con gastos en el período. */
  gastosPorCategoria: FilaGastoCategoria[];
}

/** "Mis trabajos": lo que hizo una persona. Nunca tiene importes. */
export interface MisTrabajos {
  rango: Rango;
  completados: number;
  porServicio: { servicioId: string; nombre: string; completados: number }[];
  serie: { clave: string; completados: number }[];
}

/** Un rango con nombre, para pedir varios totales en una sola consulta. */
export interface RangoNombrado extends Rango {
  clave: string;
}

/**
 * Puerto de las consultas de estadísticas. Todas agregan en la base (nunca se traen las filas de los turnos). Los
 * métodos de "mis trabajos" no leen ni devuelven ningún importe.
 */
export interface EstadisticasRepository {
  /** Completados e ingresos de cada rango (una fila por rango pedido, con ceros si no hubo nada). */
  totales(rangos: readonly RangoNombrado[]): Promise<Record<string, Totales>>;
  conteo(rango: Rango): Promise<ConteoPeriodo>;
  /** Solo los períodos con completados; completar con ceros es cosa del servicio. */
  serie(rango: Rango, granularidad: Granularidad): Promise<PuntoSerieTurnos[]>;
  /** Suma de los gastos de cada rango, por fecha del gasto (cero si no hubo). */
  gastosPorRango(rangos: readonly RangoNombrado[]): Promise<Record<string, number>>;
  /** Solo los períodos con gastos; completar con ceros es cosa del servicio. */
  gastosSerie(rango: Rango, granularidad: Granularidad): Promise<GastosDeUnPunto[]>;
  /** Por monto descendente, solo las categorías con gastos. */
  gastosPorCategoria(rango: Rango): Promise<FilaGastoCategoria[]>;
  /** Por pedidos descendente; servicios sin pedidos solo si están activos. */
  porServicio(rango: Rango): Promise<FilaServicio[]>;
  /** Por completados descendente; id null = sin asignar (sin trabajador o la persona se borró). */
  porTrabajador(rango: Rango): Promise<FilaTrabajador[]>;
  /** Solo los días de la semana con pedidos. */
  porDiaSemana(rango: Rango): Promise<FilaDiaSemana[]>;
  misServicios(perfilId: string, rango: Rango): Promise<MisTrabajos['porServicio']>;
  misSerie(perfilId: string, rango: Rango, granularidad: Granularidad): Promise<MisTrabajos['serie']>;
}

export function granularidadDe(rango: Rango): Granularidad {
  return daysBetween(rango.desde, rango.hasta) + 1 <= MAX_DIAS_SERIE_DIARIA ? 'dia' : 'mes';
}

/** Cada día o cada mes (clave) del rango, en orden. */
export function clavesDeSerie(rango: Rango, granularidad: Granularidad): string[] {
  if (granularidad === 'mes') return monthKeysBetween(rango.desde, rango.hasta);
  const dias = daysBetween(rango.desde, rango.hasta);
  return Array.from({ length: dias + 1 }, (_, i) => addDays(rango.desde, i));
}

export type RangoResuelto = { ok: true; rango: Rango } | { ok: false; fields: Record<string, string> };

/**
 * Rango pedido ya con sus valores por omisión: sin `desde`, el primer día del mes de `hasta` (o de hoy); sin `hasta`,
 * hoy. Valida que `hasta` no sea anterior a `desde` y que no abarque más de 366 días. `desde` y `hasta` ya vienen
 * con formato YYYY-MM-DD válido (schemas/admin.ts).
 */
export function resolverRango(pedido: { desde?: string; hasta?: string }, hoy: string): RangoResuelto {
  const hasta = pedido.hasta ?? hoy;
  const desde = pedido.desde ?? startOfMonth(hasta);
  if (!isValidCalendarDate(desde) || !isValidCalendarDate(hasta)) {
    return { ok: false, fields: { desde: 'Indicá fechas válidas con formato AAAA-MM-DD.' } };
  }
  const dias = daysBetween(desde, hasta);
  if (dias < 0) return { ok: false, fields: { hasta: '"hasta" no puede ser anterior a "desde".' } };
  if (dias + 1 > MAX_DIAS_ESTADISTICAS) {
    return {
      ok: false,
      fields: { hasta: `El período puede abarcar hasta ${String(MAX_DIAS_ESTADISTICAS)} días como máximo.` },
    };
  }
  return { ok: true, rango: { desde, hasta } };
}

/**
 * Los seis rangos de las tarjetas fijas, siempre calculados con la fecha de hoy: hoy contra ayer; este mes hasta hoy
 * contra el mes pasado hasta el mismo día (con tope en el último día del mes más corto); este año hasta hoy contra
 * el año pasado hasta el mismo día (28/02 si hoy es 29/02; si el año pasado fue bisiesto, incluye su 29/02).
 */
export function rangosDelResumen(hoy: string): { clave: string; desde: string; hasta: string }[] {
  const ayer = addDays(hoy, -1);
  const mesPasado = sameDayPreviousMonth(hoy);
  const anioPasado = sameDayPreviousYear(hoy);
  return [
    { clave: 'hoy.actual', desde: hoy, hasta: hoy },
    { clave: 'hoy.anterior', desde: ayer, hasta: ayer },
    { clave: 'mes.actual', desde: startOfMonth(hoy), hasta: hoy },
    { clave: 'mes.anterior', desde: startOfMonth(mesPasado), hasta: mesPasado },
    { clave: 'anio.actual', desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy },
    { clave: 'anio.anterior', desde: `${anioPasado.slice(0, 4)}-01-01`, hasta: anioPasado },
  ];
}

/** Razón a/b, o null si b es 0. */
export function razon(numerador: number, denominador: number): number | null {
  return denominador === 0 ? null : numerador / denominador;
}
