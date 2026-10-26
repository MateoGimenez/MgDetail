import { describe, expect, it } from 'vitest';
import type { UsuarioPanel } from '../api/contract-panel';
import { avisoDeCambioUsuario, quienEs } from './avisosUsuario';

const ana = { nombre: 'Ana', email: 'ana@mg.test' } as UsuarioPanel;
const sinNombre = { nombre: null, email: 'beto@mg.test' } as UsuarioPanel;

describe('aviso al guardar un usuario', () => {
  it('nombra a la persona por su nombre o, si no tiene, por su email', () => {
    expect(quienEs(ana)).toBe('Ana');
    expect(quienEs(sinNombre)).toBe('beto@mg.test');
  });

  it('dice lo más importante del cambio', () => {
    expect(avisoDeCambioUsuario(ana, { password: 'x' })).toBe('Cambiaste la contraseña de Ana.');
    expect(avisoDeCambioUsuario(ana, { email: 'a@b.c' })).toBe('Cambiaste el email de Ana.');
    expect(avisoDeCambioUsuario(ana, { activo: true })).toBe('Ana ya tiene acceso al panel.');
    expect(avisoDeCambioUsuario(sinNombre, { activo: false })).toBe('beto@mg.test ya no tiene acceso al panel.');
    expect(avisoDeCambioUsuario(ana, { rol: 'empleado' })).toBe('Ana ahora es Empleado.');
    expect(avisoDeCambioUsuario(ana, { nombre: 'Anita' })).toBe('Cambios guardados.');
  });
});
