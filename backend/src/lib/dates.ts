/**
 * Utilidades de fecha de calendario. "Hoy" siempre se calcula en la zona horaria del taller (La Rioja,
 * Argentina, UTC-3 todo el año), no en la del servidor: un servidor en UTC pasaría de día a las 21:00 locales.
 * Las reglas de negocio del turno (rango permitido) están en domain/booking-dates.ts.
 */

const TIME_ZONE = 'America/Argentina/La_Rioja';

const dateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fecha de hoy en La Rioja como YYYY-MM-DD. */
export function todayInLaRioja(now: Date): string {
  const parts = dateParts.formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** true si el texto es YYYY-MM-DD y existe en el calendario (rechaza 2026-02-30, 2026-13-01, etc.). */
export function isValidCalendarDate(text: string): boolean {
  const match = ISO_DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Suma días de calendario a una fecha YYYY-MM-DD válida. Aritmética en UTC: sin problemas de horario. */
export function addDays(isoDate: string, days: number): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new RangeError('Fecha inválida');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}
