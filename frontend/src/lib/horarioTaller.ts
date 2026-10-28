import type { HorariosSemana, TramoHorario } from '../types';
import { ZONA_HORARIA } from './fechas';

/**
 * "Abierto ahora" del taller. Funciones puras: reciben `now` y los horarios, y calculan todo en hora de La Rioja
 * (UTC−3 todo el año), no la del dispositivo de quien mira.
 */

export interface EstadoDeApertura {
  readonly abierto: boolean;
  /** "Abierto ahora" o "Cerrado ahora". */
  readonly titulo: string;
  /** "hasta las 13 h" o "abrimos hoy a las 18 h" / "abrimos mañana a las 8 h" / "abrimos el lunes a las 8 h". */
  readonly detalle: string;
}

const DIAS_CORTOS: Readonly<Record<string, number>> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

const formato = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_HORARIA,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Día de la semana (0 = domingo) y minutos desde la medianoche, en La Rioja. */
export function momentoDeLaSemana(now: Date): { dia: number; minutos: number } {
  const partes = formato.formatToParts(now);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '';
  return {
    dia: DIAS_CORTOS[valor('weekday')] ?? 0,
    minutos: Number(valor('hour')) * 60 + Number(valor('minute')),
  };
}

/** "08:00" → 480. NaN si no tiene la forma HH:MM. */
export function minutosDeHora(hora: string): number {
  const coincidencia = /^(\d{1,2}):(\d{2})$/.exec(hora);
  return coincidencia ? Number(coincidencia[1]) * 60 + Number(coincidencia[2]) : NaN;
}

/** "08:00" → "8 h"; "18:30" → "18:30 h". */
export function horaLegible(hora: string): string {
  const minutos = minutosDeHora(hora);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${String(h)} h` : `${String(h)}:${String(m).padStart(2, '0')} h`;
}

/** Tramos válidos de un día, ordenados por hora de apertura. */
function tramosDelDia(horarios: HorariosSemana, dia: number): TramoHorario[] {
  const tramos = horarios[dia as keyof HorariosSemana] as readonly TramoHorario[] | undefined;
  return (tramos ?? [])
    .filter((t) => minutosDeHora(t.desde) < minutosDeHora(t.hasta))
    .sort((a, b) => minutosDeHora(a.desde) - minutosDeHora(b.desde));
}

/**
 * Estado del taller en `now`. Devuelve null si no hay ningún tramo de atención en toda la semana (no hay nada
 * que afirmar: la web muestra solo las líneas de texto).
 */
export function estadoDeApertura(now: Date, horarios: HorariosSemana): EstadoDeApertura | null {
  const { dia, minutos } = momentoDeLaSemana(now);

  const hoy = tramosDelDia(horarios, dia);
  const abiertoEn = hoy.find((t) => minutosDeHora(t.desde) <= minutos && minutos < minutosDeHora(t.hasta));
  if (abiertoEn) {
    return { abierto: true, titulo: 'Abierto ahora', detalle: `hasta las ${horaLegible(abiertoEn.hasta)}` };
  }

  // Cerrado: el próximo tramo, hoy más tarde o en los próximos 7 días.
  const masTarde = hoy.find((t) => minutosDeHora(t.desde) > minutos);
  if (masTarde) {
    return { abierto: false, titulo: 'Cerrado ahora', detalle: `abrimos hoy a las ${horaLegible(masTarde.desde)}` };
  }
  for (let adelante = 1; adelante <= 7; adelante += 1) {
    const siguiente = (dia + adelante) % 7;
    const primero = tramosDelDia(horarios, siguiente)[0];
    if (!primero) continue;
    const cuando = adelante === 1 ? 'mañana' : `el ${NOMBRES_DIA[siguiente] ?? ''}`;
    return { abierto: false, titulo: 'Cerrado ahora', detalle: `abrimos ${cuando} a las ${horaLegible(primero.desde)}` };
  }
  return null;
}
