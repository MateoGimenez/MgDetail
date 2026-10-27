import { describe, expect, it } from 'vitest';
import type { Capacidad } from '../api/contract-panel';
import { agruparPorGrupo, resumenDeRol, textoDeCelda, textoDeItem } from './permisosRol';

const cap = (
  id: string,
  grupo: string,
  texto: string,
  roles: [Capacidad['roles']['superadmin'], Capacidad['roles']['admin'], Capacidad['roles']['empleado']],
  matiz?: Capacidad['matiz'],
): Capacidad => ({ id, grupo, texto, roles: { superadmin: roles[0], admin: roles[1], empleado: roles[2] }, matiz });

const matriz: Capacidad[] = [
  cap('turnos.ver', 'Turnos', 'Ver los turnos y la agenda', ['si', 'si', 'si']),
  cap('turnos.estado', 'Turnos', 'Cambiar el estado de un turno', ['si', 'si', 'parcial'], {
    empleado: 'Solo puede marcarlos como Completado.',
  }),
  cap('cobro.registrar', 'Cobro', 'Registrar el cobro de un trabajo', ['si', 'si', 'no']),
  cap('turnos.borrar', 'Turnos', 'Borrar turnos', ['si', 'si', 'no']),
  cap('usuarios', 'Usuarios', 'Gestionar usuarios', ['si', 'no', 'no']),
];

describe('agruparPorGrupo', () => {
  it('junta por grupo en el orden en que aparece cada uno y conserva el orden interno', () => {
    const grupos = agruparPorGrupo(matriz);
    expect(grupos.map((g) => g.grupo)).toEqual(['Turnos', 'Cobro', 'Usuarios']);
    expect(grupos[0]?.capacidades.map((c) => c.id)).toEqual(['turnos.ver', 'turnos.estado', 'turnos.borrar']);
  });

  it('sin capacidades no hay grupos', () => {
    expect(agruparPorGrupo([])).toEqual([]);
  });
});

describe('resumenDeRol', () => {
  it('lo parcial va entre lo que puede, con su matiz', () => {
    const r = resumenDeRol(matriz, 'empleado');
    expect(r.puede).toEqual([
      { texto: 'Ver los turnos y la agenda', matiz: null },
      { texto: 'Cambiar el estado de un turno', matiz: 'Solo puede marcarlos como Completado.' },
    ]);
    expect(r.noPuede.map((i) => i.texto)).toEqual(['Registrar el cobro de un trabajo', 'Borrar turnos', 'Gestionar usuarios']);
  });

  it('el superadmin puede todo; el admin no gestiona usuarios', () => {
    expect(resumenDeRol(matriz, 'superadmin').noPuede).toEqual([]);
    expect(resumenDeRol(matriz, 'admin').noPuede).toEqual([{ texto: 'Gestionar usuarios', matiz: null }]);
  });

  it('un parcial sin matiz se muestra igual, sin matiz', () => {
    const r = resumenDeRol([cap('x', 'G', 'Hacer algo', ['si', 'si', 'parcial'])], 'empleado');
    expect(r.puede).toEqual([{ texto: 'Hacer algo', matiz: null }]);
  });
});

describe('textos', () => {
  it('textoDeItem agrega el matiz entre paréntesis', () => {
    expect(textoDeItem({ texto: 'Cambiar el estado de un turno', matiz: 'Solo puede marcarlos como Completado.' })).toBe(
      'Cambiar el estado de un turno (solo puede marcarlos como Completado)',
    );
    expect(textoDeItem({ texto: 'Ver los turnos.', matiz: null })).toBe('Ver los turnos');
  });

  it('textoDeCelda dice Sí, No o Parcial con el matiz, sin depender del color', () => {
    const estado = matriz[1] as Capacidad;
    expect(textoDeCelda(estado, 'admin')).toBe('Sí');
    expect(textoDeCelda(estado, 'empleado')).toBe('Parcial: solo puede marcarlos como Completado.');
    expect(textoDeCelda(matriz[2] as Capacidad, 'empleado')).toBe('No');
  });
});
