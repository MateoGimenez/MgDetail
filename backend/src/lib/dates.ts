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

/**
 * Días de calendario de `desde` a `hasta` (YYYY-MM-DD válidas): 0 si son el mismo día, negativo si `hasta` es
 * anterior. Aritmética en UTC: sin problemas de horario.
 */
export function daysBetween(desde: string, hasta: string): number {
  const toUtc = (isoDate: string): number => {
    const match = ISO_DATE.exec(isoDate);
    if (!match) throw new RangeError('Fecha inválida');
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };
  return Math.round((toUtc(hasta) - toUtc(desde)) / 86_400_000);
}

/** Suma días de calendario a una fecha YYYY-MM-DD válida. Aritmética en UTC: sin problemas de horario. */
export function addDays(isoDate: string, days: number): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new RangeError('Fecha inválida');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

/** Cuántos días tiene el mes (1 a 12) de ese año; febrero cuenta el 29 en los años bisiestos. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(isoDate: string): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new RangeError('Fecha inválida');
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/** Primer día del mes de una fecha YYYY-MM-DD válida. */
export function startOfMonth(isoDate: string): string {
  const { year, month } = parts(isoDate);
  return `${pad(year, 4)}-${pad(month, 2)}-01`;
}

/**
 * El mismo día del mes anterior, con tope en el último día de ese mes: 2026-03-31 => 2026-02-28; 2026-01-15 =>
 * 2025-12-15.
 */
export function sameDayPreviousMonth(isoDate: string): string {
  const { year, month, day } = parts(isoDate);
  const [y, m] = month === 1 ? [year - 1, 12] : [year, month - 1];
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(Math.min(day, daysInMonth(y, m)), 2)}`;
}

/** El mismo día del año anterior, con tope en el último día de ese mes: 2028-02-29 => 2027-02-28. */
export function sameDayPreviousYear(isoDate: string): string {
  const { year, month, day } = parts(isoDate);
  const y = year - 1;
  return `${pad(y, 4)}-${pad(month, 2)}-${pad(Math.min(day, daysInMonth(y, month)), 2)}`;
}

/** Día de la semana de una fecha YYYY-MM-DD válida: 0 = domingo ... 6 = sábado. */
export function weekday(isoDate: string): number {
  const { year, month, day } = parts(isoDate);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Los meses (YYYY-MM) de `desde` a `hasta` (YYYY-MM-DD válidas), ambos inclusive. */
export function monthKeysBetween(desde: string, hasta: string): string[] {
  const start = parts(desde);
  const end = parts(hasta);
  const keys: string[] = [];
  let [year, month] = [start.year, start.month];
  while (year < end.year || (year === end.year && month <= end.month)) {
    keys.push(`${pad(year, 4)}-${pad(month, 2)}`);
    [year, month] = month === 12 ? [year + 1, 1] : [year, month + 1];
  }
  return keys;
}
