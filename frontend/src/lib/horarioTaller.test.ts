import { describe, expect, it } from 'vitest';
import type { HorariosSemana } from '../types';
import { estadoDeApertura, horaLegible, minutosDeHora, momentoDeLaSemana } from './horarioTaller';

const CORRIDO = [
  { desde: '08:00', hasta: '13:00' },
  { desde: '18:00', hasta: '22:00' },
];
const SEMANA: HorariosSemana = {
  0: [],
  1: CORRIDO,
  2: CORRIDO,
  3: CORRIDO,
  4: CORRIDO,
  5: CORRIDO,
  6: [{ desde: '09:00', hasta: '21:00' }],
};

/** Hora de La Rioja (UTC−3) → instante. 2026-10-26 es lunes; 27 martes; 30 viernes; 31 sábado; 1/11 domingo. */
const rioja = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);

describe('momentoDeLaSemana', () => {
  it('usa la hora de La Rioja, no la del dispositivo', () => {
    // 02:00 UTC del martes = 23:00 del lunes en La Rioja
    expect(momentoDeLaSemana(new Date('2026-10-27T02:00:00Z'))).toEqual({ dia: 1, minutos: 23 * 60 });
    expect(momentoDeLaSemana(rioja('2026-11-01', '00:00'))).toEqual({ dia: 0, minutos: 0 });
  });
});

describe('estadoDeApertura', () => {
  it('abierto a la mañana, con la hora de cierre del tramo', () => {
    expect(estadoDeApertura(rioja('2026-10-26', '10:30'), SEMANA)).toEqual({
      abierto: true,
      titulo: 'Abierto ahora',
      detalle: 'hasta las 13 h',
    });
  });

  it('abre justo a la hora y cierra justo a la hora (el cierre ya es cerrado)', () => {
    expect(estadoDeApertura(rioja('2026-10-26', '08:00'), SEMANA)?.abierto).toBe(true);
    expect(estadoDeApertura(rioja('2026-10-26', '12:59'), SEMANA)?.abierto).toBe(true);
    expect(estadoDeApertura(rioja('2026-10-26', '13:00'), SEMANA)?.abierto).toBe(false);
  });

  it('en el corte del mediodía, cerrado y abre hoy a la tarde', () => {
    expect(estadoDeApertura(rioja('2026-10-27', '15:00'), SEMANA)).toEqual({
      abierto: false,
      titulo: 'Cerrado ahora',
      detalle: 'abrimos hoy a las 18 h',
    });
  });

  it('abierto a la tarde hasta las 22 h', () => {
    expect(estadoDeApertura(rioja('2026-10-27', '21:59'), SEMANA)?.detalle).toBe('hasta las 22 h');
  });

  it('de noche, abre mañana temprano; de madrugada, abre hoy', () => {
    expect(estadoDeApertura(rioja('2026-10-27', '23:00'), SEMANA)?.detalle).toBe('abrimos mañana a las 8 h');
    expect(estadoDeApertura(rioja('2026-10-27', '06:00'), SEMANA)?.detalle).toBe('abrimos hoy a las 8 h');
  });

  it('el viernes a la noche abre el sábado; el sábado a la noche abre el lunes (domingo cerrado)', () => {
    expect(estadoDeApertura(rioja('2026-10-30', '22:30'), SEMANA)?.detalle).toBe('abrimos mañana a las 9 h');
    expect(estadoDeApertura(rioja('2026-10-31', '21:00'), SEMANA)?.detalle).toBe('abrimos el lunes a las 8 h');
  });

  it('el domingo está cerrado y abre el lunes', () => {
    expect(estadoDeApertura(rioja('2026-11-01', '12:00'), SEMANA)).toEqual({
      abierto: false,
      titulo: 'Cerrado ahora',
      detalle: 'abrimos mañana a las 8 h',
    });
  });

  it('el sábado corre de 9 a 21', () => {
    expect(estadoDeApertura(rioja('2026-10-31', '20:59'), SEMANA)?.abierto).toBe(true);
    expect(estadoDeApertura(rioja('2026-10-31', '08:59'), SEMANA)?.abierto).toBe(false);
  });

  it('manda La Rioja: 15:00 UTC es mediodía allá', () => {
    expect(estadoDeApertura(new Date('2026-10-26T15:00:00Z'), SEMANA)?.abierto).toBe(true);
  });

  it('sin ningún tramo en la semana no afirma nada', () => {
    const vacia: HorariosSemana = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    expect(estadoDeApertura(rioja('2026-10-26', '10:00'), vacia)).toBeNull();
  });

  it('ignora tramos mal escritos', () => {
    const rota: HorariosSemana = {
      ...SEMANA,
      1: [
        { desde: '13:00', hasta: '08:00' },
        { desde: 'x', hasta: 'y' },
      ],
    };
    expect(estadoDeApertura(rioja('2026-10-26', '10:00'), rota)).toEqual({
      abierto: false,
      titulo: 'Cerrado ahora',
      detalle: 'abrimos mañana a las 8 h',
    });
  });
});

describe('formato de horas', () => {
  it('minutosDeHora y horaLegible', () => {
    expect(minutosDeHora('08:00')).toBe(480);
    expect(minutosDeHora('8:5')).toBeNaN();
    expect(horaLegible('18:00')).toBe('18 h');
    expect(horaLegible('18:30')).toBe('18:30 h');
    expect(horaLegible('09:05')).toBe('9:05 h');
  });
});
