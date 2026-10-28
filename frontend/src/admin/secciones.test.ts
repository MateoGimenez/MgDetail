import { describe, expect, it } from 'vitest';
import { VISTAS, resolverVista } from '../lib/hoy';
import { SECCIONES, navegacionPara, seccionDe, seccionesVisibles, vistasPermitidas } from './secciones';

describe('registro de secciones del panel', () => {
  it('tiene las diez, una por clave de ?vista=, sin repetir', () => {
    expect(SECCIONES).toHaveLength(10);
    expect(SECCIONES.map((s) => s.clave).sort()).toEqual([...VISTAS].sort());
    expect(new Set(SECCIONES.map((s) => s.clave)).size).toBe(10);
  });

  it('cada sección tiene etiqueta', () => {
    for (const s of SECCIONES) expect(s.etiqueta.length).toBeGreaterThan(2);
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

  it('la barra de abajo lleva Hoy, Turnos y Agenda para todos los roles; el resto va en Más', () => {
    for (const rol of ['superadmin', 'admin', 'empleado'] as const) {
      const { principales, mas } = navegacionPara(rol);
      expect(principales.map((x) => x.clave)).toEqual(['hoy', 'turnos', 'agenda']);
      expect(principales.length + mas.length).toBe(seccionesVisibles(rol).length);
      expect(mas.length).toBeGreaterThan(0);
    }
  });

  it('Más respeta los permisos: el empleado no ve Finanzas, Presupuestos ni Usuarios', () => {
    expect(navegacionPara('empleado').mas.map((x) => x.clave)).toEqual([
      'inventario',
      'estadisticas',
      'disponibilidad',
      'servicios',
    ]);
    expect(navegacionPara('admin').mas.map((x) => x.clave)).not.toContain('usuarios');
    expect(navegacionPara('superadmin').mas.map((x) => x.clave)).toContain('usuarios');
  });

  it('seccionDe', () => {
    expect(seccionDe('hoy').etiqueta).toBe('Hoy');
    expect(seccionDe('finanzas').principal).toBe(false);
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
