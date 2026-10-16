/**
 * Fechas de turnos. Espejo de backend/src/lib/dates.ts: "hoy" se calcula
 * siempre en la zona del taller (La Rioja, UTC−3 todo el año) y los días se
 * suman en UTC. Funciones puras: reciben `now` en lugar de leer el reloj.
 *
 * No usar toISOString().slice(0, 10) ni getDate() con fechas "de reloj":
 * después de las 21 h de La Rioja devuelven el día siguiente.
 */

export const ZONA_HORARIA = 'America/Argentina/La_Rioja';
export const DIAS_MAXIMOS = 60;

const partesDeFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const dosCifras = (valor: number) => String(valor).padStart(2, '0');

/** Fecha de hoy en La Rioja como YYYY-MM-DD. */
export function hoyEnLaRioja(now: Date): string {
  const partes = partesDeFecha.formatToParts(now);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}

function leer(fechaIso: string): [number, number, number] | null {
  const coincidencia = FECHA_ISO.exec(fechaIso);
  if (!coincidencia) return null;
  return [Number(coincidencia[1]), Number(coincidencia[2]), Number(coincidencia[3])];
}

/** true si el texto es YYYY-MM-DD y existe en el calendario (rechaza 2026-02-30). */
export function esFechaValida(texto: string): boolean {
  const partes = leer(texto);
  if (!partes) return false;
  const [anio, mes, dia] = partes;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

/** Suma días de calendario a una fecha YYYY-MM-DD válida. Aritmética en UTC. */
export function sumarDias(fechaIso: string, dias: number): string {
  const partes = leer(fechaIso);
  if (!partes) throw new RangeError('Fecha inválida');
  const [anio, mes, dia] = partes;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return `${String(fecha.getUTCFullYear())}-${dosCifras(fecha.getUTCMonth() + 1)}-${dosCifras(fecha.getUTCDate())}`;
}

/** Rango para pedir turno: de hoy a hoy + 60 días, ambos inclusive. */
export function rangoDeTurno(now: Date): { min: string; max: string } {
  const min = hoyEnLaRioja(now);
  return { min, max: sumarDias(min, DIAS_MAXIMOS) };
}

function aFechaUtc(fechaIso: string): Date | null {
  if (!esFechaValida(fechaIso)) return null;
  const partes = leer(fechaIso);
  return partes ? new Date(Date.UTC(partes[0], partes[1] - 1, partes[2])) : null;
}

const formatoLargo = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const formatoCorto = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const formatoMomento = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_HORARIA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "jueves 22 de octubre". */
export function fechaLarga(fechaIso: string): string {
  const fecha = aFechaUtc(fechaIso);
  return fecha ? formatoLargo.format(fecha).replace(',', '') : fechaIso;
}

/** "jue 22/10/2026". */
export function fechaCorta(fechaIso: string): string {
  const fecha = aFechaUtc(fechaIso);
  return fecha ? formatoCorto.format(fecha).replace(',', '').replace('.', '') : fechaIso;
}

/** Fecha y hora de un ISO 8601 completo, en hora de La Rioja: "16/10/2026 14:32". */
export function momentoEnLaRioja(isoCompleto: string): string {
  const fecha = new Date(isoCompleto);
  return Number.isNaN(fecha.getTime()) ? isoCompleto : formatoMomento.format(fecha).replace(',', '');
}
