import { afterEach, describe, expect, it } from 'vitest';
import { ESTADOS } from '../src/domain/booking.js';
import { ROLES, type Rol } from '../src/domain/perfil.js';
import {
  CAPACIDADES,
  nivelDe,
  puedeBorrarTurnos,
  puedeCambiarEstado,
  puedeCorregirCobro,
  puedeEditarCatalogo,
  puedeEditarDisponibilidad,
  puedeGestionarUsuarios,
  puedeRegistrarCobro,
  puedeReprogramar,
  puedeVerEstadisticas,
  puedeVerImportes,
} from '../src/domain/permisos.js';
import { closeAllContexts, createClient, createTestContext, loginAs } from './helpers.js';

afterEach(closeAllContexts);

/** La verdad escrita a mano, independiente de CAPACIDADES: si alguien cambia una regla, este test lo ve. */
const ESPERADO: Record<Rol, Record<string, boolean>> = {
  superadmin: { reprogramar: true, borrar: true, usuarios: true, catalogo: true, disponibilidad: true, estadisticas: true, cobro: true, corregir: true },
  admin: { reprogramar: true, borrar: true, usuarios: false, catalogo: true, disponibilidad: true, estadisticas: true, cobro: true, corregir: true },
  empleado: { reprogramar: false, borrar: false, usuarios: false, catalogo: false, disponibilidad: false, estadisticas: false, cobro: false, corregir: false },
};

describe('matriz de permisos (CAPACIDADES) y funciones puede*', () => {
  it('las funciones coinciden con la verdad esperada para los tres roles', () => {
    for (const rol of ROLES) {
      const esperado = ESPERADO[rol];
      expect(puedeReprogramar(rol), rol).toBe(esperado.reprogramar);
      expect(puedeBorrarTurnos(rol), rol).toBe(esperado.borrar);
      expect(puedeGestionarUsuarios(rol), rol).toBe(esperado.usuarios);
      expect(puedeEditarCatalogo(rol), rol).toBe(esperado.catalogo);
      expect(puedeEditarDisponibilidad(rol), rol).toBe(esperado.disponibilidad);
      expect(puedeVerEstadisticas(rol), rol).toBe(esperado.estadisticas);
      expect(puedeVerImportes(rol), rol).toBe(esperado.estadisticas);
      expect(puedeRegistrarCobro(rol), rol).toBe(esperado.cobro);
      expect(puedeCorregirCobro(rol), rol).toBe(esperado.corregir);
      for (const estado of ESTADOS) {
        expect(puedeCambiarEstado(rol, estado), `${rol} ${estado}`).toBe(rol === 'empleado' ? estado === 'completado' : true);
      }
    }
  });

  it('las funciones coinciden con la matriz que ve el usuario', () => {
    const pares: [string, (rol: Rol) => boolean][] = [
      ['turnos.reprogramar', puedeReprogramar],
      ['turnos.borrar', puedeBorrarTurnos],
      ['usuarios.gestionar', puedeGestionarUsuarios],
      ['catalogo.editar', puedeEditarCatalogo],
      ['disponibilidad.editar', puedeEditarDisponibilidad],
      ['estadisticas.completas', puedeVerEstadisticas],
      ['cobro.registrar', puedeRegistrarCobro],
      ['cobro.corregir', puedeCorregirCobro],
    ];
    for (const [id, funcion] of pares) {
      const capacidad = CAPACIDADES.find((c) => c.id === id);
      expect(capacidad, id).toBeDefined();
      for (const rol of ROLES) expect(funcion(rol), `${id} ${rol}`).toBe(capacidad?.roles[rol] === 'si');
    }
    for (const rol of ROLES) {
      const nivel = nivelDe(rol, 'turnos.estado');
      expect(ESTADOS.every((e) => puedeCambiarEstado(rol, e))).toBe(nivel === 'si');
      expect(ESTADOS.some((e) => puedeCambiarEstado(rol, e))).toBe(nivel !== 'no');
    }
  });

  it('la matriz es coherente: ids únicos, tres roles, y un matiz exactamente para cada "parcial"', () => {
    expect(new Set(CAPACIDADES.map((c) => c.id)).size).toBe(CAPACIDADES.length);
    for (const capacidad of CAPACIDADES) {
      const matiz: Partial<Record<Rol, string>> = 'matiz' in capacidad ? capacidad.matiz : {};
      expect(Object.keys(capacidad.roles).sort(), capacidad.id).toEqual([...ROLES].sort());
      for (const rol of ROLES) {
        expect(['si', 'no', 'parcial']).toContain(capacidad.roles[rol]);
        expect(matiz[rol] !== undefined, `${capacidad.id} ${rol}`).toBe(capacidad.roles[rol] === 'parcial');
      }
      // el superadmin puede todo lo que puede el admin
      if (capacidad.roles.admin === 'si') expect(capacidad.roles.superadmin).toBe('si');
    }
    const ids = CAPACIDADES.map((c) => c.id);
    for (const id of ['turnos.ver', 'turnos.estado', 'cobro.registrar', 'catalogo.editar', 'disponibilidad.editar', 'estadisticas.completas', 'estadisticas.propias', 'usuarios.gestionar', 'push.activar']) {
      expect(ids).toContain(id);
    }
  });
});

describe('GET /api/admin/permisos', () => {
  it('lo ven los tres roles, con la forma del contrato y tuRol', async () => {
    const context = await createTestContext();
    for (const rol of ROLES) {
      const { client } = await loginAs(context, rol);
      const response = await client.get('/api/admin/permisos');
      expect(response.status, rol).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual(['capacidades', 'roles', 'tuRol']);
      expect(response.body.tuRol).toBe(rol);
      expect((response.body.roles as { id: string }[]).map((r) => r.id)).toEqual(['superadmin', 'admin', 'empleado']);
      for (const r of response.body.roles as { id: string; nombre: string; descripcion: string }[]) {
        expect(Object.keys(r).sort()).toEqual(['descripcion', 'id', 'nombre']);
        expect(r.descripcion.length).toBeGreaterThan(20);
      }
      const estado = (response.body.capacidades as { id: string }[]).find((c) => c.id === 'turnos.estado');
      expect(estado).toEqual({
        id: 'turnos.estado',
        grupo: 'Turnos',
        texto: 'Cambiar el estado de un turno',
        roles: { superadmin: 'si', admin: 'si', empleado: 'parcial' },
        matiz: { empleado: 'Solo puede marcarlos como Completado' },
      });
      const ver = (response.body.capacidades as { id: string; matiz?: unknown }[]).find((c) => c.id === 'turnos.ver');
      expect(ver).not.toHaveProperty('matiz');
      expect(response.body.capacidades).toHaveLength(CAPACIDADES.length);
    }
  });

  it('las descripciones de los roles de la base mencionan lo que dice la matriz', async () => {
    const context = await createTestContext();
    const { client } = await loginAs(context, 'empleado');
    const roles = (await client.get('/api/admin/permisos')).body.roles as { id: string; descripcion: string }[];
    const texto = (id: string) => roles.find((r) => r.id === id)?.descripcion ?? '';
    expect(texto('empleado')).toMatch(/completados/);
    expect(texto('empleado')).toMatch(/sin importes/);
    expect(texto('admin')).toMatch(/cobro/);
    expect(texto('admin')).toMatch(/No gestiona usuarios/);
    expect(texto('superadmin')).toMatch(/gestionar usuarios/);
  });

  it('exige sesión', async () => {
    const context = await createTestContext();
    expect((await createClient(context.app).get('/api/admin/permisos')).status).toBe(401);
  });
});
