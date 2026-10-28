import { describe, expect, it } from 'vitest';
import { VISTAS, resolverVista } from '../lib/hoy';
import { GRUPOS, SECCIONES, grupoDe, gruposVisibles, seccionDe, seccionesVisibles, vistasPermitidas } from './secciones';

describe('registro de secciones del panel', () => {
  it('tiene las diez, una por clave de ?vista=, sin repetir', () => {
    expect(SECCIONES).toHaveLength(10);
    expect(SECCIONES.map((s) => s.clave).sort()).toEqual([...VISTAS].sort());
    expect(new Set(SECCIONES.map((s) => s.clave)).size).toBe(10);
  });

  it('cada sección está en un grupo que existe y tiene etiqueta', () => {
    const grupos = GRUPOS.map((g) => g.clave);
    for (const s of SECCIONES) {
      expect(grupos).toContain(s.grupo);
      expect(s.etiqueta.length).toBeGreaterThan(2);
    }
  });

  it('el superadmin ve las diez', () => {
    expect(seccionesVisibles('superadmin')).toHaveLength(10);
  });

  it('el admin ve nueve: todo menos Usuarios', () => {
    const claves = vistasPermitidas('admin');
    expect(claves).toHaveLength(9);
    expect(claves).not.toContain('usuarios');
    expect(claves).toContain('finanzas');
    expect(claves).toContain('presupuestos');
  });

  it('el empleado ve Hoy, Turnos, Agenda, Inventario, Estadísticas, Disponibilidad y Servicios', () => {
    expect(vistasPermitidas('empleado').sort()).toEqual(
      ['agenda', 'disponibilidad', 'estadisticas', 'hoy', 'inventario', 'servicios', 'turnos'].sort(),
    );
  });

  it('los grupos se arman por rol y ninguno queda vacío', () => {
    expect(gruposVisibles('superadmin').map((g) => g.clave)).toEqual(['operacion', 'negocio', 'ajustes']);
    const empleado = gruposVisibles('empleado');
    expect(empleado.map((g) => g.clave)).toEqual(['operacion', 'negocio', 'ajustes']);
    expect(empleado.find((g) => g.clave === 'negocio')?.secciones.map((s) => s.clave)).toEqual(['estadisticas']);
    for (const rol of ['superadmin', 'admin', 'empleado'] as const) {
      for (const g of gruposVisibles(rol)) expect(g.secciones.length).toBeGreaterThan(0);
    }
  });

  it('en el celular entran todos los botones de una fila: ningún grupo pasa de cuatro secciones', () => {
    for (const g of gruposVisibles('superadmin')) expect(g.secciones.length).toBeLessThanOrEqual(4);
  });

  it('grupoDe y seccionDe', () => {
    expect(grupoDe('finanzas')).toBe('negocio');
    expect(grupoDe('inventario')).toBe('operacion');
    expect(seccionDe('hoy').etiqueta).toBe('Hoy');
  });

  it('las secciones que se cargan aparte tienen componente diferido; las de siempre las dibuja Panel', () => {
    for (const clave of ['estadisticas', 'finanzas', 'presupuestos', 'inventario'] as const) {
      expect(seccionDe(clave).componente).toBeDefined();
    }
    for (const clave of ['hoy', 'turnos', 'agenda', 'disponibilidad', 'servicios', 'usuarios'] as const) {
      expect(seccionDe(clave).componente).toBeUndefined();
    }
  });

  it('?vista= cae en Hoy si el rol no ve la sección', () => {
    expect(resolverVista('finanzas', vistasPermitidas('admin'))).toBe('finanzas');
    expect(resolverVista('finanzas', vistasPermitidas('empleado'))).toBe('hoy');
    expect(resolverVista('presupuestos', vistasPermitidas('empleado'))).toBe('hoy');
    expect(resolverVista('inventario', vistasPermitidas('empleado'))).toBe('inventario');
    expect(resolverVista('usuarios', vistasPermitidas('admin'))).toBe('hoy');
    expect(resolverVista('usuarios', vistasPermitidas('superadmin'))).toBe('usuarios');
  });
});
