import { addDays, daysBetween } from '../lib/dates.js';
import type { Franja } from './booking.js';

/**
 * Disponibilidad real (contrato: reportes/2026-10-23_11_disponibilidad-seguimiento-recordatorios.md).
 *
 *  - Horario semanal: la regla de siempre. `dia` sigue la convención de Postgres (extract(dow)) y de JavaScript
 *    (getUTCDay()): 0 = domingo, 1 = lunes ... 6 = sábado.
 *  - Días especiales: una fecha puntual que gana sobre el horario semanal (cerrada, o abierta con sus cupos).
 *  - Ocupan cupo los turnos no cancelados (pendiente, confirmado, completado), por fecha y franja de AGENDA (la
 *    confirmada si existe, si no la pedida). Un pendiente ocupa lugar: si no, dos clientes podrían pedir el último.
 *  - Un cupo en 0 cierra esa franja. Un día cerrado tiene los dos cupos en 0.
 */

/** Tope de turnos por franja (CHECK de la base). */
export const MAX_CUPO = 20;

/** Los días de la semana: 0 = domingo ... 6 = sábado. */
export const DIAS_SEMANA = [0, 1, 2, 3, 4, 5, 6] as const;

export interface HorarioDia {
  /** 0 = domingo, 1 = lunes ... 6 = sábado. */
  dia: number;
  abierto: boolean;
  cupoManana: number;
  cupoTarde: number;
}

export interface DiaEspecial {
  /** YYYY-MM-DD */
  fecha: string;
  abierto: boolean;
  /** Con valor si está abierto; null si está cerrado. */
  cupoManana: number | null;
  cupoTarde: number | null;
  motivo: string | null;
}

/** Lo que pide el panel al crear o reemplazar un día especial (ya validado). */
export type NuevoDiaEspecial =
  | { fecha: string; abierto: true; cupoManana: number; cupoTarde: number; motivo: string | null }
  | { fecha: string; abierto: false; motivo: string | null };

/** Cuántos turnos ocupan una fecha y franja de agenda. */
export interface Ocupacion {
  fecha: string;
  franja: Franja;
  ocupados: number;
}

/** Cupos y ocupación de un día (lo que muestra la agenda: "2/3"). */
export interface CupoDia {
  fecha: string;
  abierto: boolean;
  cupoManana: number;
  cupoTarde: number;
  ocupadosManana: number;
  ocupadosTarde: number;
}

/** Lo que ve el público: si se atiende y si queda lugar en cada franja (sin cantidades). */
export interface DisponibilidadPublica {
  fecha: string;
  abierto: boolean;
  manana: boolean;
  tarde: boolean;
}

/** Día de la semana (0 = domingo) de una fecha YYYY-MM-DD válida, sin zona horaria. */
export function diaDeLaSemana(fecha: string): number {
  const [year, month, day] = fecha.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

/**
 * Cupos de cada día de [desde, hasta] (inclusive, fechas ya validadas): el día especial si hay, si no el horario
 * semanal; con los ocupados de cada franja. Un día cerrado tiene los cupos en 0 (los ocupados se informan igual:
 * el panel puede haber puesto turnos ahí).
 */
export function calcularCupos(
  desde: string,
  hasta: string,
  horario: readonly HorarioDia[],
  especiales: readonly DiaEspecial[],
  ocupaciones: readonly Ocupacion[],
): CupoDia[] {
  const porDia = new Map(horario.map((dia) => [dia.dia, dia]));
  const porFecha = new Map(especiales.map((dia) => [dia.fecha, dia]));
  const ocupados = new Map(ocupaciones.map((o) => [`${o.fecha}|${o.franja}`, o.ocupados]));
  const dias: CupoDia[] = [];
  const total = daysBetween(desde, hasta);
  for (let offset = 0; offset <= total; offset++) {
    const fecha = addDays(desde, offset);
    const especial = porFecha.get(fecha);
    const semanal = porDia.get(diaDeLaSemana(fecha));
    // Sin fila en el horario (no debería pasar: la migración siembra las 7) => cerrado.
    const abierto = especial?.abierto ?? semanal?.abierto ?? false;
    const cupoManana = abierto ? (especial ? (especial.cupoManana ?? 0) : (semanal?.cupoManana ?? 0)) : 0;
    const cupoTarde = abierto ? (especial ? (especial.cupoTarde ?? 0) : (semanal?.cupoTarde ?? 0)) : 0;
    dias.push({
      fecha,
      abierto,
      cupoManana,
      cupoTarde,
      ocupadosManana: ocupados.get(`${fecha}|manana`) ?? 0,
      ocupadosTarde: ocupados.get(`${fecha}|tarde`) ?? 0,
    });
  }
  return dias;
}

/** Lo público de un día: hay lugar si el día está abierto y la franja tiene más cupo que ocupados. */
export function disponibilidadPublica(cupo: CupoDia): DisponibilidadPublica {
  return {
    fecha: cupo.fecha,
    abierto: cupo.abierto,
    manana: cupo.abierto && cupo.ocupadosManana < cupo.cupoManana,
    tarde: cupo.abierto && cupo.ocupadosTarde < cupo.cupoTarde,
  };
}

/** El día pedido está cerrado (horario semanal o día especial). */
export class DiaCerradoError extends Error {
  constructor(readonly fecha: string) {
    super(`El ${fecha} no se toman turnos.`);
    this.name = 'DiaCerradoError';
  }
}

/** La franja pedida está llena o tiene cupo 0. */
export class FranjaLlenaError extends Error {
  constructor(
    readonly fecha: string,
    readonly franja: Franja,
  ) {
    super(`La franja ${franja} del ${fecha} no tiene lugar.`);
    this.name = 'FranjaLlenaError';
  }
}

/** Lanza DiaCerradoError o FranjaLlenaError si no se puede tomar un turno nuevo en esa franja. */
export function verificarLugar(cupo: CupoDia, franja: Franja): void {
  if (!cupo.abierto) throw new DiaCerradoError(cupo.fecha);
  const libre = franja === 'manana' ? cupo.ocupadosManana < cupo.cupoManana : cupo.ocupadosTarde < cupo.cupoTarde;
  if (!libre) throw new FranjaLlenaError(cupo.fecha, franja);
}

/**
 * Puerto de persistencia de la disponibilidad. `cupos` combina horario, días especiales y ocupados del rango
 * (inclusive, fechas ya validadas).
 */
export interface DisponibilidadRepository {
  /** Las 7 filas, de lunes a domingo (1, 2 ... 6, 0). */
  horarioSemanal(): Promise<HorarioDia[]>;
  /** Reemplaza las 7 filas en una transacción y devuelve el horario completo. */
  reemplazarHorario(dias: readonly HorarioDia[]): Promise<HorarioDia[]>;
  /** Días especiales desde `desde` (inclusive) en adelante, por fecha. */
  diasEspeciales(desde: string): Promise<DiaEspecial[]>;
  /** Crea o reemplaza un día especial. */
  guardarDiaEspecial(dia: NuevoDiaEspecial): Promise<DiaEspecial>;
  /** true si existía y se borró. */
  borrarDiaEspecial(fecha: string): Promise<boolean>;
  cupos(desde: string, hasta: string): Promise<CupoDia[]>;
}
