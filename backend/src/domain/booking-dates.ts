import { addDays, todayInLaRioja } from '../lib/dates.js';

/** Con cuántos días de anticipación se puede pedir un turno. */
export const MAX_DAYS_AHEAD = 60;

/**
 * Rango permitido para `fechaPreferida`: desde hoy hasta hoy + 60 días, ambos inclusive.
 * "Hoy" se calcula en la zona horaria del taller (La Rioja), no en la del servidor.
 */
export function bookingDateRange(now: Date): { min: string; max: string } {
  const min = todayInLaRioja(now);
  return { min, max: addDays(min, MAX_DAYS_AHEAD) };
}
