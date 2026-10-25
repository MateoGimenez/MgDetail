import type { CupoDia, Franja } from '../api/contract';
import { CUPO_MAXIMO, type CambioDiaEspecial, type DiaEspecial, type HorarioDia } from '../api/contract-panel';
import { diaDelHorario, feriadoPrecargado } from './cupos';
import { diaConMes, esFechaValida, lunesDeLaSemana, sumarDias } from './fechas';

/**
 * Calendario de la sección Disponibilidad del panel, en funciones puras: el mes de 42 días, el estado de cada día
 * (horario semanal + día especial + turnos que ya ocupan lugar), la selección de varios días y lo que se manda al
 * guardar (PUT o DELETE de reportes/2026-10-23_11_disponibilidad-seguimiento-recordatorios.md).
 */

/* ---------- Meses ---------- */

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

/** Días que entran en la grilla del mes: seis semanas, justo lo que deja pedir GET /api/admin/agenda. */
export const DIAS_DE_LA_GRILLA = 42;

/** "2026-10" de una fecha YYYY-MM-DD. */
export const mesDe = (fecha: string) => fecha.slice(0, 7);

/** El mes `delta` meses después (o antes) de "YYYY-MM". */
export function moverMes(mes: string, delta: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + delta;
  const anio = Math.floor(total / 12);
  return `${String(anio)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** "Octubre 2026". */
export function nombreDelMes(mes: string): string {
  const nombre = MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${mes.slice(0, 4)}`;
}

/**
 * Las 42 fechas de la grilla del mes, de lunes a domingo: arranca el lunes de la semana del día 1 (aunque sea del
 * mes anterior) y sigue seis semanas, así la grilla tiene siempre el mismo alto.
 */
export function diasDeLaGrilla(mes: string): string[] {
  const primero = lunesDeLaSemana(`${mes}-01`);
  return Array.from({ length: DIAS_DE_LA_GRILLA }, (_, i) => sumarDias(primero, i));
}

/** Último día del mes "YYYY-MM" (28 a 31). */
function diasDelMes(mes: string): number {
  const [anio, numero] = [Number(mes.slice(0, 4)), Number(mes.slice(5, 7))];
  return new Date(Date.UTC(anio, numero, 0)).getUTCDate();
}

/* ---------- Teclado de la grilla ---------- */

/**
 * A qué día va el foco con cada tecla (patrón de grilla de fechas de WAI-ARIA): flechas un día o una semana,
 * Inicio y Fin al lunes y al domingo de la semana, Re Pág y Av Pág al mismo día del mes anterior o siguiente
 * (o al último, si ese mes es más corto). null si la tecla no mueve nada.
 */
export function fechaConTecla(fecha: string, tecla: string): string | null {
  switch (tecla) {
    case 'ArrowLeft':
      return sumarDias(fecha, -1);
    case 'ArrowRight':
      return sumarDias(fecha, 1);
    case 'ArrowUp':
      return sumarDias(fecha, -7);
    case 'ArrowDown':
      return sumarDias(fecha, 7);
    case 'Home':
      return lunesDeLaSemana(fecha);
    case 'End':
      return sumarDias(lunesDeLaSemana(fecha), 6);
    case 'PageUp':
    case 'PageDown': {
      const mes = moverMes(mesDe(fecha), tecla === 'PageUp' ? -1 : 1);
      const dia = Math.min(Number(fecha.slice(8, 10)), diasDelMes(mes));
      return `${mes}-${String(dia).padStart(2, '0')}`;
    }
    default:
      return null;
  }
}

/* ---------- Estado de cada día ---------- */

export interface FranjaDelDia {
  /** Cupo vigente (0 = franja sin turnos). */
  cupo: number;
  /** Turnos no cancelados en esa franja; null si no se pudo saber (la agenda no cargó). */
  ocupados: number | null;
}

export interface EstadoDelDia {
  fecha: string;
  pasado: boolean;
  hoy: boolean;
  /** El día recibe pedidos: abierto y con al menos una franja con cupo. */
  abierto: boolean;
  manana: FranjaDelDia;
  tarde: FranjaDelDia;
  /** El día especial de esa fecha, si lo hay (solo se conocen de hoy en adelante). */
  especial: DiaEspecial | null;
  feriado: { nombre: string; trasladable: boolean } | null;
  /** Cambiado a mano: un día especial que no es un feriado precargado tal como vino (cerrado). */
  aMano: boolean;
}

export interface FuentesDelDia {
  hoy: string;
  horario: readonly HorarioDia[];
  /** Días especiales por fecha. */
  especiales: ReadonlyMap<string, DiaEspecial>;
  /** Cupos y ocupados de la agenda por fecha (vacío si no cargó). */
  cupos: ReadonlyMap<string, CupoDia>;
}

