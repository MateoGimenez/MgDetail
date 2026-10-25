import { describe, expect, it } from 'vitest';
import type { CupoDia } from '../api/contract';
import type { DiaEspecial, HorarioDia } from '../api/contract-panel';
import {
  DIAS_DE_LA_GRILLA,
  SELECCION_VACIA,
  accionDelBorrador,
  accionMasiva,
  avisoDeTurnos,
  borradorDe,
  cambioDelBorrador,
  diasDeLaGrilla,
  estadoDelDia,
  fechaConTecla,
  moverMes,
  nombreDelDia,
  nombreDelMes,
  proximosCambios,
  rangoDeFechas,
  tocarDia,
  type FuentesDelDia,
} from './calendarioPanel';
import { diaDeLaSemana } from './fechas';

/** Lunes a sábado con 2 y 2; domingo cerrado (el horario de fábrica). */
const HORARIO: HorarioDia[] = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  abierto: dia !== 0,
  cupoManana: dia === 0 ? 0 : 2,
  cupoTarde: dia === 0 ? 0 : 2,
}));

const HOY = '2026-10-25'; // domingo

const cupo = (fecha: string, m: number, t: number, extra: Partial<CupoDia> = {}): CupoDia => ({
  fecha,
  abierto: true,
  cupoManana: 2,
  cupoTarde: 2,
  ocupadosManana: m,
  ocupadosTarde: t,
  ...extra,
});

function fuentes(especiales: DiaEspecial[] = [], cupos: CupoDia[] = [], horario = HORARIO): FuentesDelDia {
  return {
    hoy: HOY,
    horario,
    especiales: new Map(especiales.map((e) => [e.fecha, e])),
    cupos: new Map(cupos.map((c) => [c.fecha, c])),
  };
}

describe('meses de la grilla', () => {
  it('arma 42 días seguidos que arrancan en lunes, aunque sean del mes anterior', () => {
    const octubre = diasDeLaGrilla('2026-10'); // el 1 es jueves
    expect(octubre).toHaveLength(DIAS_DE_LA_GRILLA);
    expect(octubre[0]).toBe('2026-09-28');
    expect(diaDeLaSemana(octubre[0] ?? '')).toBe(0);
    expect(octubre[3]).toBe('2026-10-01');
    expect(octubre.at(-1)).toBe('2026-11-08');
    // Un mes que empieza en lunes no lleva días del anterior.
    expect(diasDeLaGrilla('2027-02')[0]).toBe('2027-02-01');
  });

  it('se mueve de mes cruzando el año y nombra el mes', () => {
    expect(moverMes('2026-12', 1)).toBe('2027-01');
    expect(moverMes('2027-01', -1)).toBe('2026-12');
    expect(moverMes('2026-10', 14)).toBe('2027-12');
    expect(nombreDelMes('2026-10')).toBe('Octubre 2026');
  });

  it('teclado: flechas, Inicio/Fin de la semana y Re Pág/Av Pág de mes (con el último día si no existe)', () => {
    expect(fechaConTecla('2026-10-31', 'ArrowRight')).toBe('2026-11-01');
    expect(fechaConTecla('2026-10-01', 'ArrowUp')).toBe('2026-09-24');
    expect(fechaConTecla('2026-10-29', 'Home')).toBe('2026-10-26');
    expect(fechaConTecla('2026-10-29', 'End')).toBe('2026-11-01');
    expect(fechaConTecla('2027-01-31', 'PageDown')).toBe('2027-02-28');
    expect(fechaConTecla('2026-03-31', 'PageUp')).toBe('2026-02-28');
    expect(fechaConTecla('2026-10-29', 'Enter')).toBeNull();
  });
});

