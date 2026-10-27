import { diasDelRango, nombreDelMes } from './estadisticas';
import { esFechaValida, sumarDias } from './fechas';

/**
 * Rangos de fechas de Estadísticas. "Hoy" siempre es la fecha de La Rioja que se pasa de afuera (ver
 * `hoyEnLaRioja` en fechas.ts); acá no se lee el reloj.
 */

export const PRESETS = ['hoy', '7dias', '30dias', 'mes', 'mesPasado', 'anio', 'personalizado'] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_POR_DEFECTO: Preset = 'mes';

export const ETIQUETA_PRESET: Readonly<Record<Preset, string>> = {
  hoy: 'Hoy',
  '7dias': '7 días',
  '30dias': '30 días',
  mes: 'Este mes',
  mesPasado: 'Mes pasado',
  anio: 'Este año',
  personalizado: 'Personalizado',
};

/** Máximo de días que admite el backend en un rango (extremos incluidos). */
export const DIAS_MAXIMOS_RANGO = 366;

export interface RangoFechas {
  desde: string;
  hasta: string;
}

const primerDiaDelMes = (fecha: string) => `${fecha.slice(0, 8)}01`;
/** Último día del mes de una fecha. */
export const ultimoDiaDelMes = (fecha: string) => sumarDias(sumarDias(primerDiaDelMes(fecha), 32).slice(0, 8) + '01', -1);

/** Rango de un preset visto desde `hoy`. `personalizado` no tiene rango propio: lo elige la persona (null). */
export function rangoPreestablecido(preset: Preset, hoy: string): RangoFechas | null {
  switch (preset) {
    case 'hoy':
      return { desde: hoy, hasta: hoy };
    case '7dias':
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case '30dias':
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    case 'mes':
      return { desde: primerDiaDelMes(hoy), hasta: hoy };
    case 'mesPasado': {
      const ultimo = sumarDias(primerDiaDelMes(hoy), -1);
      return { desde: primerDiaDelMes(ultimo), hasta: ultimo };
    }
    case 'anio':
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
    case 'personalizado':
      return null;
  }
}

export interface ErroresRango {
  desde?: string;
  hasta?: string;
}

/** Controla un rango escrito a mano: fechas reales, `hasta` no antes que `desde` y hasta 366 días. */
export function validarRango(desde: string, hasta: string): ErroresRango {
  const errores: ErroresRango = {};
  if (!esFechaValida(desde)) errores.desde = 'Elegí desde qué día.';
  if (!esFechaValida(hasta)) errores.hasta = 'Elegí hasta qué día.';
  if (errores.desde || errores.hasta) return errores;
  const dias = diasDelRango(desde, hasta);
  if (dias < 1) errores.hasta = 'El “hasta” no puede ser antes que el “desde”.';
  else if (dias > DIAS_MAXIMOS_RANGO) {
    errores.hasta = `Elegí como mucho ${String(DIAS_MAXIMOS_RANGO)} días (casi un año). Elegiste ${String(dias)}.`;
  }
  return errores;
}

/**
 * Rango en palabras: "26 de octubre", "1 al 26 de octubre", "1 de octubre al 3 de noviembre". Si los extremos son
 * de años distintos, o el rango no es del año de `hoy`, se agrega el año.
 */
export function textoDelRango(rango: RangoFechas, hoy: string): string {
  if (!esFechaValida(rango.desde) || !esFechaValida(rango.hasta)) return `${rango.desde} al ${rango.hasta}`;
  const [a1, m1, d1] = rango.desde.split('-').map(Number) as [number, number, number];
  const [a2, m2, d2] = rango.hasta.split('-').map(Number) as [number, number, number];
  const anioDeHoy = Number(hoy.slice(0, 4));
  const conAnio = (anio: number, forzar: boolean) => (forzar || anio !== anioDeHoy ? ` de ${String(anio)}` : '');
  if (rango.desde === rango.hasta) return `${String(d2)} de ${nombreDelMes(m2)}${conAnio(a2, false)}`;
  if (a1 !== a2) {
    return `${String(d1)} de ${nombreDelMes(m1)} de ${String(a1)} al ${String(d2)} de ${nombreDelMes(m2)} de ${String(a2)}`;
  }
  if (m1 === m2) return `${String(d1)} al ${String(d2)} de ${nombreDelMes(m2)}${conAnio(a2, false)}`;
  return `${String(d1)} de ${nombreDelMes(m1)} al ${String(d2)} de ${nombreDelMes(m2)}${conAnio(a2, false)}`;
}