/**
 * Combina las tres fuentes. De hoy en adelante manda lo que está guardado (día especial o, si no hay, el horario
 * semanal), así un cambio recién hecho se ve sin volver a pedir la agenda; de la agenda solo salen los ocupados. Para
 * un día pasado (el backend no manda días especiales viejos) se usa lo que diga la agenda, si vino.
 */
export function estadoDelDia(fecha: string, fuentes: FuentesDelDia): EstadoDelDia {
  const { hoy, horario, especiales, cupos } = fuentes;
  const pasado = fecha < hoy;
  const agenda = cupos.get(fecha);
  const especial = especiales.get(fecha) ?? null;
  const semanal = horario.find((h) => h.dia === diaDelHorario(fecha));

  let abiertoBase: boolean;
  let cupoManana: number;
  let cupoTarde: number;
  if (pasado && agenda && !especial) {
    abiertoBase = agenda.abierto;
    cupoManana = agenda.cupoManana;
    cupoTarde = agenda.cupoTarde;
  } else if (especial) {
    abiertoBase = especial.abierto;
    cupoManana = especial.abierto ? (especial.cupoManana ?? 0) : 0;
    cupoTarde = especial.abierto ? (especial.cupoTarde ?? 0) : 0;
  } else {
    abiertoBase = semanal?.abierto ?? false;
    cupoManana = abiertoBase ? (semanal?.cupoManana ?? 0) : 0;
    cupoTarde = abiertoBase ? (semanal?.cupoTarde ?? 0) : 0;
  }
  if (!abiertoBase) {
    cupoManana = 0;
    cupoTarde = 0;
  }

  const feriado = feriadoPrecargado(especial?.motivo ?? null);
  return {
    fecha,
    pasado,
    hoy: fecha === hoy,
    abierto: abiertoBase && cupoManana + cupoTarde > 0,
    manana: { cupo: cupoManana, ocupados: agenda ? agenda.ocupadosManana : null },
    tarde: { cupo: cupoTarde, ocupados: agenda ? agenda.ocupadosTarde : null },
    especial,
    feriado,
    aMano: especial !== null && !(feriado !== null && !especial.abierto),
  };
}

const turnos = (n: number) => (n === 1 ? '1 turno' : `${String(n)} turnos`);

function textoFranja(nombre: string, f: FranjaDelDia): string {
  if (f.cupo === 0) return f.ocupados ? `${nombre} sin cupo, con ${turnos(f.ocupados)}` : `${nombre} sin turnos`;
  if (f.ocupados === null) return `${nombre} ${turnos(f.cupo)}`;
  return `${nombre} ${String(f.ocupados)} de ${String(f.cupo)} ocupados${f.ocupados >= f.cupo ? ', completa' : ''}`;
}

/** Turnos agendados en el día (0 si no se sabe). */
export const turnosDelDia = (e: EstadoDelDia) => (e.manana.ocupados ?? 0) + (e.tarde.ocupados ?? 0);

/**
 * Nombre accesible completo de la celda: "martes 27 de octubre, abierto, mañana 2 de 2 ocupados, completa, tarde 0
 * de 2 ocupados". Suma hoy, feriado, cambio a mano y si ya pasó.
 */
export function nombreDelDia(e: EstadoDelDia): string {
  const partes = [diaConMes(e.fecha)];
  if (e.hoy) partes.push('hoy');
  if (e.feriado) partes.push(`feriado: ${e.feriado.nombre}`);
  if (e.abierto) {
    partes.push('abierto', textoFranja('mañana', e.manana), textoFranja('tarde', e.tarde));
  } else {
    const cuantos = turnosDelDia(e);
    partes.push(cuantos > 0 ? `cerrado, con ${turnos(cuantos)}` : 'cerrado');
  }
  if (e.especial?.motivo && !e.feriado) partes.push(`motivo: ${e.especial.motivo}`);
  if (e.aMano) partes.push('cambiado a mano');
  if (e.pasado) partes.push('ya pasó');
  return partes.join(', ');
}

/* ---------- Selección de varios días ---------- */

/** Las fechas de `a` a `b`, ambas inclusive y en orden (no importa cuál venga primero). */
export function rangoDeFechas(a: string, b: string): string[] {
  if (!esFechaValida(a) || !esFechaValida(b)) return [];
  const [desde, hasta] = a <= b ? [a, b] : [b, a];
  const fechas: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) fechas.push(f);
  return fechas;
}

export type ModoSeleccion = 'rango' | 'sueltos';

export interface Seleccion {
  fechas: ReadonlySet<string>;
  /** En modo rango: la primera punta, esperando la segunda. */
  ancla: string | null;
}

export const SELECCION_VACIA: Seleccion = { fechas: new Set(), ancla: null };

/**
 * Tocar un día en el modo "Elegir varios días". Sueltos: lo suma o lo saca. De corrido: el primer toque marca una
 * punta y el segundo completa el rango; un tercero arranca otro. Los días pasados no se pueden elegir.
 */
