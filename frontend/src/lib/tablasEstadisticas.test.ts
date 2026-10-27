import { describe, expect, it } from 'vitest';
import type { MisTrabajos } from '../api/estadisticas';
import { MUESTRA } from './muestraEstadisticas';
import {
  armarCsv,
  celdaCsv,
  csvEstadisticas,
  csvMisTrabajos,
  nombreArchivoCsv,
  tablaDiaSemana,
  tablaEstados,
  tablaIngresos,
  tablaServicios,
} from './tablasEstadisticas';

const plano = (texto: string) => texto.split(String.fromCharCode(160)).join(String.fromCharCode(32));

describe('celdas del CSV', () => {
  it('prefija con comilla simple lo que Excel tomaría por fórmula', () => {
    expect(celdaCsv('=1+1')).toBe("'=1+1");
    expect(celdaCsv('+54 380')).toBe("'+54 380");
    expect(celdaCsv('-cmd')).toBe("'-cmd");
    expect(celdaCsv('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(celdaCsv('\tx')).toBe("'\tx");
    expect(celdaCsv('Lavado')).toBe('Lavado');
  });

  it('entrecomilla ; comillas y saltos, números con coma y null vacío', () => {
    expect(celdaCsv('a;b')).toBe('"a;b"');
    expect(celdaCsv('di "hola"')).toBe('"di ""hola"""');
    expect(celdaCsv('a\nb')).toBe('"a\nb"');
    expect(celdaCsv(12.5)).toBe('12,5');
    expect(celdaCsv(-3)).toBe('-3');
    expect(celdaCsv(null)).toBe('');
    expect(celdaCsv(Number.NaN)).toBe('');
  });

  it('el archivo lleva BOM, separador ; y CRLF', () => {
    const csv = armarCsv([['a', 1], [], ['b']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿a;1\r\n\r\nb\r\n');
  });
});

describe('CSV del período', () => {
  it('trae el resumen, las series y las tablas, y neutraliza fórmulas', () => {
    const csv = csvEstadisticas(MUESTRA);
    expect(csv).toContain('Ingresos (pesos);1240000');
    expect(csv).toContain('Ticket promedio (pesos);51667');
    expect(csv).toContain('Tasa de cancelación (%);10');
    expect(csv).toContain('2026-10-02;0;0');
    expect(csv).toContain('Lavado Premium;14;10;600000');
    expect(csv).toContain('"\'=HYPERLINK(""http://x"")";1;0;0');
    expect(csv).toContain('Lunes;5;3');
    expect(csv.indexOf('Lunes;5')).toBeLessThan(csv.indexOf('Domingo;1'));
  });

  it('Mis trabajos nunca lleva importes', () => {
    const mias: MisTrabajos = {
      rango: { desde: '2026-10-01', hasta: '2026-10-03' },
      completados: 3,
      porServicio: [{ servicioId: 'lavado', nombre: 'Lavado', completados: 3 }],
      serie: [{ clave: '2026-10-01', completados: 3 }],
    };
    const csv = csvMisTrabajos(mias, 'dia');
    expect(csv).toContain('Lavado;3');
    expect(csv.toLowerCase()).not.toContain('pesos');
    expect(nombreArchivoCsv('mis-trabajos', mias.rango)).toBe('mis-trabajos_2026-10-01_2026-10-03.csv');
  });
});

describe('tablas alternativas', () => {
  it('ingresos con ceros y pesos formateados', () => {
    const t = tablaIngresos(MUESTRA.serie, 'dia');
    expect(t.filas).toHaveLength(3);
    expect(plano(t.filas[0]?.[2] ?? '')).toBe('$ 80.000');
    expect(t.filas[1]?.[0]).toBe('Viernes 2 de octubre');
    expect(plano(t.filas[1]?.[2] ?? '')).toBe('$ 0');
    expect(t.columnas).toHaveLength(t.numericas.length);
  });

  it('servicios sin importes para quien no los ve', () => {
    expect(tablaServicios(MUESTRA.porServicio, false).columnas).toEqual(['Servicio', 'Completados']);
    expect(tablaServicios(MUESTRA.porServicio, true).columnas).toHaveLength(4);
  });

  it('día de la semana en orden de lunes y rellena los que faltan', () => {
    const t = tablaDiaSemana(MUESTRA.porDiaSemana);
    expect(t.filas.map((f) => f[0])).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
    expect(t.filas[0]).toEqual(['Lunes', '5', '3', '8']);
    expect(t.filas[6]).toEqual(['Domingo', '1', '0', '1']);
  });

  it('estados con su parte del total', () => {
    const t = tablaEstados(MUESTRA.periodo);
    expect(t.filas.map((f) => f[0])).toEqual(['Pendientes', 'Confirmados', 'Completados', 'Cancelados']);
    expect(plano(t.filas[2]?.[2] ?? '')).toBe('63,2 %');
  });
});
