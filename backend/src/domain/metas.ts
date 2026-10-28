import { daysInMonth } from '../lib/dates.js';
import type { CupoDia } from './disponibilidad.js';

/**
 * Metas mensuales (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md, "Metas mensuales").
 *
 * La meta de un mes es de ingresos (pesos) y/o de trabajos completados; al menos una. El progreso usa los ingresos y
 * los trabajos del mes de las estadísticas (turnos completados por fecha de agenda). "Días de atención" = los días
 * del mes en que el taller atiende según el horario semanal y los días especiales (domingos y feriados cerrados no
 * cuentan; un día especial abierto sí). "Hoy" cuenta como transcurrido (sus ingresos ya están en el total).
 */

export const META_INGRESOS_MAX = 999_999_999;
export const META_TRABAJOS_MAX = 9_999;

/** Cuántos meses hacia atrás y hacia adelante (desde el mes actual) se puede fijar una meta. */
export const META_MESES_ATRAS = 12;
export const META_MESES_ADELANTE = 12;

export type EstadoMeta = 'sin-meta' | 'cumplida' | 'adelantado' | 'en-ritmo' | 'atrasado';

export interface ObjetivosMeta {
  ingresosObjetivo: number | null;
  trabajosObjetivo: number | null;
}

export interface MetaMensual extends ObjetivosMeta {
  /** YYYY-MM */
  mes: string;
}

export interface MetaMensualConAvance extends MetaMensual {
  ingresos: number;
  trabajos: number;
  cumplida: boolean;
}

export interface Avance {
  ingresos: number;
  trabajos: number;
}

export interface DiasDeAtencion {
  totales: number;
  transcurridos: number;
  restantes: number;
}

export interface ProgresoMeta {
  ingresos: number;
  trabajos: number;
  porcentajeIngresos: number | null;
  porcentajeTrabajos: number | null;
  diasDeAtencionTranscurridos: number;
  diasDeAtencionRestantes: number;
  diasDeAtencionTotales: number;
  proyeccionIngresos: number | null;
  necesarioPorDia: number | null;
  estado: EstadoMeta;
}

export interface MetaActual {
  mes: string;
  meta: ObjetivosMeta | null;
  progreso: ProgresoMeta;
}

export interface MetaRepository {
  /** null si el mes no tiene meta. `mes` = YYYY-MM. */
  obtener(mes: string): Promise<MetaMensual | null>;
  /** Las metas de los meses de ese año (YYYY), por mes. */
  delAnio(anio: number): Promise<MetaMensual[]>;
  /**
   * Mezcla `cambios` con lo guardado (undefined = no se toca) y guarda. Devuelve null, sin guardar nada, si después de
   * mezclar las dos metas quedan en null.
   */
  guardar(mes: string, cambios: Partial<ObjetivosMeta>): Promise<MetaMensual | null>;
  /** false si el mes no tenía meta. */
  borrar(mes: string): Promise<boolean>;
}

/** Primer y último día (YYYY-MM-DD) del mes `YYYY-MM`. */
export function limitesDelMes(mes: string): { desde: string; hasta: string } {
  const anio = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  return { desde: `${mes}-01`, hasta: `${mes}-${String(daysInMonth(anio, numero)).padStart(2, '0')}` };
}

