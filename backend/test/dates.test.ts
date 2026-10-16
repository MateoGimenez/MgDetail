import { describe, expect, it } from 'vitest';
import { bookingDateRange } from '../src/domain/booking-dates.js';
import { addDays, isValidCalendarDate, todayInLaRioja } from '../src/lib/dates.js';

describe('todayInLaRioja (UTC-3, no la hora del servidor)', () => {
  it.each([
    ['2026-10-16T15:00:00Z', '2026-10-16'], // mediodía local
    ['2026-10-17T01:30:00Z', '2026-10-16'], // 22:30 local: un servidor en UTC diría 17
    ['2026-10-17T03:00:00Z', '2026-10-17'], // 00:00 local
    ['2027-01-01T02:59:59Z', '2026-12-31'], // cruce de año
  ])('%s UTC => %s', (utc, expected) => {
    expect(todayInLaRioja(new Date(utc))).toBe(expected);
  });
});

describe('isValidCalendarDate', () => {
  it('acepta fechas reales, incluido el 29 de febrero bisiesto', () => {
    expect(isValidCalendarDate('2026-10-16')).toBe(true);
    expect(isValidCalendarDate('2028-02-29')).toBe(true);
  });

  it('rechaza fechas inexistentes y formatos que no son YYYY-MM-DD', () => {
    for (const date of ['2027-02-29', '2026-02-30', '2026-13-01', '2026-1-5', '2026-10-16T00:00:00Z', '']) {
      expect(isValidCalendarDate(date), date).toBe(false);
    }
  });
});

describe('addDays y bookingDateRange', () => {
  it('suma días de calendario, cruzando mes, año y año bisiesto', () => {
    expect(addDays('2026-10-16', 60)).toBe('2026-12-15');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-12-31', 60)).toBe('2028-02-29');
  });

  it('el rango va desde hoy (en La Rioja) hasta hoy + 60 días', () => {
    expect(bookingDateRange(new Date('2026-10-16T15:00:00Z'))).toEqual({ min: '2026-10-16', max: '2026-12-15' });
    expect(bookingDateRange(new Date('2026-10-17T01:30:00Z')).min).toBe('2026-10-16');
    expect(bookingDateRange(new Date('2026-10-17T03:30:00Z')).min).toBe('2026-10-17');
  });
});
