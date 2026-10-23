import { describe, expect, it } from 'vitest';
import type { Turno } from '../api/contract';
import {
  agruparPorDia,
  cantidadDelDia,
  lugarEnAgenda,
  mensajeParaCliente,
  textoCantidad,
  textoPidio,
  validarFechaConfirmada,
} from './agenda';
import {
  diaConMes,
  diaCorto,
  diaDeLaSemana,
  diasDeLaSemana,
  hoyEnLaRioja,
  lunesDeLaSemana,
  nombreCortoDelDia,
  nombreDeLaSemana,
  rangoDeConfirmacion,
  sumarDias,
} from './fechas';

const base: Turno = {
  id: 'a1',
  nombre: 'Lucía Fernández',
  telefono: '380 412-3456',
  telefonoWhatsapp: '5493804123456',
  email: null,
  vehiculoTipo: 'auto',
  vehiculoModelo: null,
  servicioId: 'pulido',
  fechaPreferida: '2026-10-22',
  franja: 'manana',
  fechaConfirmada: null,
  franjaConfirmada: null,
  comentario: null,
  estado: 'pendiente',
  createdAt: '2026-10-16T15:00:00.000Z',
  updatedAt: '2026-10-16T15:00:00.000Z',
  notasInternas: null,
  turnosDelCliente: 1,
};
const turno = (cambios: Partial<Turno>): Turno => ({ ...base, ...cambios });