/** El mes `YYYY-MM` desplazado `delta` meses (puede ser negativo). */
export function sumarMeses(mes: string, delta: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + (Number(mes.slice(5, 7)) - 1) + delta;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Del mes de `hoy` (YYYY-MM-DD) menos META_MESES_ATRAS al más META_MESES_ADELANTE, inclusive. */
export function mesesPermitidos(hoy: string): { primero: string; ultimo: string } {
  const actual = hoy.slice(0, 7);
  return { primero: sumarMeses(actual, -META_MESES_ATRAS), ultimo: sumarMeses(actual, META_MESES_ADELANTE) };
}

/** Mezcla lo guardado con los cambios del PUT: undefined = se queda como está; null = se vacía. */
export function mezclarMeta(actual: ObjetivosMeta | null, cambios: Partial<ObjetivosMeta>): ObjetivosMeta {
  return {
    ingresosObjetivo:
      cambios.ingresosObjetivo !== undefined ? cambios.ingresosObjetivo : (actual?.ingresosObjetivo ?? null),
    trabajosObjetivo:
      cambios.trabajosObjetivo !== undefined ? cambios.trabajosObjetivo : (actual?.trabajosObjetivo ?? null),
  };
}

/** Cuenta los días de atención de un mes a partir de los cupos de cada día (abierto = se atiende). */
export function contarDiasDeAtencion(dias: readonly CupoDia[], hoy: string): DiasDeAtencion {
  const abiertos = dias.filter((dia) => dia.abierto);
  const transcurridos = abiertos.filter((dia) => dia.fecha <= hoy).length;
  return { totales: abiertos.length, transcurridos, restantes: abiertos.length - transcurridos };
}

/** ¿Se alcanzaron todos los objetivos fijados? (Sin ninguno, false.) */
export function metaCumplida(meta: ObjetivosMeta | null, avance: Avance): boolean {
  if (meta === null) return false;
  const { ingresosObjetivo, trabajosObjetivo } = meta;
  if (ingresosObjetivo === null && trabajosObjetivo === null) return false;
  return (
    (ingresosObjetivo === null || avance.ingresos >= ingresosObjetivo) &&
    (trabajosObjetivo === null || avance.trabajos >= trabajosObjetivo)
  );
}

const redondear4 = (valor: number): number => Math.round(valor * 10_000) / 10_000;

/**
 * Estado de la meta. Sin meta: "sin-meta". Con todos los objetivos cumplidos: "cumplida". Si no, con
 * esperado = objetivo x transcurridos / totales: "adelantado" (lo logrado >= 110 % de lo esperado), "en-ritmo"
 * (90 a 110 %) o "atrasado" (< 90 %). Con dos objetivos se mira el más atrasado de los dos. Mientras no haya nada
 * esperado todavía (ningún día de atención transcurrido, o un mes sin días de atención) es "en-ritmo". Las
 * comparaciones son con enteros (sin errores de punto flotante).
 */
export function estadoDeMeta(meta: ObjetivosMeta | null, avance: Avance, dias: DiasDeAtencion): EstadoMeta {
  if (meta === null || (meta.ingresosObjetivo === null && meta.trabajosObjetivo === null)) return 'sin-meta';
  if (metaCumplida(meta, avance)) return 'cumplida';
  if (dias.totales === 0 || dias.transcurridos === 0) return 'en-ritmo';
  const pares: [number, number | null][] = [
    [avance.ingresos, meta.ingresosObjetivo],
    [avance.trabajos, meta.trabajosObjetivo],
  ];
  // logrado >= factor x objetivo x transcurridos / totales, sin decimales: logrado x totales x 10 >= objetivo x transcurridos x (factor x 10)
  const alcanza = (porDiez: number): boolean =>
    pares.every(
      ([logrado, objetivo]) =>
        objetivo === null || logrado * dias.totales * 10 >= objetivo * dias.transcurridos * porDiez,
    );
  if (alcanza(11)) return 'adelantado';
  if (alcanza(9)) return 'en-ritmo';
  return 'atrasado';
}

/** El progreso completo del mes (el "progreso" de GET /api/admin/metas/actual). */
export function calcularProgreso(meta: ObjetivosMeta | null, avance: Avance, dias: DiasDeAtencion): ProgresoMeta {
  const objetivoIngresos = meta?.ingresosObjetivo ?? null;
  const objetivoTrabajos = meta?.trabajosObjetivo ?? null;
  const estado = estadoDeMeta(meta, avance, dias);
  const conMeta = estado !== 'sin-meta';

  let necesarioPorDia: number | null = null;
  if (objetivoIngresos !== null) {
    if (avance.ingresos >= objetivoIngresos) necesarioPorDia = 0;
    else if (dias.restantes > 0) necesarioPorDia = Math.round((objetivoIngresos - avance.ingresos) / dias.restantes);
  }

  return {
    ingresos: avance.ingresos,
    trabajos: avance.trabajos,
    porcentajeIngresos: objetivoIngresos === null ? null : redondear4(avance.ingresos / objetivoIngresos),
    porcentajeTrabajos: objetivoTrabajos === null ? null : redondear4(avance.trabajos / objetivoTrabajos),
    diasDeAtencionTranscurridos: dias.transcurridos,
    diasDeAtencionRestantes: dias.restantes,
    diasDeAtencionTotales: dias.totales,
    proyeccionIngresos:
      conMeta && dias.transcurridos > 0 ? Math.round((avance.ingresos / dias.transcurridos) * dias.totales) : null,
    necesarioPorDia: conMeta ? necesarioPorDia : null,
    estado,
  };
}

/** Los doce meses (YYYY-MM) de un año. */
export function mesesDelAnio(anio: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${String(anio).padStart(4, '0')}-${String(i + 1).padStart(2, '0')}`);
}
