import type { Estadisticas, FilaDiaSemana, Granularidad, MisTrabajos, PuntoDeSerie } from '../api/estadisticas';
import {
  DIAS_SEMANA_BACKEND,
  ORDEN_SEMANA,
  entero,
  etiquetaDeClave,
  partesPorEstado,
  pesos,
  porcentaje,
} from './estadisticas';
import type { RangoFechas } from './rangosEstadisticas';

/**
 * Tablas de datos alternativas de cada gráfico ("Ver los números") y el CSV del período. Son texto ya formateado
 * para leer; el CSV lleva números crudos para que Excel los sume.
 */

export interface TablaDatos {
  /** Qué es la tabla (el resumen del `<details>` y el título de la sección del CSV). */
  titulo: string;
  columnas: readonly string[];
  /** Las columnas con números van alineadas a la derecha. */
  numericas: readonly boolean[];
  filas: readonly (readonly string[])[];
}

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/* ---------- Tablas alternativas ---------- */

export function tablaIngresos(serie: readonly PuntoDeSerie[], granularidad: Granularidad): TablaDatos {
  return {
    titulo: granularidad === 'dia' ? 'Ingresos por día' : 'Ingresos por mes',
    columnas: [granularidad === 'dia' ? 'Día' : 'Mes', 'Trabajos completados', 'Ingresos'],
    numericas: [false, true, true],
    filas: serie.map((p) => [conMayuscula(etiquetaDeClave(p.clave)), entero(p.completados), pesos(p.ingresos)]),
  };
}

export function tablaServicios(porServicio: Estadisticas['porServicio'], conImportes: boolean): TablaDatos {
  return {
    titulo: 'Servicios',
    columnas: conImportes ? ['Servicio', 'Pedidos', 'Completados', 'Ingresos'] : ['Servicio', 'Completados'],
    numericas: conImportes ? [false, true, true, true] : [false, true],
    filas: porServicio.map((s) =>
      conImportes ? [s.nombre, entero(s.pedidos), entero(s.completados), pesos(s.ingresos)] : [s.nombre, entero(s.completados)],
    ),
  };
}

export function tablaEquipo(porTrabajador: Estadisticas['porTrabajador']): TablaDatos {
  return {
    titulo: 'Equipo',
    columnas: ['Quién', 'Trabajos completados', 'Ingresos'],
    numericas: [false, true, true],
    filas: porTrabajador.map((t) => [t.nombre, entero(t.completados), pesos(t.ingresos)]),
  };
}

/** Filas del mapa de calor en orden de semana (lunes primero). Los días que el backend no mandó cuentan 0. */
export function diasEnOrden(porDiaSemana: readonly FilaDiaSemana[]): { dia: number; manana: number; tarde: number }[] {
  return ORDEN_SEMANA.map((dia) => {
    const fila = porDiaSemana.find((f) => f.dia === dia);
    return { dia, manana: fila?.manana ?? 0, tarde: fila?.tarde ?? 0 };
  });
}

export function tablaDiaSemana(porDiaSemana: readonly FilaDiaSemana[]): TablaDatos {
  return {
    titulo: 'Pedidos por día de la semana',
    columnas: ['Día', 'Mañana', 'Tarde', 'Total'],
    numericas: [false, true, true, true],
    filas: diasEnOrden(porDiaSemana).map((f) => [
      conMayuscula(DIAS_SEMANA_BACKEND[f.dia] ?? ''),
      entero(f.manana),
      entero(f.tarde),
      entero(f.manana + f.tarde),
    ]),
  };
}

export function tablaEstados(periodo: Estadisticas['periodo']): TablaDatos {
  return {
    titulo: 'Estado de los turnos',
    columnas: ['Estado', 'Turnos', 'Parte del total'],
    numericas: [false, true, true],
    filas: partesPorEstado(periodo).map((p) => [p.etiqueta, entero(p.cantidad), porcentaje(p.proporcion)]),
  };
}

export function tablaMisServicios(porServicio: MisTrabajos['porServicio']): TablaDatos {
  return {
    titulo: 'Tus trabajos por servicio',
    columnas: ['Servicio', 'Trabajos'],
    numericas: [false, true],
    filas: porServicio.map((s) => [s.nombre, entero(s.completados)]),
  };
}

export function tablaMisDias(serie: MisTrabajos['serie'], granularidad: Granularidad): TablaDatos {
  return {
    titulo: granularidad === 'dia' ? 'Tus trabajos por día' : 'Tus trabajos por mes',
    columnas: [granularidad === 'dia' ? 'Día' : 'Mes', 'Trabajos'],
    numericas: [false, true],
    filas: serie.map((p) => [conMayuscula(etiquetaDeClave(p.clave)), entero(p.completados)]),
  };
}

