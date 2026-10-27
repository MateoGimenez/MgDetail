import { describe, expect, it } from 'vitest';
import { DIAS_MAXIMOS_RANGO, PRESETS, rangoPreestablecido, textoDelRango, ultimoDiaDelMes, validarRango } from './rangosEstadisticas';

describe('rangos preestablecidos (hoy = 2026-10-26)', () => {
  const r = (p: (typeof PRESETS)[number], hoy = '2026-10-26') => rangoPreestablecido(p, hoy);

  it('los de siempre', () => {
    expect(r('hoy')).toEqual({ desde: '2026-10-26', hasta: '2026-10-26' });
    expect(r('7dias')).toEqual({ desde: '2026-10-20', hasta: '2026-10-26' });
    expect(r('30dias')).toEqual({ desde: '2026-09-27', hasta: '2026-10-26' });
    expect(r('mes')).toEqual({ desde: '2026-10-01', hasta: '2026-10-26' });
    expect(r('mesPasado')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(r('anio')).toEqual({ desde: '2026-01-01', hasta: '2026-10-26' });
    expect(r('personalizado')).toBeNull();
  });

  it('bordes de mes y de año, y bisiestos', () => {
    expect(r('mesPasado', '2026-01-15')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    expect(r('mesPasado', '2028-03-10')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(r('mesPasado', '2026-03-01')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(r('7dias', '2026-01-03')).toEqual({ desde: '2025-12-28', hasta: '2026-01-03' });
    expect(r('mes', '2026-10-01')).toEqual({ desde: '2026-10-01', hasta: '2026-10-01' });
    expect(ultimoDiaDelMes('2027-12-05')).toBe('2027-12-31');
  });
});

describe('validar un rango a mano', () => {
  it('acepta uno bueno y hasta 366 días', () => {
    expect(validarRango('2026-10-01', '2026-10-26')).toEqual({});
    expect(validarRango('2025-10-27', '2026-10-26')).toEqual({});
    expect(DIAS_MAXIMOS_RANGO).toBe(366);
  });

  it('rechaza fechas que faltan, invertidas o de más de 366 días', () => {
    expect(validarRango('', '2026-10-26').desde).toBeDefined();
    expect(validarRango('2026-10-01', '').hasta).toBeDefined();
    expect(validarRango('2026-02-30', '2026-03-01').desde).toBeDefined();
    expect(validarRango('2026-10-26', '2026-10-01').hasta).toContain('antes');
    expect(validarRango('2025-10-25', '2026-10-26').hasta).toContain('366');
  });
});

describe('rango en palabras', () => {
  it('sin repetir lo que comparten las puntas', () => {
    const hoy = '2026-10-26';
    expect(textoDelRango({ desde: '2026-10-26', hasta: '2026-10-26' }, hoy)).toBe('26 de octubre');
    expect(textoDelRango({ desde: '2026-10-01', hasta: '2026-10-26' }, hoy)).toBe('1 al 26 de octubre');
    expect(textoDelRango({ desde: '2026-09-27', hasta: '2026-10-26' }, hoy)).toBe('27 de septiembre al 26 de octubre');
    expect(textoDelRango({ desde: '2025-12-28', hasta: '2026-01-03' }, hoy)).toBe('28 de diciembre de 2025 al 3 de enero de 2026');
    expect(textoDelRango({ desde: '2025-12-01', hasta: '2025-12-31' }, hoy)).toBe('1 al 31 de diciembre de 2025');
  });
});
