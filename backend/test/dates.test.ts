import { describe, expect, it } from 'vitest';
import { bookingDateRange, fechaConfirmadaRange } from '../src/domain/booking-dates.js';
import { puedeReprogramar } from '../src/domain/permisos.js';
import { addDays, daysBetween, isValidCalendarDate, todayInLaRioja } from '../src/lib/dates.js';

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

describe('daysBetween y fechaConfirmadaRange', () => {
  it('cuenta días de calendario, cruzando mes, año y bisiesto', () => {
    expect(daysBetween('2026-10-16', '2026-10-16')).toBe(0);
    expect(daysBetween('2026-10-12', '2026-11-22')).toBe(41); // seis semanas, lunes a domingo
    expect(daysBetween('2026-12-28', '2027-01-03')).toBe(6);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
    expect(daysBetween('2026-10-18', '2026-10-12')).toBe(-6);
    // El cambio de horario de otros países no importa: aritmética en UTC.
    expect(daysBetween('2026-03-01', '2026-04-30')).toBe(60);
    expect(() => daysBetween('2026-1-1', '2026-01-02')).toThrow(RangeError);
  });

  it('fechaConfirmada: desde hoy (en La Rioja) hasta hoy + 120 días', () => {
    expect(fechaConfirmadaRange(new Date('2026-10-16T15:00:00Z'))).toEqual({ min: '2026-10-16', max: '2027-02-13' });
    expect(fechaConfirmadaRange(new Date('2026-10-17T02:59:59Z')).min).toBe('2026-10-16'); // 23:59:59 local
    expect(fechaConfirmadaRange(new Date('2026-10-17T03:00:00Z')).min).toBe('2026-10-17');
    expect(fechaConfirmadaRange(new Date('2027-01-01T02:00:00Z'))).toEqual({ min: '2026-12-31', max: '2027-04-30' });
  });
});

describe('puedeReprogramar', () => {
  it('superadmin y admin sí; empleado no', () => {
    expect(puedeReprogramar('superadmin')).toBe(true);
    expect(puedeReprogramar('admin')).toBe(true);
    expect(puedeReprogramar('empleado')).toBe(false);
  });
});

/*
 * Misma tabla que frontend/src/lib/agenda.test.ts: el panel y la API tienen que coincidir en qué día es hoy y hasta
 * cuándo se puede confirmar, o el formulario deja elegir una fecha que la API rechaza (o al revés).
 */
describe('"hoy" y rango de la fecha confirmada, igual que el panel', () => {
  it.each([
    ['2026-10-26T02:59:59.000Z', '2026-10-25', '2027-02-22'], // domingo 23:59 local; en UTC ya es lunes
    ['2026-10-26T03:00:00.000Z', '2026-10-26', '2027-02-23'], // lunes 00:00 local
    ['2027-01-01T02:59:59.000Z', '2026-12-31', '2027-04-30'],
    ['2027-01-01T03:00:00.000Z', '2027-01-01', '2027-05-01'],
    ['2028-02-29T02:30:00.000Z', '2028-02-28', '2028-06-27'], // bisiesto: todavía 28 en La Rioja
    ['2028-03-01T02:59:59.000Z', '2028-02-29', '2028-06-28'],
    ['2028-03-01T03:00:00.000Z', '2028-03-01', '2028-06-29'],
  ])('%s => hoy %s, hasta %s', (utc, hoy, max) => {
    expect(todayInLaRioja(new Date(utc))).toBe(hoy);
    expect(fechaConfirmadaRange(new Date(utc))).toEqual({ min: hoy, max });
    expect(daysBetween(hoy, max)).toBe(120);
  });
});
