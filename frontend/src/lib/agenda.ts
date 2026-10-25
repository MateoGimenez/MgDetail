import { ETIQUETA_FRANJA, FRANJA_EN_FRASE, FRANJAS, type Franja, type Turno } from '../api/contract';
import { diaCorto, esFechaValida, fechaLarga, rangoDeConfirmacion } from './fechas';

/**
 * Reglas de la agenda (reportes/2026-10-22_08_agenda.md), en funciones puras:
 * la fecha de agenda de un turno es la confirmada si existe y, si no, la que pidió el cliente.
 */

export interface LugarEnAgenda {
  fecha: string;
  franja: Franja;
  /** true si el taller lo confirmó para otro día u otra franja que lo que pidió el cliente. */
  reprogramado: boolean;
}

export function lugarEnAgenda(turno: Turno): LugarEnAgenda {
  if (turno.fechaConfirmada === null || turno.franjaConfirmada === null) {
    return { fecha: turno.fechaPreferida, franja: turno.franja, reprogramado: false };
  }
  return {
    fecha: turno.fechaConfirmada,
    franja: turno.franjaConfirmada,
    reprogramado: turno.fechaConfirmada !== turno.fechaPreferida || turno.franjaConfirmada !== turno.franja,
  };
}

/** "Pidió: jue 24" (o "Pidió: jue 24 · Tarde" si también cambió la franja); null si se agendó para lo que pidió. */
export function textoPidio(turno: Turno): string | null {
  const lugar = lugarEnAgenda(turno);
  if (!lugar.reprogramado) return null;
  const franja = lugar.franja !== turno.franja ? ` · ${ETIQUETA_FRANJA[turno.franja]}` : '';
  return `Pidió: ${diaCorto(turno.fechaPreferida)}${franja}`;
}

/**
 * Mensaje de WhatsApp para el cliente desde la tarjeta del turno. Usa la fecha de agenda: la confirmada si existe,
 * si no la que pidió (contrato de la agenda). Con `seguimiento` (la URL pública de /turno/<id>, solo si la web tiene
 * `sitio.url`), suma el enlace para que el cliente vea el estado.
 */
export function mensajeParaCliente(
  turno: Turno,
  servicio: string,
  nombreNegocio: string,
  seguimiento: string | null = null,
): string {
  const lugar = lugarEnAgenda(turno);
  const primerNombre = turno.nombre.trim().split(/\s+/)[0] ?? turno.nombre;
  const que = turno.estado === 'confirmado' ? 'turno' : 'pedido de turno';
  const mensaje = `¡Hola ${primerNombre}! Te escribimos de ${nombreNegocio} por tu ${que}: ${servicio}, el ${fechaLarga(lugar.fecha)} ${FRANJA_EN_FRASE[lugar.franja]}.`;
  return seguimiento ? `${mensaje} Podés ver cómo va acá: ${seguimiento}` : mensaje;
}

/** true si el turno ocupa lugar en la agenda (los cancelados no). */
export const estaEnAgenda = (turno: Turno) => turno.estado !== 'cancelado';

export type Celda = Readonly<Record<Franja, readonly Turno[]>>;

const ORDEN_FRANJA: Readonly<Record<Franja, number>> = { manana: 0, tarde: 1 };

/**
 * Agrupa los turnos por día y franja para los días pedidos (todos los días aparecen, aunque estén vacíos).
 * Deja afuera los cancelados y lo que cae fuera de esos días (por ejemplo, un turno recién reprogramado a otra
 * semana). Dentro de cada celda, por orden de llegada, como el backend.
 */
export function agruparPorDia(turnos: readonly Turno[], dias: readonly string[]): ReadonlyMap<string, Celda> {
  const grupos = new Map<string, Record<Franja, Turno[]>>(dias.map((dia) => [dia, { manana: [], tarde: [] }]));
  const ordenados = [...turnos].filter(estaEnAgenda).sort((a, b) => {
    const la = lugarEnAgenda(a);
    const lb = lugarEnAgenda(b);
    return (
      la.fecha.localeCompare(lb.fecha) ||
      ORDEN_FRANJA[la.franja] - ORDEN_FRANJA[lb.franja] ||
      a.createdAt.localeCompare(b.createdAt)
    );
  });
  for (const turno of ordenados) {
    const lugar = lugarEnAgenda(turno);
    grupos.get(lugar.fecha)?.[lugar.franja].push(turno);
  }
  return grupos;
}

export const cantidadDelDia = (celda: Celda | undefined) =>
  celda ? FRANJAS.reduce((total, franja) => total + celda[franja].length, 0) : 0;

/** "1 turno", "3 turnos". */
export const textoCantidad = (n: number) => (n === 1 ? '1 turno' : `${String(n)} turnos`);

export type ErroresFecha = Partial<Record<'fechaConfirmada' | 'franjaConfirmada', string>>;

/** Valida la fecha y franja confirmadas con las reglas del contrato (de hoy a hoy + 120 días, en La Rioja). */
export function validarFechaConfirmada(fecha: string, franja: Franja | null, now: Date): ErroresFecha {
  const { min, max } = rangoDeConfirmacion(now);
  const errores: ErroresFecha = {};
  const limpia = fecha.trim();
  if (limpia === '') errores.fechaConfirmada = 'Elegí el día del turno.';
  else if (!esFechaValida(limpia)) errores.fechaConfirmada = 'Esa fecha no es válida.';
  else if (limpia < min) errores.fechaConfirmada = 'Elegí una fecha de hoy en adelante.';
  else if (limpia > max) errores.fechaConfirmada = 'Se puede agendar hasta 120 días adelante.';
  if (franja === null) errores.franjaConfirmada = 'Elegí mañana o tarde.';
  return errores;
}
