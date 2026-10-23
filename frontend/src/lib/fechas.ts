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

/* ---------- Agenda (semana de lunes a domingo, hora de La Rioja) ---------- */

/** El taller puede confirmar o reprogramar un turno de hoy a hoy + 120 días (contrato de la agenda). */
export const DIAS_MAXIMOS_CONFIRMACION = 120;

/** Rango para la fecha confirmada: de hoy a hoy + 120 días, ambos inclusive. */
export function rangoDeConfirmacion(now: Date): { min: string; max: string } {
  const min = hoyEnLaRioja(now);
  return { min, max: sumarDias(min, DIAS_MAXIMOS_CONFIRMACION) };
}

/** Día de la semana de una fecha YYYY-MM-DD válida: 0 = lunes … 6 = domingo. */
export function diaDeLaSemana(fechaIso: string): number {
  const fecha = aFechaUtc(fechaIso);
  if (!fecha) throw new RangeError('Fecha inválida');
  return (fecha.getUTCDay() + 6) % 7;
}

/** Lunes de la semana (lunes a domingo) que contiene la fecha. */
export function lunesDeLaSemana(fechaIso: string): string {
  return sumarDias(fechaIso, -diaDeLaSemana(fechaIso));
}

/** Los siete días, de lunes a domingo, de la semana que empieza en `lunes`. */
export function diasDeLaSemana(lunes: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

/*
 * Nombres propios en lugar de Intl para lo corto: según la versión de ICU, es-AR escribe "sáb." o "sáb",
 * y en la agenda el texto tiene que ser siempre el mismo.
 */
const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'] as const;
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

function partesDe(fechaIso: string): { anio: number; mes: number; dia: number; semana: number } | null {
  const partes = esFechaValida(fechaIso) ? leer(fechaIso) : null;
  if (!partes) return null;
  return { anio: partes[0], mes: partes[1], dia: partes[2], semana: diaDeLaSemana(fechaIso) };
}

/** "lun", "mié"… (para la tira de días). */
export function nombreCortoDelDia(fechaIso: string): string {
  const p = partesDe(fechaIso);
  return p ? (DIAS_CORTOS[p.semana] ?? '') : fechaIso;
}

/** "lunes", "miércoles"… */
export function nombreDelDia(fechaIso: string): string {
  const p = partesDe(fechaIso);
  return p ? (DIAS_LARGOS[p.semana] ?? '') : fechaIso;
}

/** Número del día del mes: "1"… "31". */
export function numeroDelDia(fechaIso: string): string {
  const p = partesDe(fechaIso);
  return p ? String(p.dia) : fechaIso;
}

/** "jue 24" (la aclaración "Pidió: jue 24" de la agenda). */
export function diaCorto(fechaIso: string): string {
  const p = partesDe(fechaIso);
  return p ? `${DIAS_CORTOS[p.semana] ?? ''} ${String(p.dia)}` : fechaIso;
}

/** "jueves 24 de octubre" (sin depender de Intl, para títulos de la agenda). */
export function diaConMes(fechaIso: string): string {
  const p = partesDe(fechaIso);
  return p ? `${DIAS_LARGOS[p.semana] ?? ''} ${String(p.dia)} de ${MESES[p.mes - 1] ?? ''}` : fechaIso;
}

/**
 * Nombre de la semana que empieza en `lunes`, sin repetir lo que comparten las dos puntas:
 * "19 al 25 de octubre", "26 de octubre al 1 de noviembre", "28 de diciembre de 2026 al 3 de enero de 2027".
 */
export function nombreDeLaSemana(lunes: string): string {
  const desde = partesDe(lunes);
  const hasta = partesDe(sumarDias(lunes, 6));
  if (!desde || !hasta) return lunes;
  const mes = (n: number) => MESES[n - 1] ?? '';
  if (desde.anio !== hasta.anio) {
    return `${String(desde.dia)} de ${mes(desde.mes)} de ${String(desde.anio)} al ${String(hasta.dia)} de ${mes(hasta.mes)} de ${String(hasta.anio)}`;
  }
  if (desde.mes !== hasta.mes) {
    return `${String(desde.dia)} de ${mes(desde.mes)} al ${String(hasta.dia)} de ${mes(hasta.mes)}`;
  }
  return `${String(desde.dia)} al ${String(hasta.dia)} de ${mes(hasta.mes)}`;
}
