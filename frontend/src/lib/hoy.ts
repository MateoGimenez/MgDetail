import { ETIQUETA_FRANJA, FRANJAS, type CupoDia, type Franja, type Turno } from '../api/contract';
import { agruparPorDia, cantidadDelDia, textoCantidad, type Celda } from './agenda';
import { lugaresDeFranja, type LugaresDeFranja } from './cupos';
import { ZONA_HORARIA } from './fechas';

/**
 * Pantalla "Hoy" del panel (reportes/2026-10-26_13_panel-pulido-y-app.md), en funciones puras: qué vista abre el
 * panel, los pendientes más viejos, el resumen de hoy y mañana y los avisos de cupo.
 */

/* ---------- Vista inicial (?vista=) ---------- */

export const VISTAS = [
  'hoy',
  'turnos',
  'agenda',
  'estadisticas',
  'finanzas',
  'presupuestos',
  'inventario',
  'disponibilidad',
  'servicios',
  'usuarios',
] as const;
export type Vista = (typeof VISTAS)[number];

/**
 * Vista con la que se abre el panel. `parametro` es el valor crudo de `?vista=`; si falta, es inválido o el rol no
 * puede verlo (Usuarios es solo del superadmin) se abre Hoy. Se usa solo al abrir: después manda la navegación.
 */
export function resolverVista(parametro: string | null | undefined, permitidas: readonly Vista[]): Vista {
  const pedida = VISTAS.find((vista) => vista === parametro);
  return pedida && permitidas.includes(pedida) ? pedida : 'hoy';
}

/* ---------- Pendientes ---------- */

/** Los `cuantos` pendientes que llegaron primero (los que más esperan), el más viejo arriba. No toca la lista original. */
export function masViejos(turnos: readonly Turno[], cuantos: number): Turno[] {
  return turnos
    .filter((turno) => turno.estado === 'pendiente')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, Math.max(0, cuantos));
}

/** "1 insumo con stock bajo", "3 insumos con stock bajo". */
export const textoStockBajo = (n: number) => (n === 1 ? '1 insumo con stock bajo' : `${String(n)} insumos con stock bajo`);

/** "1 pendiente", "4 pendientes". */
export const textoPendientes = (n: number) => (n === 1 ? '1 pendiente' : `${String(n)} pendientes`);

/**
 * Hace cuánto llegó, en palabras llanas: "hace un rato", "hace 3 h", "ayer", "hace 4 días". `ahora` y `creado` son
 * instantes (ISO); no depende de la zona horaria.
 */
export function haceCuanto(creado: string, ahora: Date): string {
  const minutos = Math.floor((ahora.getTime() - new Date(creado).getTime()) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return 'recién';
  if (minutos < 60) return minutos === 1 ? 'hace 1 min' : `hace ${String(minutos)} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${String(horas)} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${String(dias)} días`;
}

/* ---------- Saludo ---------- */

const horaDeLaRioja = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: '2-digit', hourCycle: 'h23' });

/** "Buen día" hasta el mediodía, "Buenas tardes" hasta las 20 y "Buenas noches" después (hora de La Rioja). */
export function saludoSegunHora(now: Date): string {
  const hora = Number(horaDeLaRioja.format(now));
  if (hora < 12) return 'Buen día';
  if (hora < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/* ---------- Un día: franjas, cupos y avisos ---------- */

export interface FranjaDelDia {
  franja: Franja;
  turnos: readonly Turno[];
  /** null si el backend no mandó cupos de ese día. */
  lugares: LugaresDeFranja | null;
}

export interface ResumenDelDia {
  fecha: string;
  total: number;
  /** El taller figura cerrado ese día (null si no hay datos de cupos). */
  cerrado: boolean | null;
  franjas: readonly FranjaDelDia[];
}

/** "1 turno agendado", "3 turnos agendados". */
const agendados = (n: number) => (n === 1 ? `${textoCantidad(n)} agendado` : `${textoCantidad(n)} agendados`);

const CELDA_VACIA: Celda = { manana: [], tarde: [] };

/** Resumen de una fecha con los turnos de la agenda (no cancelados) y, si hay, los cupos del día. */
export function resumenDelDia(turnos: readonly Turno[], fecha: string, cupo: CupoDia | null | undefined): ResumenDelDia {
  const celda = agruparPorDia(turnos, [fecha]).get(fecha) ?? CELDA_VACIA;
  return {
    fecha,
    total: cantidadDelDia(celda),
    cerrado: cupo ? !cupo.abierto : null,
    franjas: FRANJAS.map((franja) => ({
      franja,
      turnos: celda[franja],
      lugares: cupo ? lugaresDeFranja(cupo, franja, celda[franja].length) : null,
    })),
  };
}

/**
 * Avisos de hoy: día cerrado o franja llena. Son informativos (el panel manda). Un día cerrado resume todo y no
 * repite una por franja.
 */
export function avisosDeHoy(dia: ResumenDelDia): string[] {
  if (dia.cerrado) {
    return [
      dia.total > 0
        ? `Hoy el taller figura cerrado, pero ya hay ${agendados(dia.total)}.`
        : 'Hoy el taller figura cerrado: la web no recibe pedidos para hoy.',
    ];
  }
  const avisos: string[] = [];
  for (const { franja, lugares } of dia.franjas) {
    if (!lugares) continue;
    const nombre = ETIQUETA_FRANJA[franja].toLowerCase();
    if (lugares.cerrada) avisos.push(`Hoy la ${nombre} figura cerrada.`);
    else if (lugares.llena) {
      avisos.push(`La ${nombre} de hoy está llena (${String(lugares.ocupados)}/${String(lugares.cupo)}).`);
    }
  }
  return avisos;
}

/** Frase corta de mañana: "3 turnos", "Sin turnos" o "El taller figura cerrado". */
export function resumenDeManana(dia: ResumenDelDia): string {
  if (dia.cerrado) return dia.total > 0 ? `Figura cerrado, con ${agendados(dia.total)}` : 'El taller figura cerrado';
  return dia.total > 0 ? textoCantidad(dia.total) : 'Sin turnos por ahora';
}