describe('estado de cada día', () => {
  it('sin día especial manda el horario semanal; de la agenda salen los ocupados', () => {
    const martes = estadoDelDia('2026-10-27', fuentes([], [cupo('2026-10-27', 2, 0)]));
    expect(martes).toMatchObject({ abierto: true, pasado: false, especial: null, aMano: false });
    expect(martes.manana).toEqual({ cupo: 2, ocupados: 2 });
    expect(martes.tarde).toEqual({ cupo: 2, ocupados: 0 });
    expect(nombreDelDia(martes)).toBe(
      'martes 27 de octubre, abierto, mañana 2 de 2 ocupados, completa, tarde 0 de 2 ocupados',
    );
    const domingo = estadoDelDia(HOY, fuentes());
    expect(domingo.abierto).toBe(false);
    expect(domingo.hoy).toBe(true);
    expect(nombreDelDia(domingo)).toBe('domingo 25 de octubre, hoy, cerrado');
  });

  it('el día especial gana sobre el semanal, aunque la agenda diga otra cosa', () => {
    const vacaciones: DiaEspecial = { fecha: '2026-10-28', abierto: false, cupoManana: null, cupoTarde: null, motivo: 'Vacaciones' };
    const e = estadoDelDia('2026-10-28', fuentes([vacaciones], [cupo('2026-10-28', 1, 0)]));
    expect(e).toMatchObject({ abierto: false, aMano: true, feriado: null });
    expect(nombreDelDia(e)).toBe('miércoles 28 de octubre, cerrado, con 1 turno, motivo: Vacaciones, cambiado a mano');
    const domingoAbierto: DiaEspecial = { fecha: '2026-11-01', abierto: true, cupoManana: 3, cupoTarde: 0, motivo: null };
    const d = estadoDelDia('2026-11-01', fuentes([domingoAbierto]));
    expect(d).toMatchObject({ abierto: true, aMano: true });
    expect(nombreDelDia(d)).toBe('domingo 1 de noviembre, abierto, mañana 3 turnos, tarde sin turnos, cambiado a mano');
  });

  it('un feriado precargado cerrado no cuenta como cambio a mano; abierto, sí', () => {
    const navidad: DiaEspecial = { fecha: '2026-12-25', abierto: false, cupoManana: null, cupoTarde: null, motivo: 'Feriado: Navidad' };
    const cerrado = estadoDelDia('2026-12-25', fuentes([navidad]));
    expect(cerrado.feriado).toEqual({ nombre: 'Navidad', trasladable: false });
    expect(cerrado.aMano).toBe(false);
    expect(nombreDelDia(cerrado)).toBe('viernes 25 de diciembre, feriado: Navidad, cerrado');
    const abierto = estadoDelDia('2026-12-25', fuentes([{ ...navidad, abierto: true, cupoManana: 1, cupoTarde: 1 }]));
    expect(abierto.aMano).toBe(true);
  });

  it('un día pasado usa lo que dice la agenda; sin agenda, el semanal y sin ocupados', () => {
    const ayer = estadoDelDia('2026-10-24', fuentes([], [cupo('2026-10-24', 1, 1, { abierto: false })]));
    expect(ayer).toMatchObject({ pasado: true, abierto: false });
    expect(nombreDelDia(ayer)).toBe('sábado 24 de octubre, cerrado, con 2 turnos, ya pasó');
    const sinAgenda = estadoDelDia('2026-10-23', fuentes());
    expect(sinAgenda.abierto).toBe(true);
    expect(sinAgenda.manana.ocupados).toBeNull();
  });

  it('abierto con las dos franjas en 0 se ve cerrado', () => {
    const e = estadoDelDia('2026-10-27', fuentes([{ fecha: '2026-10-27', abierto: true, cupoManana: 0, cupoTarde: 0, motivo: null }]));
    expect(e.abierto).toBe(false);
  });
});

