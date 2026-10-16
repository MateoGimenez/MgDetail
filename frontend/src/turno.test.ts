import { describe, expect, it } from 'vitest';
import { crearEsquemaTurno } from './api/contract';
import { hoyEnLaRioja, rangoDeTurno } from './lib/fechas';

// La Rioja es UTC−3 todo el año: las 21:00 locales son las 00:00 UTC del día siguiente.
const AHORA = new Date('2026-10-16T15:00:00.000Z'); // 12:00 en La Rioja

const valido = {
  nombre: '  Lucía Fernández ',
  telefono: '380 412-3456',
  email: '',
  vehiculoTipo: 'auto',
  vehiculoModelo: '',
  servicioId: 'pulido',
  fechaPreferida: '2026-10-20',
  franja: 'manana',
  comentario: '',
  website: '',
};

const mensajes = (datos: Record<string, unknown>) => {
  const r = crearEsquemaTurno(AHORA).safeParse(datos);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0] ?? ''), i.message]));
};

describe('hoyEnLaRioja', () => {
  it('a las 20:59 locales sigue siendo el mismo día', () => {
    expect(hoyEnLaRioja(new Date('2026-10-16T23:59:00.000Z'))).toBe('2026-10-16');
  });

  it('a las 21:00 locales no pasa al día siguiente (aunque en UTC ya sea mañana)', () => {
    expect(hoyEnLaRioja(new Date('2026-10-17T00:00:00.000Z'))).toBe('2026-10-16');
    expect(hoyEnLaRioja(new Date('2026-10-17T02:59:59.000Z'))).toBe('2026-10-16');
    expect(hoyEnLaRioja(new Date('2026-10-17T03:00:00.000Z'))).toBe('2026-10-17');
  });
});

describe('rangoDeTurno', () => {
  it('va de hoy a hoy + 60 días, cruzando meses', () => {
    expect(rangoDeTurno(AHORA)).toEqual({ min: '2026-10-16', max: '2026-12-15' });
  });

  it('cruza el fin de año sin problemas', () => {
    expect(rangoDeTurno(new Date('2026-12-20T13:00:00.000Z'))).toEqual({ min: '2026-12-20', max: '2027-02-18' });
  });
});

describe('esquema del turno', () => {
  it('acepta un pedido válido y recorta espacios', () => {
    const r = crearEsquemaTurno(AHORA).safeParse(valido);
    expect(r.success).toBe(true);
    expect(r.data?.nombre).toBe('Lucía Fernández');
  });

  it('pide al menos 8 dígitos en el teléfono y solo caracteres permitidos', () => {
    expect(mensajes({ ...valido, telefono: '380-1234' }).telefono).toMatch(/al menos 8/);
    expect(mensajes({ ...valido, telefono: '380 412 3456 int.' }).telefono).toMatch(/solo números/);
  });

  it('rechaza fechas fuera del rango y fechas inexistentes', () => {
    expect(mensajes({ ...valido, fechaPreferida: '2026-10-15' }).fechaPreferida).toBeDefined();
    expect(mensajes({ ...valido, fechaPreferida: '2026-12-16' }).fechaPreferida).toBeDefined();
    expect(mensajes({ ...valido, fechaPreferida: '2026-11-31' }).fechaPreferida).toBe('Esa fecha no es válida.');
    expect(mensajes({ ...valido, fechaPreferida: '2026-12-15' })).toEqual({});
  });

  it('valida email opcional, enums y caracteres de control', () => {
    expect(mensajes({ ...valido, email: 'no-es-mail' }).email).toBeDefined();
    expect(mensajes({ ...valido, franja: 'mañana' }).franja).toBeDefined();
    expect(mensajes({ ...valido, nombre: 'Ana‮abc' }).nombre).toMatch(/caracteres/);
  });

  it('rechaza campos que no son del contrato', () => {
    const r = crearEsquemaTurno(AHORA).safeParse({ ...valido, extra: 'x' });
    expect(r.success).toBe(false);
  });
});
