import { describe, expect, it } from 'vitest';
import {
  anchoDeBarra,
  diasDelRango,
  entero,
  escalaLineal,
  etiquetaDeClave,
  etiquetaDeEje,
  indiceEnX,
  momentoMasMovido,
  nivelDeCalor,
  partesPorEstado,
  pesos,
  pesosCorto,
  porcentaje,
  resolverGranularidad,
  saltoDeEtiquetas,
  segmentosApilados,
  textoVariacion,
  ticksLindos,
  variacion,
} from './estadisticas';

const plano = (texto: string) => texto.split(String.fromCharCode(160)).join(String.fromCharCode(32));

describe('formato es-AR', () => {
  it('pesos con punto de miles, también de cuatro cifras', () => {
    expect(plano(pesos(60000))).toBe('$ 60.000');
    expect(plano(pesos(5000))).toBe('$ 5.000');
    expect(plano(pesos(0))).toBe('$ 0');
    expect(entero(1240)).toBe('1.240');
  });

  it('pesos abreviados para los ejes', () => {
    expect(plano(pesosCorto(850))).toBe('$ 850');
    expect(plano(pesosCorto(12000))).toBe('$ 12 mil');
    expect(plano(pesosCorto(1500))).toBe('$ 1,5 mil');
    expect(plano(pesosCorto(1_240_000))).toBe('$ 1,2 M');
    expect(plano(pesosCorto(999_960))).toBe('$ 1 M');
    expect(plano(pesosCorto(0))).toBe('$ 0');
  });

  it('porcentaje con coma', () => {
    expect(plano(porcentaje(0.1))).toBe('10 %');
    expect(plano(porcentaje(0.125))).toBe('12,5 %');
  });
});

describe('variación', () => {
  it('sin base cuando antes no hubo nada', () => {
    expect(variacion(10, 0)).toEqual({ tipo: 'sin-base' });
    expect(textoVariacion(variacion(0, 0), 'ayer')).toBe('—');
  });

  it('sube, baja e igual', () => {
    expect(variacion(150, 100)).toEqual({ tipo: 'sube', pct: 50 });
    expect(variacion(50, 100)).toEqual({ tipo: 'baja', pct: 50 });
    expect(variacion(100, 100)).toEqual({ tipo: 'igual' });
    expect(variacion(1001, 1000)).toEqual({ tipo: 'igual' });
    expect(variacion(0, 100)).toEqual({ tipo: 'baja', pct: 100 });
  });

  it('textos en voseo llano', () => {
    expect(plano(textoVariacion({ tipo: 'sube', pct: 25 }, 'ayer'))).toBe('25 % más que ayer');
    expect(plano(textoVariacion({ tipo: 'baja', pct: 8 }, 'el mes pasado'))).toBe('8 % menos que el mes pasado');
    expect(textoVariacion({ tipo: 'igual' }, 'el año pasado')).toBe('Igual que el año pasado');
    expect(plano(textoVariacion({ tipo: 'sube', pct: 5000 }, 'ayer'))).toBe('Más de 999 % más que ayer');
  });
});

