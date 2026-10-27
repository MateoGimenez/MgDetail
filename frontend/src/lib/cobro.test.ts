import { describe, expect, it } from 'vitest';
import {
  MENSAJE_MONTO_ENTERO,
  MENSAJE_MONTO_NUMERO,
  MENSAJE_MONTO_TOPE,
  contarSinCobro,
  faltaCobro,
  formatoPesos,
  leerMonto,
  lineaDeCobro,
  montoParaCampo,
  textoSinCobro,
} from './cobro';

const lucas = { id: 'u1', nombre: 'Lucas' };

describe('formatoPesos', () => {
  it('pone puntos de miles', () => {
    expect(formatoPesos(0)).toBe('$ 0');
    expect(formatoPesos(950)).toBe('$ 950');
    expect(formatoPesos(60000)).toBe('$ 60.000');
    expect(formatoPesos(1234567)).toBe('$ 1.234.567');
  });
});

describe('leerMonto', () => {
  it('acepta números pelados, con signo de pesos y con separador de miles', () => {
    expect(leerMonto('25000')).toEqual({ valor: 25000 });
    expect(leerMonto('$ 25.000')).toEqual({ valor: 25000 });
    expect(leerMonto('$25.000')).toEqual({ valor: 25000 });
    expect(leerMonto(' 25 000 ')).toEqual({ valor: 25000 });
    expect(leerMonto('1.250.000')).toEqual({ valor: 1250000 });
    expect(leerMonto('0')).toEqual({ valor: 0 });
  });

  it('vacío es válido: el monto es opcional', () => {
    expect(leerMonto('')).toEqual({ valor: null });
    expect(leerMonto('   ')).toEqual({ valor: null });
    expect(leerMonto('$ ')).toEqual({ valor: null });
  });

  it('rechaza centavos con un mensaje que dice qué hacer', () => {
    expect(leerMonto('25,50')).toEqual({ error: MENSAJE_MONTO_ENTERO });
    expect(leerMonto('25.5')).toEqual({ error: MENSAJE_MONTO_ENTERO });
    expect(leerMonto('25.000,50')).toEqual({ error: MENSAJE_MONTO_ENTERO });
  });

  it('rechaza letras, signos y miles mal puestos', () => {
    for (const texto of ['abc', '-500', '25k', '1.2.3', '12.34.567', '1e5', '$$5']) {
      expect(leerMonto(texto), texto).toEqual({ error: MENSAJE_MONTO_NUMERO });
    }
  });

  it('rechaza más del tope', () => {
    expect(leerMonto('99999999')).toEqual({ valor: 99_999_999 });
    expect(leerMonto('100000000')).toEqual({ error: MENSAJE_MONTO_TOPE });
    expect(leerMonto('99999999999999999999')).toEqual({ error: MENSAJE_MONTO_TOPE });
  });

  it('montoParaCampo devuelve el número sin formato para editarlo', () => {
    expect(montoParaCampo(60000)).toBe('60000');
    expect(montoParaCampo(null)).toBe('');
    expect(leerMonto(montoParaCampo(60000))).toEqual({ valor: 60000 });
  });
});

describe('cobro faltante', () => {
  it('falta cobro solo en un completado sin monto (0 pesos es un cobro cargado)', () => {
    expect(faltaCobro({ estado: 'completado', monto: null })).toBe(true);
    expect(faltaCobro({ estado: 'completado', monto: 0 })).toBe(false);
    expect(faltaCobro({ estado: 'completado', monto: 500 })).toBe(false);
    expect(faltaCobro({ estado: 'confirmado', monto: null })).toBe(false);
  });

  it('cuenta los completados sin monto', () => {
    expect(
      contarSinCobro([
        { estado: 'completado', monto: null },
        { estado: 'completado', monto: 10 },
        { estado: 'pendiente', monto: null },
        { estado: 'completado', monto: null },
      ]),
    ).toBe(2);
    expect(contarSinCobro([])).toBe(0);
  });

  it('el aviso va en singular, plural y aproximado', () => {
    expect(textoSinCobro(1)).toBe('1 trabajo completado sin cobro cargado');
    expect(textoSinCobro(4)).toBe('4 trabajos completados sin cobro cargado');
    expect(textoSinCobro(500, true)).toBe('Al menos 500 trabajos completados sin cobro cargado');
  });
});

describe('lineaDeCobro', () => {
  it('muestra cobro y trabajador para quien ve importes', () => {
    expect(lineaDeCobro({ estado: 'completado', monto: 60000, trabajador: lucas }, true)).toBe('Cobrado $ 60.000 · Lucas');
    expect(lineaDeCobro({ estado: 'completado', monto: null, trabajador: lucas }, true)).toBe('Sin cobro cargado · Lucas');
    expect(lineaDeCobro({ estado: 'completado', monto: 500, trabajador: null }, true)).toBe('Cobrado $ 500 · Sin asignar');
  });

  it('al empleado solo le dice quién lo hizo, nunca importes', () => {
    expect(lineaDeCobro({ estado: 'completado', monto: null, trabajador: lucas }, false)).toBe('Lo hizo Lucas');
    expect(lineaDeCobro({ estado: 'completado', monto: null, trabajador: null }, false)).toBeNull();
  });

  it('un turno que no está completado no tiene línea', () => {
    expect(lineaDeCobro({ estado: 'confirmado', monto: null, trabajador: null }, true)).toBeNull();
  });
});