describe('semana de lunes a domingo', () => {
  it('el lunes de la semana de cualquier día, incluido el domingo', () => {
    expect(diaDeLaSemana('2026-10-19')).toBe(0); // lunes
    expect(diaDeLaSemana('2026-10-25')).toBe(6); // domingo
    expect(lunesDeLaSemana('2026-10-19')).toBe('2026-10-19');
    expect(lunesDeLaSemana('2026-10-22')).toBe('2026-10-19');
    expect(lunesDeLaSemana('2026-10-25')).toBe('2026-10-19');
    expect(lunesDeLaSemana('2026-10-26')).toBe('2026-10-26');
  });

  it('cruza el cambio de mes y de año', () => {
    expect(lunesDeLaSemana('2026-11-01')).toBe('2026-10-26');
    expect(diasDeLaSemana('2026-10-26')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(lunesDeLaSemana('2027-01-01')).toBe('2026-12-28');
    expect(diasDeLaSemana('2026-12-28').at(-1)).toBe('2027-01-03');
    // Año bisiesto: 2028-02-29 existe y cae martes.
    expect(lunesDeLaSemana('2028-03-01')).toBe('2028-02-28');
    expect(diasDeLaSemana('2028-02-28')[1]).toBe('2028-02-29');
  });

  it('"hoy" de la agenda es el de La Rioja: a las 22 h del domingo sigue siendo esa semana', () => {
    // Domingo 25/10 a las 22:30 en La Rioja = lunes 26/10 01:30 UTC.
    const hoy = hoyEnLaRioja(new Date('2026-10-26T01:30:00.000Z'));
    expect(hoy).toBe('2026-10-25');
    expect(lunesDeLaSemana(hoy)).toBe('2026-10-19');
  });

  it('nombra la semana sin repetir mes ni año cuando los comparte', () => {
    expect(nombreDeLaSemana('2026-10-19')).toBe('19 al 25 de octubre');
    expect(nombreDeLaSemana('2026-10-26')).toBe('26 de octubre al 1 de noviembre');
    expect(nombreDeLaSemana('2026-12-28')).toBe('28 de diciembre de 2026 al 3 de enero de 2027');
  });

  it('nombres de días fijos, sin depender de la versión de Intl', () => {
    expect(nombreCortoDelDia('2026-10-24')).toBe('sáb');
    expect(diaCorto('2026-10-22')).toBe('jue 22');
    expect(diaConMes('2026-10-21')).toBe('miércoles 21 de octubre');
  });
});

describe('rango de la fecha confirmada', () => {
  it('va de hoy a hoy + 120 días (hora de La Rioja), cruzando el año', () => {
    expect(rangoDeConfirmacion(new Date('2026-10-23T15:00:00.000Z'))).toEqual({ min: '2026-10-23', max: '2027-02-20' });
    // 23:30 del 31/12 en La Rioja: todavía es 2026.
    expect(rangoDeConfirmacion(new Date('2027-01-01T02:30:00.000Z')).min).toBe('2026-12-31');
  });

  it('valida día y franja con mensajes en castellano', () => {
    const ahora = new Date('2026-10-23T15:00:00.000Z');
    expect(validarFechaConfirmada('2026-10-23', 'tarde', ahora)).toEqual({});
    expect(validarFechaConfirmada('2027-02-20', 'manana', ahora)).toEqual({});
    expect(validarFechaConfirmada('2026-10-22', 'manana', ahora).fechaConfirmada).toMatch(/hoy en adelante/);
    expect(validarFechaConfirmada('2027-02-21', 'manana', ahora).fechaConfirmada).toMatch(/120 días/);
    expect(validarFechaConfirmada('2026-11-31', 'manana', ahora).fechaConfirmada).toBe('Esa fecha no es válida.');
    expect(validarFechaConfirmada('', null, ahora)).toEqual({
      fechaConfirmada: 'Elegí el día del turno.',
      franjaConfirmada: 'Elegí mañana o tarde.',
    });
  });
});

describe('fecha de agenda', () => {
  it('es la confirmada si existe; si no, la pedida', () => {
    expect(lugarEnAgenda(base)).toEqual({ fecha: '2026-10-22', franja: 'manana', reprogramado: false });
    expect(lugarEnAgenda(turno({ fechaConfirmada: '2026-10-24', franjaConfirmada: 'tarde' }))).toEqual({
      fecha: '2026-10-24',
      franja: 'tarde',
      reprogramado: true,
    });
    // Confirmada igual a lo pedido: no hay nada que aclarar.
    expect(lugarEnAgenda(turno({ fechaConfirmada: '2026-10-22', franjaConfirmada: 'manana' })).reprogramado).toBe(false);
  });

  it('aclara lo que pidió cuando difiere', () => {
    expect(textoPidio(base)).toBeNull();
    expect(textoPidio(turno({ fechaConfirmada: '2026-10-26', franjaConfirmada: 'manana' }))).toBe('Pidió: jue 22');
    expect(textoPidio(turno({ fechaConfirmada: '2026-10-22', franjaConfirmada: 'tarde' }))).toBe('Pidió: jue 22 · Mañana');
  });

  it('agrupa por día y franja, sin cancelados ni lo que cae fuera de la semana', () => {
    const dias = diasDeLaSemana('2026-10-19');
    const turnos = [
      turno({ id: 't2', franja: 'tarde', createdAt: '2026-10-16T10:00:00.000Z' }),
      turno({ id: 'm2', createdAt: '2026-10-17T10:00:00.000Z' }),
      turno({ id: 'm1', createdAt: '2026-10-16T09:00:00.000Z', estado: 'confirmado' }),
      turno({ id: 'x', estado: 'cancelado' }),
      // Pidió el 22 pero se movió al domingo 25 a la tarde.
      turno({ id: 'mov', fechaConfirmada: '2026-10-25', franjaConfirmada: 'tarde', estado: 'confirmado' }),
      // Movido a la semana siguiente: no aparece en esta.
      turno({ id: 'fuera', fechaConfirmada: '2026-10-26', franjaConfirmada: 'manana', estado: 'confirmado' }),
    ];
    const grupos = agruparPorDia(turnos, dias);
    expect([...grupos.keys()]).toEqual(dias);
    expect(grupos.get('2026-10-22')?.manana.map((t) => t.id)).toEqual(['m1', 'm2']);
    expect(grupos.get('2026-10-22')?.tarde.map((t) => t.id)).toEqual(['t2']);
    expect(grupos.get('2026-10-25')?.tarde.map((t) => t.id)).toEqual(['mov']);
    expect(cantidadDelDia(grupos.get('2026-10-22'))).toBe(3);
    expect(cantidadDelDia(grupos.get('2026-10-19'))).toBe(0);
    expect(textoCantidad(1)).toBe('1 turno');
    expect(textoCantidad(3)).toBe('3 turnos');
  });
});

/*
 * Misma tabla que backend/test/dates.test.ts ("hoy" y rango de la fecha confirmada): el panel y la API tienen que
 * coincidir en qué día es hoy, o el formulario deja elegir una fecha que la API rechaza (o al revés).
 */
const HOY_EN_LA_RIOJA: readonly (readonly [utc: string, hoy: string, max: string, lunes: string])[] = [
  ['2026-10-26T02:59:59.000Z', '2026-10-25', '2027-02-22', '2026-10-19'], // domingo 23:59 local; en UTC ya es lunes
  ['2026-10-26T03:00:00.000Z', '2026-10-26', '2027-02-23', '2026-10-26'], // lunes 00:00 local: semana nueva
  ['2027-01-01T02:59:59.000Z', '2026-12-31', '2027-04-30', '2026-12-28'], // 31/12 23:59 local
  ['2027-01-01T03:00:00.000Z', '2027-01-01', '2027-05-01', '2026-12-28'], // año nuevo, misma semana
  ['2028-02-29T02:30:00.000Z', '2028-02-28', '2028-06-27', '2028-02-28'], // bisiesto: todavía 28 en La Rioja
  ['2028-03-01T02:59:59.000Z', '2028-02-29', '2028-06-28', '2028-02-28'],
  ['2028-03-01T03:00:00.000Z', '2028-03-01', '2028-06-29', '2028-02-28'],
];

describe('"hoy" del panel = "hoy" de la API (La Rioja, sin importar la zona del navegador)', () => {
  it.each(HOY_EN_LA_RIOJA)('%s => hoy %s, hasta %s, semana del %s', (utc, hoy, max, lunes) => {
    const ahora = new Date(utc);
    expect(hoyEnLaRioja(ahora)).toBe(hoy);
    expect(rangoDeConfirmacion(ahora)).toEqual({ min: hoy, max });
    expect(lunesDeLaSemana(hoyEnLaRioja(ahora))).toBe(lunes);
    // Los bordes del rango: hoy y hoy + 120 se aceptan; ayer y hoy + 121, no.
    expect(validarFechaConfirmada(hoy, 'manana', ahora)).toEqual({});
    expect(validarFechaConfirmada(max, 'tarde', ahora)).toEqual({});
    expect(validarFechaConfirmada(sumarDias(hoy, -1), 'manana', ahora).fechaConfirmada).toBeDefined();
    expect(validarFechaConfirmada(sumarDias(max, 1), 'manana', ahora).fechaConfirmada).toBeDefined();
  });
});

describe('fecha confirmada en semanas que cruzan mes, año y 29 de febrero', () => {
  it('aparece en el día confirmado (aunque sea de otra semana que la pedida) y no en el pedido', () => {
    // Pidió el jueves 31/12 a la mañana; se confirmó para el sábado 2/1 a la tarde: misma semana (28/12 a 3/1).
    const anio = turno({ id: 'anio', fechaPreferida: '2026-12-31', fechaConfirmada: '2027-01-02', franjaConfirmada: 'tarde' });
    const fin = agruparPorDia([anio], diasDeLaSemana('2026-12-28'));
    expect(fin.get('2027-01-02')?.tarde.map((t) => t.id)).toEqual(['anio']);
    expect(cantidadDelDia(fin.get('2026-12-31'))).toBe(0);
    expect(textoPidio(anio)).toBe('Pidió: jue 31 · Mañana');

    // Pidió el domingo 27/2/2028 (semana anterior) y se movió al martes 29: aparece en la semana del 28.
    const bisiesto = turno({ id: 'b', fechaPreferida: '2028-02-27', fechaConfirmada: '2028-02-29', franjaConfirmada: 'manana' });
    const semana = agruparPorDia([bisiesto], diasDeLaSemana('2028-02-28'));
    expect(semana.get('2028-02-29')?.manana.map((t) => t.id)).toEqual(['b']);
    expect(cantidadDelDia(agruparPorDia([bisiesto], diasDeLaSemana('2028-02-21')).get('2028-02-27'))).toBe(0);
    expect(textoPidio(bisiesto)).toBe('Pidió: dom 27');
  });

  it('"Pidió: …" solo cuando difiere; una confirmada igual a lo pedido no se aclara', () => {
    expect(textoPidio(turno({ fechaConfirmada: '2026-10-22', franjaConfirmada: 'manana', estado: 'confirmado' }))).toBeNull();
    expect(textoPidio(turno({ estado: 'confirmado' }))).toBeNull();
  });

  it('dos o más turnos en la misma celda, por orden de llegada', () => {
    const celda = agruparPorDia(
      [
        turno({ id: 'c', createdAt: '2026-10-18T10:00:00.000Z' }),
        turno({ id: 'a', createdAt: '2026-10-16T10:00:00.000Z' }),
        turno({ id: 'b', fechaPreferida: '2026-10-21', fechaConfirmada: '2026-10-22', franjaConfirmada: 'manana', createdAt: '2026-10-17T10:00:00.000Z' }),
      ],
      diasDeLaSemana('2026-10-19'),
    ).get('2026-10-22');
    expect(celda?.manana.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(cantidadDelDia(celda)).toBe(3);
  });

  it('una semana sin turnos (o solo con cancelados) da todos los días vacíos', () => {
    const vacia = agruparPorDia([turno({ estado: 'cancelado' })], diasDeLaSemana('2026-10-19'));
    expect([...vacia.values()].map(cantidadDelDia)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('mensaje de WhatsApp para el cliente', () => {
  it('usa la fecha de agenda: la pedida si no hay confirmada, la confirmada si existe', () => {
    expect(mensajeParaCliente(turno({ nombre: '  Lucía Fernández ' }), 'Pulido', 'MgDetailing')).toBe(
      '¡Hola Lucía! Te escribimos de MgDetailing por tu pedido de turno: Pulido, el jueves 22 de octubre por la mañana.',
    );
    expect(
      mensajeParaCliente(
        turno({ estado: 'confirmado', fechaConfirmada: '2026-10-24', franjaConfirmada: 'tarde' }),
        'Pulido',
        'MgDetailing',
      ),
    ).toBe('¡Hola Lucía! Te escribimos de MgDetailing por tu turno: Pulido, el sábado 24 de octubre por la tarde.');
  });
});
