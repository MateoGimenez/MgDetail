import { MONTO_MAXIMO, type Turno } from '../api/contract';

/**
 * Cobro de un trabajo (reportes/2026-10-26_15_estadisticas-y-permisos.md), en funciones puras: leer el monto que
 * escribe el dueño, mostrarlo en pesos y decidir si a un turno completado le falta el cobro.
 */

/** "60000" → "$ 60.000". Puntos de miles a mano: Intl pone espacios raros según el navegador. */
export function formatoPesos(monto: number): string {
  return `$ ${String(Math.trunc(monto)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export type ResultadoMonto = { valor: number | null } | { error: string };

export const MENSAJE_MONTO_NUMERO = 'Escribí solo números, por ejemplo 25000 o $ 25.000.';
export const MENSAJE_MONTO_ENTERO = 'Cargalo en pesos enteros, sin centavos.';
export const MENSAJE_MONTO_TOPE = `Es demasiado: el máximo es ${formatoPesos(MONTO_MAXIMO)}.`;

/**
 * Lee lo que escribió la persona: "25000", "25.000", "$ 25.000", "25 000". Vacío es válido (el monto es opcional) y
 * da `null`. Los puntos y espacios solo valen como separador de miles (grupos de tres); los centavos, el signo y las
 * letras se rechazan con un mensaje que dice qué hacer.
 */
export function leerMonto(texto: string): ResultadoMonto {
  const limpio = texto.replace(/^\s*\$\s*/, '').trim();
  if (limpio === '') return { valor: null };
  const conMiles = /^\d{1,3}(\.\d{3})+$/.test(limpio) || /^\d{1,3}( \d{3})+$/.test(limpio);
  if (!conMiles && !/^\d+$/.test(limpio)) {
    // "25,50", "25.5" o "25.000,50": tiene centavos.
    return { error: /^(\d+|\d{1,3}(\.\d{3})+)[.,]\d{1,2}$/.test(limpio) ? MENSAJE_MONTO_ENTERO : MENSAJE_MONTO_NUMERO };
  }
  const digitos = limpio.replace(/[.\s]/g, '');
  const valor = Number(digitos);
  if (!Number.isSafeInteger(valor) || valor > MONTO_MAXIMO) return { error: MENSAJE_MONTO_TOPE };
  return { valor };
}

/** Lo que va en el campo al abrirlo: el monto cargado, sin formato, para editarlo. */
export const montoParaCampo = (monto: number | null): string => (monto === null ? '' : String(monto));

type DatosDeCobro = Pick<Turno, 'estado' | 'monto' | 'trabajador'>;

/** Un trabajo completado sin monto cargado: es lo que le falta al dueño por registrar. */
export const faltaCobro = (turno: Pick<Turno, 'estado' | 'monto'>): boolean =>
  turno.estado === 'completado' && turno.monto === null;

/** Cuántos turnos completados no tienen monto. */
export const contarSinCobro = (turnos: readonly Pick<Turno, 'estado' | 'monto'>[]): number =>
  turnos.filter(faltaCobro).length;

/**
 * La línea de cobro de un turno completado: "Cobrado $ 60.000 · Lucas" o "Sin cobro cargado · Lucas". Quien no ve
 * importes (el empleado) solo ve quién lo hizo. Devuelve null si el turno no está completado o no hay nada que decir.
 */
export function lineaDeCobro(turno: DatosDeCobro, verImportes: boolean): string | null {
  if (turno.estado !== 'completado') return null;
  const quien = turno.trabajador?.nombre ?? null;
  if (!verImportes) return quien ? `Lo hizo ${quien}` : null;
  const cobro = turno.monto === null ? 'Sin cobro cargado' : `Cobrado ${formatoPesos(turno.monto)}`;
  return quien ? `${cobro} · ${quien}` : `${cobro} · Sin asignar`;
}

/** "1 trabajo completado sin cobro cargado", "4 trabajos completados sin cobro cargado". */
export function textoSinCobro(cantidad: number, aproximado = false): string {
  const n = aproximado ? `Al menos ${String(cantidad)}` : String(cantidad);
  return cantidad === 1 && !aproximado
    ? '1 trabajo completado sin cobro cargado'
    : `${n} trabajos completados sin cobro cargado`;
}
