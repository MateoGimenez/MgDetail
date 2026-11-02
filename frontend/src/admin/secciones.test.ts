import { describe, expect, it } from 'vitest';
import { VISTAS, resolverVista } from '../lib/hoy';
import {
  SECCIONES,
  estaEnGrupos,
  indiceConTecla,
  navegacionAncha,
  navegacionPara,
  seccionDe,
  seccionesVisibles,
  vistasPermitidas,
} from './secciones';

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

describe('navegación de la pantalla ancha', () => {
  it('Hoy, Turnos, Agenda y Servicios quedan a la vista; el resto va agrupado en Más', () => {
    const { principales, grupos } = navegacionAncha('superadmin');
    expect(principales.map((s) => s.clave)).toEqual(['hoy', 'turnos', 'agenda', 'servicios']);
    expect(grupos.map((g) => [g.titulo, g.secciones.map((s) => s.clave)])).toEqual([
      ['Gestión', ['inventario', 'finanzas', 'presupuestos']],
      ['Admin', ['estadisticas', 'disponibilidad', 'usuarios']],
    ]);
  });

  it('respeta los permisos: el admin no ve Usuarios', () => {
    const { grupos } = navegacionAncha('admin');
    expect(grupos.flatMap((g) => g.secciones.map((s) => s.clave))).not.toContain('usuarios');
    expect(grupos[1]?.secciones.map((s) => s.clave)).toEqual(['estadisticas', 'disponibilidad']);
  });

  it('el empleado ve solo Inventario en Gestión y Estadísticas y Disponibilidad en Admin', () => {
    const { grupos } = navegacionAncha('empleado');
    expect(grupos.map((g) => g.secciones.map((s) => s.clave))).toEqual([['inventario'], ['estadisticas', 'disponibilidad']]);
  });

  it('ninguna sección se pierde ni se repite', () => {
    for (const rol of ['superadmin', 'admin', 'empleado'] as const) {
      const { principales, grupos } = navegacionAncha(rol);
      const claves = [...principales, ...grupos.flatMap((g) => g.secciones)].map((s) => s.clave);
      expect(claves.sort()).toEqual(vistasPermitidas(rol).sort());
    }
  });

  it('estaEnGrupos marca Más activo solo si la ruta está dentro', () => {
    const { grupos } = navegacionAncha('superadmin');
    expect(estaEnGrupos(grupos, 'finanzas')).toBe(true);
    expect(estaEnGrupos(grupos, 'usuarios')).toBe(true);
    expect(estaEnGrupos(grupos, 'servicios')).toBe(false);
    expect(estaEnGrupos(grupos, 'hoy')).toBe(false);
  });

  it('indiceConTecla recorre el menú de forma circular', () => {
    expect(indiceConTecla(0, 3, 'ArrowDown')).toBe(1);
    expect(indiceConTecla(2, 3, 'ArrowDown')).toBe(0);
    expect(indiceConTecla(0, 3, 'ArrowUp')).toBe(2);
    expect(indiceConTecla(1, 3, 'Home')).toBe(0);
    expect(indiceConTecla(1, 3, 'End')).toBe(2);
    expect(indiceConTecla(1, 3, 'x')).toBe(1);
    expect(indiceConTecla(0, 0, 'ArrowDown')).toBe(-1);
  });
});