export function tocarDia(seleccion: Seleccion, fecha: string, modo: ModoSeleccion, hoy: string): Seleccion {
  if (fecha < hoy) return seleccion;
  if (modo === 'sueltos') {
    const fechas = new Set(seleccion.fechas);
    if (fechas.has(fecha)) fechas.delete(fecha);
    else fechas.add(fecha);
    return { fechas, ancla: null };
  }
  if (seleccion.ancla === null) return { fechas: new Set([fecha]), ancla: fecha };
  return { fechas: new Set(rangoDeFechas(seleccion.ancla, fecha).filter((f) => f >= hoy)), ancla: null };
}

/* ---------- Detalle del día: borrador y lo que se guarda ---------- */

export interface Borrador {
  abierto: boolean;
  mananaActiva: boolean;
  tardeActiva: boolean;
  /** Cupo de cada franja cuando está activa (1 a 20). */
  cupoManana: number;
  cupoTarde: number;
  motivo: string;
}

/** Cupo con el que arranca una franja que se activa sin tener uno (lo mismo que el horario de fábrica). */
export const CUPO_INICIAL = 2;

const enRango = (n: number) => Math.min(CUPO_MAXIMO, Math.max(1, Math.round(n)));

/**
 * Borrador del detalle a partir de cómo está el día. Una franja apagada recuerda el cupo del horario semanal (o 2)
 * para cuando se vuelva a prender; un día cerrado arranca con las franjas que tendría abierto.
 */
export function borradorDe(e: EstadoDelDia, horario: readonly HorarioDia[]): Borrador {
  const semanal = horario.find((h) => h.dia === diaDelHorario(e.fecha));
  const deRespaldo = (franja: Franja) => {
    const valor = franja === 'manana' ? semanal?.cupoManana : semanal?.cupoTarde;
    return valor && valor > 0 ? valor : CUPO_INICIAL;
  };
  const motivo = e.especial?.motivo ?? '';
  if (!e.abierto) {
    return {
      abierto: false,
      mananaActiva: (semanal?.cupoManana ?? CUPO_INICIAL) > 0,
      tardeActiva: (semanal?.cupoTarde ?? CUPO_INICIAL) > 0,
      cupoManana: deRespaldo('manana'),
      cupoTarde: deRespaldo('tarde'),
      motivo,
    };
  }
  return {
    abierto: true,
    mananaActiva: e.manana.cupo > 0,
    tardeActiva: e.tarde.cupo > 0,
    cupoManana: e.manana.cupo > 0 ? enRango(e.manana.cupo) : deRespaldo('manana'),
    cupoTarde: e.tarde.cupo > 0 ? enRango(e.tarde.cupo) : deRespaldo('tarde'),
    motivo,
  };
}

/** El cupo que queda de verdad en cada franja con el borrador (0 si el día está cerrado o la franja apagada). */
export function cuposDelBorrador(b: Borrador): { manana: number; tarde: number } {
  if (!b.abierto) return { manana: 0, tarde: 0 };
  return { manana: b.mananaActiva ? enRango(b.cupoManana) : 0, tarde: b.tardeActiva ? enRango(b.cupoTarde) : 0 };
}

/** Body del PUT del día especial con lo que dice el borrador (motivo recortado; vacío = sin motivo). */
export function cambioDelBorrador(b: Borrador): CambioDiaEspecial {
  const motivo = b.motivo.trim() === '' ? null : b.motivo.trim();
  const { manana, tarde } = cuposDelBorrador(b);
  // Abierto pero sin ninguna franja es lo mismo que cerrado: se guarda así, que se lee mejor en todos lados.
  if (!b.abierto || manana + tarde === 0) return { abierto: false, motivo };
  return { abierto: true, cupoManana: manana, cupoTarde: tarde, motivo };
}

export type Accion = { tipo: 'guardar'; cambio: CambioDiaEspecial } | { tipo: 'quitar' } | { tipo: 'nada' };

const mismoCambio = (a: CambioDiaEspecial, b: CambioDiaEspecial) => JSON.stringify(a) === JSON.stringify(b);

/** Lo que el horario semanal le daría a esa fecha, como si fuera un día especial (para comparar). */
function cambioDelSemanal(fecha: string, horario: readonly HorarioDia[]): CambioDiaEspecial {
  const semanal = horario.find((h) => h.dia === diaDelHorario(fecha));
  if (!semanal?.abierto || semanal.cupoManana + semanal.cupoTarde === 0) return { abierto: false, motivo: null };
  return { abierto: true, cupoManana: semanal.cupoManana, cupoTarde: semanal.cupoTarde, motivo: null };
}