describe('elegir varios días', () => {
  it('rango inclusivo en orden, venga como venga', () => {
    expect(rangoDeFechas('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(rangoDeFechas('2027-01-02', '2026-12-30')).toHaveLength(4);
    expect(rangoDeFechas('2026-10-27', '2026-10-27')).toEqual(['2026-10-27']);
    expect(rangoDeFechas('x', '2026-10-27')).toEqual([]);
  });

  it('de corrido: primer toque marca la punta, el segundo completa; los pasados no entran', () => {
    const uno = tocarDia(SELECCION_VACIA, '2026-11-05', 'rango', HOY);
    expect(uno.ancla).toBe('2026-11-05');
    expect([...uno.fechas]).toEqual(['2026-11-05']);
    const dos = tocarDia(uno, '2026-11-02', 'rango', HOY);
    expect(dos.ancla).toBeNull();
    expect([...dos.fechas].sort()).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
    const tres = tocarDia(dos, '2026-11-20', 'rango', HOY);
    expect([...tres.fechas]).toEqual(['2026-11-20']);
    expect(tocarDia(SELECCION_VACIA, '2026-10-20', 'rango', HOY)).toBe(SELECCION_VACIA);
    const hastaHoy = tocarDia(tocarDia(SELECCION_VACIA, '2026-10-27', 'rango', HOY), HOY, 'rango', HOY);
    expect(hastaHoy.fechas.size).toBe(3);
  });

  it('sueltos: cada toque suma o saca', () => {
    let s = tocarDia(SELECCION_VACIA, '2026-11-02', 'sueltos', HOY);
    s = tocarDia(s, '2026-11-09', 'sueltos', HOY);
    expect(s.fechas.size).toBe(2);
    s = tocarDia(s, '2026-11-02', 'sueltos', HOY);
    expect([...s.fechas]).toEqual(['2026-11-09']);
  });

  it('cerrar varios: PUT cerrado con el motivo (o el que tenía)', () => {
    const martes = estadoDelDia('2026-10-27', fuentes());
    expect(accionMasiva('cerrar', martes, HORARIO, ' Vacaciones ')).toEqual({
      tipo: 'guardar',
      cambio: { abierto: false, motivo: 'Vacaciones' },
    });
    const navidad = estadoDelDia(
      '2026-12-25',
      fuentes([{ fecha: '2026-12-25', abierto: false, cupoManana: null, cupoTarde: null, motivo: 'Feriado: Navidad' }]),
    );
    expect(accionMasiva('cerrar', navidad, HORARIO, '')).toEqual({ tipo: 'nada' });
  });

  it('abrir varios: con los cupos del semanal; vuelve al habitual si no hace falta día especial', () => {
    const vacaciones = estadoDelDia(
      '2026-10-28',
      fuentes([{ fecha: '2026-10-28', abierto: false, cupoManana: null, cupoTarde: null, motivo: 'Vacaciones' }]),
    );
    expect(accionMasiva('abrir', vacaciones, HORARIO, '')).toEqual({ tipo: 'quitar' });
    expect(accionMasiva('abrir', estadoDelDia('2026-10-27', fuentes()), HORARIO, '')).toEqual({ tipo: 'nada' });
    expect(accionMasiva('abrir', estadoDelDia('2026-11-01', fuentes()), HORARIO, '')).toEqual({
      tipo: 'guardar',
      cambio: { abierto: true, cupoManana: 2, cupoTarde: 2, motivo: null },
    });
    const navidad = estadoDelDia(
      '2026-12-25',
      fuentes([{ fecha: '2026-12-25', abierto: false, cupoManana: null, cupoTarde: null, motivo: 'Feriado: Navidad' }]),
    );
    expect(accionMasiva('abrir', navidad, HORARIO, '')).toEqual({
      tipo: 'guardar',
      cambio: { abierto: true, cupoManana: 2, cupoTarde: 2, motivo: 'Feriado: Navidad' },
    });
  });
});

describe('detalle del día: lo que se guarda', () => {
  it('el borrador arranca de cómo está el día, y una franja apagada recuerda un cupo', () => {
    const martes = estadoDelDia('2026-10-27', fuentes());
    expect(borradorDe(martes, HORARIO)).toEqual({
      abierto: true,
      mananaActiva: true,
      tardeActiva: true,
      cupoManana: 2,
      cupoTarde: 2,
      motivo: '',
    });
    const soloManana = estadoDelDia('2026-10-27', fuentes([{ fecha: '2026-10-27', abierto: true, cupoManana: 4, cupoTarde: 0, motivo: 'Corto' }]));
    expect(borradorDe(soloManana, HORARIO)).toMatchObject({ tardeActiva: false, cupoTarde: 2, cupoManana: 4, motivo: 'Corto' });
    const domingo = estadoDelDia('2026-11-01', fuentes());
    expect(borradorDe(domingo, HORARIO)).toMatchObject({ abierto: false, cupoManana: 2, cupoTarde: 2 });
  });

  it('payload del PUT: franja apagada = cupo 0; sin franjas = cerrado; motivo recortado', () => {
    const base = { abierto: true, mananaActiva: true, tardeActiva: false, cupoManana: 3, cupoTarde: 5, motivo: '  ' };
    expect(cambioDelBorrador(base)).toEqual({ abierto: true, cupoManana: 3, cupoTarde: 0, motivo: null });
    expect(cambioDelBorrador({ ...base, mananaActiva: false })).toEqual({ abierto: false, motivo: null });
    expect(cambioDelBorrador({ ...base, abierto: false, motivo: ' Vacaciones ' })).toEqual({ abierto: false, motivo: 'Vacaciones' });
    expect(cambioDelBorrador({ ...base, cupoManana: 99 })).toMatchObject({ cupoManana: 20 });
  });

  it('acción: nada si no cambia, quitar si vuelve al habitual, guardar si no', () => {
    const martes = estadoDelDia('2026-10-27', fuentes());
    const b = borradorDe(martes, HORARIO);
    expect(accionDelBorrador(b, martes, HORARIO)).toEqual({ tipo: 'nada' });
    expect(accionDelBorrador({ ...b, abierto: false }, martes, HORARIO)).toEqual({
      tipo: 'guardar',
      cambio: { abierto: false, motivo: null },
    });
    const cambiado = estadoDelDia('2026-10-27', fuentes([{ fecha: '2026-10-27', abierto: true, cupoManana: 4, cupoTarde: 2, motivo: null }]));
    const deVuelta = { ...borradorDe(cambiado, HORARIO), cupoManana: 2 };
    expect(accionDelBorrador(deVuelta, cambiado, HORARIO)).toEqual({ tipo: 'quitar' });
    expect(accionDelBorrador({ ...deVuelta, motivo: 'Ojo' }, cambiado, HORARIO)).toMatchObject({ tipo: 'guardar' });
  });

  it('avisa (sin bloquear) si se cierra o se achica algo que ya tiene turnos', () => {
    const martes = estadoDelDia('2026-10-27', fuentes([], [cupo('2026-10-27', 2, 0)]));
    const b = borradorDe(martes, HORARIO);
    expect(avisoDeTurnos(b, martes)).toBeNull();
    expect(avisoDeTurnos({ ...b, abierto: false }, martes)).toBe(
      'Ese día ya tiene 2 turnos: no se cancelan, solo deja de recibir pedidos nuevos.',
    );
    expect(avisoDeTurnos({ ...b, mananaActiva: false }, martes)).toBe(
      'La mañana ya tiene 2 turnos: no se cancelan, solo deja de recibir pedidos nuevos.',
    );
    expect(avisoDeTurnos({ ...b, cupoManana: 1 }, martes)).toMatch(/^La mañana ya tiene 2 turnos y el cupo queda en 1/);
    expect(avisoDeTurnos({ ...b, tardeActiva: false }, martes)).toBeNull();
  });

  it('próximos cambios: de hoy en adelante y en orden', () => {
    const lista = proximosCambios(
      [
        { fecha: '2026-12-25', abierto: false, cupoManana: null, cupoTarde: null, motivo: null },
        { fecha: '2026-10-20', abierto: false, cupoManana: null, cupoTarde: null, motivo: null },
        { fecha: '2026-11-23', abierto: false, cupoManana: null, cupoTarde: null, motivo: null },
      ],
      HOY,
    );
    expect(lista.map((d) => d.fecha)).toEqual(['2026-11-23', '2026-12-25']);
  });
});