describe('ticks y escalas', () => {
  it('ticks lindos desde 0 que cubren el máximo', () => {
    expect(ticksLindos(95000).ticks).toEqual([0, 25000, 50000, 75000, 100000]);
    expect(ticksLindos(95000).techo).toBe(100000);
    expect(ticksLindos(1_240_000).techo).toBeGreaterThanOrEqual(1_240_000);
    expect(ticksLindos(7).ticks.at(-1)).toBeGreaterThanOrEqual(7);
  });

  it('sin datos el eje no queda vacío', () => {
    expect(ticksLindos(0)).toEqual({ techo: 1, paso: 1, ticks: [0, 1] });
  });

  it('solo enteros no inventa medios trabajos', () => {
    expect(ticksLindos(1, 4, true).ticks).toEqual([0, 1]);
    expect(ticksLindos(3, 4, true).ticks.every(Number.isInteger)).toBe(true);
  });

  it('escala lineal, también invertida', () => {
    const y = escalaLineal([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(100)).toBe(0);
    expect(y(50)).toBe(100);
    expect(escalaLineal([5, 5], [10, 20])(5)).toBe(10);
  });

  it('etiquetas que entran, posición de toque y ancho de barra', () => {
    expect(saltoDeEtiquetas(31, 300, 44)).toBe(5);
    expect(saltoDeEtiquetas(4, 300, 44)).toBe(1);
    expect(indiceEnX(-10, 50, 300, 30)).toBe(0);
    expect(indiceEnX(999, 50, 300, 30)).toBe(29);
    expect(indiceEnX(200, 50, 300, 30)).toBe(15);
    expect(anchoDeBarra(100)).toBe(24);
    expect(anchoDeBarra(10)).toBeCloseTo(6.2);
  });
});

describe('eje de tiempo', () => {
  it('etiquetas largas y cortas', () => {
    expect(etiquetaDeClave('2026-10-22')).toBe('jueves 22 de octubre');
    expect(etiquetaDeClave('2026-10')).toBe('octubre 2026');
    expect(etiquetaDeEje('2026-10-01', 0)).toBe('1 oct');
    expect(etiquetaDeEje('2026-10-22', 5)).toBe('22');
    expect(etiquetaDeEje('2026-11-01', 5)).toBe('1 nov');
    expect(etiquetaDeEje('2026-05', 4)).toBe('may');
    expect(etiquetaDeEje('2027-01', 7)).toBe('ene 27');
  });

  it('días del rango y granularidad (hasta 62 por día)', () => {
    expect(diasDelRango('2026-10-01', '2026-10-01')).toBe(1);
    expect(diasDelRango('2028-02-01', '2028-03-01')).toBe(30);
    expect(diasDelRango('2026-02-30', '2026-03-01')).toBeNaN();
    expect(resolverGranularidad('2026-10-01', '2026-12-01')).toBe('dia');
    expect(resolverGranularidad('2026-10-01', '2026-12-02')).toBe('mes');
    expect(resolverGranularidad('2026-01-01', '2026-10-26')).toBe('mes');
  });
});

describe('estados de los turnos', () => {
  const periodo = { pendientes: 4, confirmados: 6, completados: 24, cancelados: 4 };

  it('cantidad y proporción de cada estado', () => {
    const partes = partesPorEstado(periodo);
    expect(partes.map((p) => p.estado)).toEqual(['pendiente', 'confirmado', 'completado', 'cancelado']);
    expect(partes[2]?.proporcion).toBeCloseTo(24 / 38);
  });

  it('sin turnos todo es 0 y no divide por cero', () => {
    const partes = partesPorEstado({ pendientes: 0, confirmados: 0, completados: 0, cancelados: 0 });
    expect(partes.every((p) => p.proporcion === 0)).toBe(true);
  });

  it('segmentos con hueco de 2 px, sin los vacíos, que suman el ancho', () => {
    const segs = segmentosApilados(partesPorEstado({ pendientes: 1, confirmados: 0, completados: 3, cancelados: 0 }), 202, 2);
    expect(segs.map((s) => s.estado)).toEqual(['pendiente', 'completado']);
    expect(segs[0]).toEqual({ estado: 'pendiente', x: 0, ancho: 50 });
    expect(segs[1]).toEqual({ estado: 'completado', x: 52, ancho: 150 });
  });
});

describe('mapa de calor', () => {
  it('niveles de 0 a 4', () => {
    expect(nivelDeCalor(0, 10)).toBe(0);
    expect(nivelDeCalor(2, 10)).toBe(1);
    expect(nivelDeCalor(5, 10)).toBe(2);
    expect(nivelDeCalor(7, 10)).toBe(3);
    expect(nivelDeCalor(10, 10)).toBe(4);
    expect(nivelDeCalor(3, 0)).toBe(0);
  });

  it('el momento más movido, o ninguno', () => {
    const filas = [
      { dia: 1, manana: 2, tarde: 5 },
      { dia: 4, manana: 5, tarde: 1 },
    ];
    expect(momentoMasMovido(filas)).toEqual({ dia: 1, franja: 'tarde', valor: 5 });
    expect(momentoMasMovido([{ dia: 1, manana: 0, tarde: 0 }])).toBeNull();
  });
});