/** Lo que tiene guardado hoy el día especial, en la forma del PUT. */
function cambioDelEspecial(d: DiaEspecial): CambioDiaEspecial {
  const manana = d.cupoManana ?? 0;
  const tarde = d.cupoTarde ?? 0;
  if (!d.abierto || manana + tarde === 0) return { abierto: false, motivo: d.motivo };
  return { abierto: true, cupoManana: manana, cupoTarde: tarde, motivo: d.motivo };
}

/**
 * Qué hacer al guardar el detalle. Si el borrador no cambia nada, nada. Si queda igual que el horario semanal y sin
 * motivo, no hace falta un día especial: se quita el que hubiera (o no se crea). Si no, PUT con el borrador.
 */
export function accionDelBorrador(b: Borrador, e: EstadoDelDia, horario: readonly HorarioDia[]): Accion {
  const cambio = cambioDelBorrador(b);
  const actual = e.especial ? cambioDelEspecial(e.especial) : cambioDelSemanal(e.fecha, horario);
  if (mismoCambio(cambio, actual)) return { tipo: 'nada' };
  if (mismoCambio(cambio, cambioDelSemanal(e.fecha, horario))) return e.especial ? { tipo: 'quitar' } : { tipo: 'nada' };
  return { tipo: 'guardar', cambio };
}

/**
 * Aviso (no bloquea) si el borrador deja afuera turnos que ya están: cerrar un día o una franja, o bajar el cupo por
 * debajo de lo agendado. Los turnos no se cancelan; solo deja de recibir pedidos nuevos.
 */
export function avisoDeTurnos(b: Borrador, e: EstadoDelDia): string | null {
  const total = turnosDelDia(e);
  if (total === 0) return null;
  const { manana, tarde } = cuposDelBorrador(b);
  const sufijo = 'no se cancelan, solo deja de recibir pedidos nuevos.';
  if (manana + tarde === 0) return `Ese día ya tiene ${turnos(total)}: ${sufijo}`;
  const problemas: string[] = [];
  const om = e.manana.ocupados ?? 0;
  const ot = e.tarde.ocupados ?? 0;
  if (om > 0 && manana === 0) problemas.push(`la mañana ya tiene ${turnos(om)}`);
  else if (om > manana) problemas.push(`la mañana ya tiene ${turnos(om)} y el cupo queda en ${String(manana)}`);
  if (ot > 0 && tarde === 0) problemas.push(`la tarde ya tiene ${turnos(ot)}`);
  else if (ot > tarde) problemas.push(`la tarde ya tiene ${turnos(ot)} y el cupo queda en ${String(tarde)}`);
  if (problemas.length === 0) return null;
  const texto = problemas.join(' y ');
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}: ${sufijo}`;
}

/* ---------- Varios días a la vez ---------- */

export type AccionMasiva = 'cerrar' | 'abrir';

/**
 * Lo que se manda para cada día al cerrar o abrir varios de una vez.
 * - Cerrar: PUT cerrado con el motivo (o el que ya tenía, si no se escribió otro).
 * - Abrir: con los cupos del horario semanal de ese día (o 2 y 2 si ese día de la semana no se atiende). Un feriado
 *   se abre conservando su motivo, así sigue marcado. Si el día queda igual que el horario semanal y sin motivo, se
 *   quita el día especial (o no se hace nada si no había).
 */
export function accionMasiva(tipo: AccionMasiva, e: EstadoDelDia, horario: readonly HorarioDia[], motivo: string): Accion {
  const escrito = motivo.trim() === '' ? null : motivo.trim();
  const motivoFinal = escrito ?? e.especial?.motivo ?? null;
  let cambio: CambioDiaEspecial;
  if (tipo === 'cerrar') {
    cambio = { abierto: false, motivo: motivoFinal };
  } else {
    const semanal = horario.find((h) => h.dia === diaDelHorario(e.fecha));
    const conCupo = semanal?.abierto && semanal.cupoManana + semanal.cupoTarde > 0;
    cambio = {
      abierto: true,
      cupoManana: conCupo ? semanal.cupoManana : CUPO_INICIAL,
      cupoTarde: conCupo ? semanal.cupoTarde : CUPO_INICIAL,
      motivo: e.feriado ? motivoFinal : escrito,
    };
  }
  const actual = e.especial ? cambioDelEspecial(e.especial) : cambioDelSemanal(e.fecha, horario);
  if (mismoCambio(cambio, actual)) return { tipo: 'nada' };
  if (mismoCambio(cambio, cambioDelSemanal(e.fecha, horario))) return e.especial ? { tipo: 'quitar' } : { tipo: 'nada' };
  return { tipo: 'guardar', cambio };
}

/** Los días especiales de hoy en adelante, en orden (para "Próximos cambios"). */
export function proximosCambios(especiales: readonly DiaEspecial[], hoy: string): DiaEspecial[] {
  return especiales.filter((d) => d.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
