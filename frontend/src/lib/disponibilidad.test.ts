import { describe, expect, it } from 'vitest';
import type { CupoDia, DiaDisponible } from '../api/contract';
import { seguimientoPublicoUrl } from '../config/enlaces';
import { conciliarEleccion, type Valores } from '../landing/useFormularioTurno';
import { mensajeParaCliente } from './agenda';
import {
  avisoDeLugar,
  diaDelHorario,
  feriadoPrecargado,
  horarioOrdenado,
  leerCupo,
  leerMotivo,
  lugaresDeFranja,
  resumenDeCupos,
  textoLugares,
  textoLugaresLargo,
} from './cupos';
import { estadoDelDia, franjaLibre, mesesDelCalendario } from './disponibilidad';
import { sumarDias } from './fechas';
import { pasosDelTurno } from './seguimiento';

const dia = (fecha: string, abierto: boolean, manana: boolean, tarde: boolean): DiaDisponible => ({ fecha, abierto, manana, tarde });

describe('calendario del formulario', () => {
  it('estado de cada día: libre, lleno (abierto sin lugar) o cerrado (también si no vino)', () => {
    expect(estadoDelDia(dia('2026-10-24', true, false, true))).toBe('libre');
    expect(estadoDelDia(dia('2026-10-24', true, false, false))).toBe('lleno');
    expect(estadoDelDia(dia('2026-10-25', false, false, false))).toBe('cerrado');
    expect(estadoDelDia(undefined)).toBe('cerrado');
    expect(franjaLibre(dia('2026-10-24', true, false, true), 'manana')).toBe(false);
    expect(franjaLibre(undefined, 'tarde')).toBe(false);
  });

  it('arma los meses alineados al lunes, con celdas vacías antes y después', () => {
    // 2026-10-24 es sábado: 5 celdas vacías antes (lun–vie).
    const fechas = Array.from({ length: 61 }, (_, i) => sumarDias('2026-10-24', i));
    const meses = mesesDelCalendario(fechas);
    expect(meses.map((m) => m.clave)).toEqual(['2026-10', '2026-11', '2026-12']);
    const octubre = meses[0];
    expect(octubre?.semanas[0]).toEqual([null, null, null, null, null, '2026-10-24', '2026-10-25']);
    expect(octubre?.semanas.at(-1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null]);
    // 2026-11-01 es domingo.
    expect(meses[1]?.semanas[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(meses.every((m) => m.semanas.every((s) => s.length === 7))).toBe(true);
    // Diciembre llega hasta el 23 (hoy + 60).
    expect(meses[2]?.semanas.flat().filter(Boolean).at(-1)).toBe('2026-12-23');
  });

  it('ignora fechas inválidas o repetidas y respeta huecos', () => {
    const meses = mesesDelCalendario(['2026-10-28', '2026-10-26', '2026-10-26', '2026-02-30', '2026-10-30']);
    expect(meses).toHaveLength(1);
    expect(meses[0]?.semanas).toEqual([['2026-10-26', null, '2026-10-28', null, '2026-10-30', null, null]]);
  });
});

describe('conciliar lo elegido con la disponibilidad recargada', () => {
  const base: Valores = {
    nombre: '',
    telefono: '',
    email: '',
    vehiculoTipo: 'auto',
    vehiculoModelo: '',
    servicioId: 'pulido',
    fechaPreferida: '2026-10-28',
    franja: 'manana',
    comentario: '',
    website: '',
  };

  it('si sigue habiendo lugar, no toca nada', () => {
    const dias = new Map([['2026-10-28', dia('2026-10-28', true, true, false)]]);
    expect(conciliarEleccion(base, dias, {})).toBeNull();
  });

  it('franja llena: la borra y pide otra', () => {
    const dias = new Map([['2026-10-28', dia('2026-10-28', true, false, true)]]);
    expect(conciliarEleccion(base, dias, {})).toEqual({
      valores: { ...base, franja: '' },
      errores: { franja: 'Esa franja se llenó. Elegí otra.' },
    });
  });

  it('día sin lugar o cerrado: borra día y franja y pide otro día', () => {
    const lleno = new Map([['2026-10-28', dia('2026-10-28', true, false, false)]]);
    expect(conciliarEleccion(base, lleno, { franja: 'Esa franja se llenó. Elegí otra.' })).toEqual({
      valores: { ...base, fechaPreferida: '', franja: '' },
      errores: { fechaPreferida: 'Ese día ya no tiene lugar. Elegí otro.' },
    });
    const cerrado = new Map([['2026-10-28', dia('2026-10-28', false, false, false)]]);
    expect(conciliarEleccion(base, cerrado, {})?.errores.fechaPreferida).toBe('Ese día no tomamos turnos. Elegí otro.');
  });
});

describe('cupos de la agenda y avisos del panel', () => {
  const cupo: CupoDia = { fecha: '2026-10-26', abierto: true, cupoManana: 2, cupoTarde: 0, ocupadosManana: 2, ocupadosTarde: 0 };

  it('"ocupados/cupo", completa y cerrada', () => {
    const manana = lugaresDeFranja(cupo, 'manana', 2);
    expect([textoLugares(manana), manana.llena, manana.cerrada]).toEqual(['2/2', true, false]);
    expect(textoLugaresLargo(manana)).toBe('2 de 2 lugares ocupados, completa');
    const tarde = lugaresDeFranja(cupo, 'tarde', 0);
    expect([textoLugares(tarde), tarde.cerrada]).toEqual(['Cerrada', true]);
    expect(textoLugares(lugaresDeFranja({ ...cupo, abierto: false }, 'manana', 1))).toBe('Cerrada');
    expect(textoLugares(lugaresDeFranja(cupo, 'manana', 1))).toBe('1/2');
  });

  it('avisa (no bloquea) al agendar en una franja llena o cerrada', () => {
    expect(avisoDeLugar(cupo, 'manana', false)).toBe('Esa franja ya tiene 2 de 2. Podés agendarlo igual.');
    expect(avisoDeLugar(cupo, 'tarde', false)).toBe('Ese día la tarde figura cerrada (cupo 0). Podés agendarlo igual.');
    expect(avisoDeLugar({ ...cupo, abierto: false }, 'manana', false)).toBe('Ese día el taller figura cerrado. Podés agendarlo igual.');
  });

  it('un turno que ya ocupa ese lugar no se cuenta dos veces; sin datos no hay aviso', () => {
    expect(avisoDeLugar(cupo, 'manana', true)).toBeNull();
    expect(avisoDeLugar({ ...cupo, ocupadosManana: 3 }, 'manana', true)).toBe('Esa franja ya tiene 2 de 2. Podés agendarlo igual.');
    expect(avisoDeLugar(null, 'manana', false)).toBeNull();
  });
});

describe('horario semanal y días especiales', () => {
  it('día del horario (0 = domingo) y orden de lunes a domingo', () => {
    expect(diaDelHorario('2026-10-25')).toBe(0); // domingo
    expect(diaDelHorario('2026-10-26')).toBe(1); // lunes
    expect(diaDelHorario('2026-10-31')).toBe(6); // sábado
    const horario = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia: d, abierto: true, cupoManana: 1, cupoTarde: 1 }));
    expect(horarioOrdenado(horario).map((h) => h.dia)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('resumen de cupos', () => {
    expect(resumenDeCupos(false, null, null)).toBe('Cerrado');
    expect(resumenDeCupos(true, 0, 0)).toBe('Cerrado');
    expect(resumenDeCupos(true, 2, 0)).toBe('Solo mañana: 2');
    expect(resumenDeCupos(true, 0, 3)).toBe('Solo tarde: 3');
    expect(resumenDeCupos(true, 2, 1)).toBe('Mañana 2 · Tarde 1');
  });

  it('cupos de 0 a 20 y motivo de hasta 80', () => {
    expect(leerCupo(' 3 ')).toEqual({ valor: 3 });
    expect(leerCupo('0')).toEqual({ valor: 0 });
    expect(leerCupo('21')).toEqual({ error: 'Hasta 20 turnos por franja.' });
    expect('error' in leerCupo('')).toBe(true);
    expect('error' in leerCupo('2.5')).toBe(true);
    expect('error' in leerCupo('-1')).toBe(true);
    expect(leerMotivo('  ')).toEqual({ valor: null });
    expect(leerMotivo(' Vacaciones ')).toEqual({ valor: 'Vacaciones' });
    expect('error' in leerMotivo('x'.repeat(81))).toBe(true);
  });

  it('los feriados precargados se reconocen por el motivo que manda el backend ("Feriado: …")', () => {
    expect(feriadoPrecargado('Feriado: Navidad')).toEqual({ nombre: 'Navidad', trasladable: false });
    expect(feriadoPrecargado('Feriado: Día de la Soberanía Nacional (trasladable, a confirmar)')).toEqual({
      nombre: 'Día de la Soberanía Nacional (trasladable, a confirmar)',
      trasladable: true,
    });
    // Cualquier fecha: no hay lista fija (un feriado de 2028 sembrado más adelante también se marca).
    expect(feriadoPrecargado('Feriado: Año Nuevo')?.nombre).toBe('Año Nuevo');
    expect(feriadoPrecargado('Vacaciones')).toBeNull();
    expect(feriadoPrecargado('feriado: en minúscula no es el formato del backend')).toBeNull();
    expect(feriadoPrecargado('Día feriado puente')).toBeNull();
    expect(feriadoPrecargado(null)).toBeNull();
  });
});

describe('seguimiento', () => {
  it('línea de tiempo según el estado', () => {
    const marcar = (estado: Parameters<typeof pasosDelTurno>[0]) =>
      pasosDelTurno(estado).map((p) => `${p.texto}${p.actual ? '*' : p.alcanzado ? '+' : ''}`);
    expect(marcar('pendiente')).toEqual(['Recibido*', 'Confirmado', 'Listo']);
    expect(marcar('confirmado')).toEqual(['Recibido+', 'Confirmado*', 'Listo']);
    expect(marcar('completado')).toEqual(['Recibido+', 'Confirmado+', 'Listo*']);
    expect(marcar('cancelado')).toEqual(['Recibido+', 'Cancelado*']);
  });

  it('enlace público solo con sitio.url; el mensaje de WhatsApp lo suma', () => {
    expect(seguimientoPublicoUrl('abc', '')).toBeNull();
    expect(seguimientoPublicoUrl('abc', 'mgdetailing.com.ar')).toBeNull();
    expect(seguimientoPublicoUrl('abc', 'https://mgdetailing.com.ar/')).toBe('https://mgdetailing.com.ar/turno/abc');

    const turno = {
      id: 'abc',
      nombre: 'Lucía Fernández',
      telefono: '380',
      telefonoWhatsapp: '549380',
      email: null,
      vehiculoTipo: 'auto' as const,
      vehiculoModelo: null,
      servicioId: 'pulido',
      fechaPreferida: '2026-10-22',
      franja: 'manana' as const,
      fechaConfirmada: null,
      franjaConfirmada: null,
      comentario: null,
      estado: 'confirmado' as const,
      createdAt: '2026-10-16T15:00:00.000Z',
      updatedAt: '2026-10-16T15:00:00.000Z',
      notasInternas: null,
      turnosDelCliente: 1,
      monto: null,
      trabajador: null,
    };
    const sinEnlace = mensajeParaCliente(turno, 'Pulido', 'MgDetailing');
    expect(sinEnlace.includes('turno/')).toBe(false);
    expect(mensajeParaCliente(turno, 'Pulido', 'MgDetailing', 'https://mgdetailing.com.ar/turno/abc')).toBe(
      `${sinEnlace} Podés ver cómo va acá: https://mgdetailing.com.ar/turno/abc`,
    );
  });
});
