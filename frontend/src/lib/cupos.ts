import { ETIQUETA_FRANJA, type CupoDia, type Franja } from '../api/contract';
import { CUPO_MAXIMO, MOTIVO_MAXIMO, type HorarioDia } from '../api/contract-panel';
import { diaDeLaSemana } from './fechas';

/**
 * Disponibilidad en el panel (reportes/2026-10-23_11_disponibilidad-seguimiento-recordatorios.md), en funciones
 * puras: cupos de la agenda, avisos al confirmar o reprogramar, horario semanal y días especiales.
 */

/* ---------- Agenda del panel ---------- */

export interface LugaresDeFranja {
  ocupados: number;
  cupo: number;
  /** Día cerrado o cupo 0 en la franja. */
  cerrada: boolean;
  /** Ocupados ≥ cupo (incluye cerrada). */
  llena: boolean;
}

/** Cupo y ocupados de una franja. Los ocupados se pasan aparte: la agenda los cuenta con los turnos que muestra. */
export function lugaresDeFranja(cupo: CupoDia, franja: Franja, ocupados: number): LugaresDeFranja {
  const capacidad = franja === 'manana' ? cupo.cupoManana : cupo.cupoTarde;
  const cerrada = !cupo.abierto || capacidad === 0;
  return { ocupados, cupo: cerrada ? 0 : capacidad, cerrada, llena: cerrada || ocupados >= capacidad };
}

/** "2/3" (o "Cerrada"). */
export const textoLugares = (l: LugaresDeFranja) => (l.cerrada ? 'Cerrada' : `${String(l.ocupados)}/${String(l.cupo)}`);

/** "2 de 3 lugares ocupados" para el lector de pantalla. */
export function textoLugaresLargo(l: LugaresDeFranja): string {
  if (l.cerrada) return l.ocupados > 0 ? `franja cerrada, con ${String(l.ocupados)} agendados` : 'franja cerrada';
  return `${String(l.ocupados)} de ${String(l.cupo)} lugares ocupados${l.llena ? ', completa' : ''}`;
}

/**
 * Aviso (no bloqueo) al confirmar o reprogramar: el panel manda, pero conviene saber si la franja ya está llena o
 * cerrada. `yaCuenta`: el turno ya ocupa ese lugar (p. ej. se confirma para lo que pidió), así que no se cuenta dos
 * veces. null si hay lugar o no se sabe.
 */
export function avisoDeLugar(cupo: CupoDia | null | undefined, franja: Franja, yaCuenta: boolean): string | null {
  if (!cupo) return null;
  const franjaTexto = ETIQUETA_FRANJA[franja].toLowerCase();
  if (!cupo.abierto) return 'Ese día el taller figura cerrado. Podés agendarlo igual.';
  const capacidad = franja === 'manana' ? cupo.cupoManana : cupo.cupoTarde;
  if (capacidad === 0) return `Ese día la ${franjaTexto} figura cerrada (cupo 0). Podés agendarlo igual.`;
  const ocupados = (franja === 'manana' ? cupo.ocupadosManana : cupo.ocupadosTarde) - (yaCuenta ? 1 : 0);
  if (ocupados >= capacidad) {
    return `Esa franja ya tiene ${String(ocupados)} de ${String(capacidad)}. Podés agendarlo igual.`;
  }
  return null;
}

/* ---------- Horario semanal y días especiales ---------- */

/** Orden en que se muestra la semana (lunes primero), en la convención de `dia` del contrato (0 = domingo). */
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

export const NOMBRE_DIA_SEMANA: readonly string[] = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/** `dia` del horario semanal (0 = domingo … 6 = sábado) de una fecha YYYY-MM-DD. */
export const diaDelHorario = (fecha: string) => (diaDeLaSemana(fecha) + 1) % 7;

/** El horario de la semana ordenado de lunes a domingo (los que falten no aparecen). */
export function horarioOrdenado(horario: readonly HorarioDia[]): HorarioDia[] {
  return ORDEN_SEMANA.flatMap((dia) => horario.filter((h) => h.dia === dia));
}

/** "Mañana 2 · Tarde 1", "Solo mañana: 2", "Cerrado". */
export function resumenDeCupos(abierto: boolean, cupoManana: number | null, cupoTarde: number | null): string {
  const m = cupoManana ?? 0;
  const t = cupoTarde ?? 0;
  if (!abierto || (m === 0 && t === 0)) return 'Cerrado';
  if (t === 0) return `Solo mañana: ${String(m)}`;
  if (m === 0) return `Solo tarde: ${String(t)}`;
  return `Mañana ${String(m)} · Tarde ${String(t)}`;
}

/** Prefijo con el que el backend siembra el motivo de los feriados precargados (migración disponibilidad_seguimiento). */
export const PREFIJO_FERIADO = 'Feriado: ';

/**
 * Un feriado precargado: el motivo empieza con "Feriado: " (lo que manda el backend; no hay lista fija de fechas,
 * así sirve para los que se siembren más adelante). `nombre` es el motivo sin el prefijo y `trasladable`, si el
 * motivo lo aclara (el 20/11/2026 trasladado al 23/11). null si no es un feriado.
 */
export function feriadoPrecargado(motivo: string | null): { nombre: string; trasladable: boolean } | null {
  if (motivo === null || !motivo.startsWith(PREFIJO_FERIADO)) return null;
  const nombre = motivo.slice(PREFIJO_FERIADO.length).trim();
  return { nombre: nombre === '' ? 'Feriado' : nombre, trasladable: /trasladable/i.test(nombre) };
}

export type ErroresCupo = Partial<Record<'cupoManana' | 'cupoTarde', string>>;

/** Lee un cupo escrito en un campo: entero de 0 a 20, o el mensaje de error. */
export function leerCupo(texto: string): { valor: number } | { error: string } {
  const limpio = texto.trim();
  if (!/^\d{1,2}$/.test(limpio)) return { error: `Poné un número de 0 a ${String(CUPO_MAXIMO)}.` };
  const valor = Number(limpio);
  if (valor > CUPO_MAXIMO) return { error: `Hasta ${String(CUPO_MAXIMO)} turnos por franja.` };
  return { valor };
}

/** El motivo, recortado (vacío = sin motivo) o el error si se pasa de largo. */
export function leerMotivo(texto: string): { valor: string | null } | { error: string } {
  const limpio = texto.trim();
  if (Array.from(limpio).length > MOTIVO_MAXIMO) return { error: `El motivo puede tener hasta ${String(MOTIVO_MAXIMO)} caracteres.` };
  return { valor: limpio === '' ? null : limpio };
}
