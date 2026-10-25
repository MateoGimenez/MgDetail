import type { DiaDisponible, Franja } from '../api/contract';
import { diaDeLaSemana, esFechaValida } from './fechas';

/**
 * Disponibilidad en el formulario público (reportes/2026-10-23_11_disponibilidad-seguimiento-recordatorios.md), en
 * funciones puras. Lo del panel (cupos, horario semanal, feriados) está en cupos.ts, para que la landing no lo cargue.
 */

/* ---------- Formulario público ---------- */

export type EstadoDelDia = 'libre' | 'cerrado' | 'lleno';

/** Un día sin dato (fuera de lo que mandó el backend) se toma como cerrado. */
export function estadoDelDia(dia: DiaDisponible | undefined): EstadoDelDia {
  if (!dia?.abierto) return 'cerrado';
  return dia.manana || dia.tarde ? 'libre' : 'lleno';
}

/** Por qué no se puede elegir un día, en palabras para el lector de pantalla y para el rótulo. */
export const MOTIVO_NO_DISPONIBLE: Readonly<Record<Exclude<EstadoDelDia, 'libre'>, string>> = {
  cerrado: 'no atendemos',
  lleno: 'sin lugar',
};

export const franjaLibre = (dia: DiaDisponible | undefined, franja: Franja) => (dia ? dia[franja] : false);

export interface MesDelCalendario {
  /** "2026-10". */
  clave: string;
  anio: number;
  /** 1 a 12. */
  mes: number;
  /** Semanas de lunes a domingo; null = celda vacía (antes del primer día o después del último del rango). */
  semanas: (string | null)[][];
}

/**
 * Arma los meses del calendario con las fechas que mandó el backend (ya ordenadas o no). Cada mes empieza en su
 * primer día del rango, alineado al lunes; las celdas sin fecha quedan en null.
 */
export function mesesDelCalendario(fechas: readonly string[]): MesDelCalendario[] {
  const validas = [...new Set(fechas.filter(esFechaValida))].sort();
  const porMes = new Map<string, string[]>();
  for (const fecha of validas) {
    const clave = fecha.slice(0, 7);
    const lista = porMes.get(clave) ?? [];
    lista.push(fecha);
    porMes.set(clave, lista);
  }
  return [...porMes.entries()].map(([clave, dias]) => {
    const celdas: (string | null)[] = [];
    const primero = dias[0];
    const relleno = primero ? diaDeLaSemana(primero) : 0;
    for (let i = 0; i < relleno; i += 1) celdas.push(null);
    // Los días del mismo mes son consecutivos en el rango (hoy a hoy + 60), pero por las dudas se respetan los huecos.
    for (const fecha of dias) {
      const anterior = celdas.at(-1);
      if (typeof anterior === 'string') {
        const salto = Number(fecha.slice(8)) - Number(anterior.slice(8)) - 1;
        for (let i = 0; i < salto; i += 1) celdas.push(null);
      }
      celdas.push(fecha);
    }
    while (celdas.length % 7 !== 0) celdas.push(null);
    const semanas: (string | null)[][] = [];
    for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
    return { clave, anio: Number(clave.slice(0, 4)), mes: Number(clave.slice(5, 7)), semanas };
  });
}