/* ---------- CSV (Excel de Argentina: separador ";" y BOM UTF-8) ---------- */

export const SEPARADOR_CSV = ';';
const BOM = '﻿';

export type CeldaCsv = string | number | null;

/**
 * Una celda del CSV. Los textos que empiezan con =, +, - o @ (o con tabulación o salto de línea) se prefijan con `'`:
 * Excel los tomaría por una fórmula y podría ejecutar lo que venga en el nombre de un servicio o de una persona.
 * Los números van crudos (coma decimal); null queda vacío. Se entrecomilla lo que tenga ; " o saltos de línea.
 */
export function celdaCsv(valor: CeldaCsv): string {
  if (valor === null) return '';
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor).replace('.', ',') : '';
  const texto = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Arma el archivo: BOM, filas separadas por CRLF (Excel). Una fila vacía es una línea en blanco. */
export function armarCsv(filas: readonly (readonly CeldaCsv[])[]): string {
  return BOM + filas.map((fila) => fila.map(celdaCsv).join(SEPARADOR_CSV)).join('\r\n') + '\r\n';
}

/** Proporción 0..1 como porcentaje con coma ("10,5"), o vacío si no hay base. */
const pctCsv = (proporcion: number | null): CeldaCsv => (proporcion === null ? null : Math.round(proporcion * 1000) / 10);

/** CSV de las estadísticas completas del período (una tabla debajo de la otra). */
export function csvEstadisticas(datos: Estadisticas): string {
  const p = datos.periodo;
  const orden = diasEnOrden(datos.porDiaSemana);
  const filas: CeldaCsv[][] = [
    ['Estadísticas MgDetailing'],
    ['Desde', datos.rango.desde],
    ['Hasta', datos.rango.hasta],
    [],
    ['Resumen del período'],
    ['Turnos', p.turnos],
    ['Pedidos (sin cancelados)', p.pedidos],
    ['Pendientes', p.pendientes],
    ['Confirmados', p.confirmados],
    ['Completados', p.completados],
    ['Cancelados', p.cancelados],
    ['Ingresos (pesos)', p.ingresos],
    ['Ticket promedio (pesos)', p.ticketPromedio === null ? null : Math.round(p.ticketPromedio)],
    ['Tasa de cancelación (%)', pctCsv(p.tasaCancelacion)],
    ['Completados sin cobro cargado', p.completadosSinMonto],
    ['Completados sin trabajador', datos.completadosSinTrabajador],
    [],
    [datos.granularidad === 'dia' ? 'Ingresos por día' : 'Ingresos por mes'],
    [datos.granularidad === 'dia' ? 'Día' : 'Mes', 'Completados', 'Ingresos (pesos)'],
    ...datos.serie.map((s): CeldaCsv[] => [s.clave, s.completados, s.ingresos]),
    [],
    ['Por servicio'],
    ['Servicio', 'Pedidos', 'Completados', 'Ingresos (pesos)'],
    ...datos.porServicio.map((s): CeldaCsv[] => [s.nombre, s.pedidos, s.completados, s.ingresos]),
    [],
    ['Por trabajador'],
    ['Quién', 'Completados', 'Ingresos (pesos)'],
    ...datos.porTrabajador.map((t): CeldaCsv[] => [t.nombre, t.completados, t.ingresos]),
    [],
    ['Pedidos por día de la semana'],
    ['Día', 'Mañana', 'Tarde'],
    ...orden.map((f): CeldaCsv[] => [conMayuscula(DIAS_SEMANA_BACKEND[f.dia] ?? ''), f.manana, f.tarde]),
  ];
  return armarCsv(filas);
}

/** CSV de "Mis trabajos": solo cantidades, nunca importes. */
export function csvMisTrabajos(datos: MisTrabajos, granularidad: Granularidad): string {
  return armarCsv([
    ['Mis trabajos MgDetailing'],
    ['Desde', datos.rango.desde],
    ['Hasta', datos.rango.hasta],
    ['Trabajos completados', datos.completados],
    [],
    ['Por servicio'],
    ['Servicio', 'Completados'],
    ...datos.porServicio.map((s): CeldaCsv[] => [s.nombre, s.completados]),
    [],
    [granularidad === 'dia' ? 'Por día' : 'Por mes'],
    [granularidad === 'dia' ? 'Día' : 'Mes', 'Completados'],
    ...datos.serie.map((s): CeldaCsv[] => [s.clave, s.completados]),
  ]);
}

/** `estadisticas_2026-10-01_2026-10-26.csv`. */
export function nombreArchivoCsv(prefijo: 'estadisticas' | 'mis-trabajos', rango: RangoFechas): string {
  return `${prefijo}_${rango.desde}_${rango.hasta}.csv`;
}
