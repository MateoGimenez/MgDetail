import { addDays, todayInLaRioja } from '../lib/dates.js';

/** Con cuántos días de anticipación se puede pedir un turno. */
export const MAX_DAYS_AHEAD = 60;

/** Hasta cuántos días adelante el taller puede confirmar (o reprogramar) un turno. */
export const MAX_DAYS_CONFIRMADA = 120;

/** Cuántos días puede abarcar una consulta de la agenda (inclusive): seis semanas, alcanza para una vista de mes. */
export const MAX_DIAS_AGENDA = 42;

/**
 * Rango permitido para `fechaPreferida`: desde hoy hasta hoy + 60 días, ambos inclusive.
 * "Hoy" se calcula en la zona horaria del taller (La Rioja), no en la del servidor.
 */
export function bookingDateRange(now: Date): { min: string; max: string } {
  const min = todayInLaRioja(now);
  return { min, max: addDays(min, MAX_DAYS_AHEAD) };
}

/**
 * Rango permitido para `fechaConfirmada` al reprogramar: desde hoy hasta hoy + 120 días, ambos inclusive, en
 * hora de La Rioja. Una fecha pasada no se puede elegir; un turno viejo conserva la suya (no se revalida).
 */
export function fechaConfirmadaRange(now: Date): { min: string; max: string } {
  const min = todayInLaRioja(now);
  return { min, max: addDays(min, MAX_DAYS_CONFIRMADA) };
}

/** Cuántos días puede abarcar una consulta pública de disponibilidad (inclusive). */
export const MAX_DIAS_DISPONIBILIDAD = 62;

/** Hasta cuántos días adelante se puede cargar un día especial (dos años: alcanza para los feriados del año que viene). */
export const MAX_DAYS_DIA_ESPECIAL = 730;
