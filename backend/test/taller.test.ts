import { afterEach, describe, expect, it } from 'vitest';
import { TallerService } from '../src/services/taller.js';
import { PostgresTallerRepository } from '../src/repositories/postgres/taller.js';
import { MemoryLogger, closeAllContexts, createClient, createTestContext, loginAs } from './helpers.js';

afterEach(closeAllContexts);

const CLAVES = ['cuit', 'direccion', 'instagram', 'leyendaPdf', 'nombre', 'telefono'];

async function equipo() {
  const context = await createTestContext();
  const admin = await loginAs(context, 'admin', 'ana@t.test');
  const empleado = await loginAs(context, 'empleado', 'beto@t.test');
  return { context, admin: admin.client, empleado: empleado.client };
}

const completo = (extra: Record<string, unknown> = {}) => ({
  nombre: 'MgDetailing',
  telefono: '5493804781737',
  direccion: 'Calle Olta Pasaje N2, La Rioja',
  instagram: 'mgdetailing',
  cuit: '20-12345678-9',
  leyendaPdf: 'Gracias por confiar en nosotros.',
  ...extra,
});

describe('GET /api/admin/taller', () => {
  it('trae la fila sembrada con la forma exacta del contrato', async () => {
    const { admin } = await equipo();
    const r = await admin.get('/api/admin/taller');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body)).toEqual(['taller']);
    expect(Object.keys(r.body.taller).sort()).toEqual(CLAVES);
    expect(r.body.taller).toEqual({
      nombre: 'MgDetailing',
      telefono: '5493804781737',
      direccion: 'Calle Olta Pasaje N2, La Rioja',
      instagram: null,
      cuit: null,
      leyendaPdf: null,
    });
  });

  it('el empleado recibe 403 en GET y PUT (antes de validar) y sin sesión 401', async () => {
    const { context, empleado } = await equipo();
    for (const r of [await empleado.get('/api/admin/taller'), await empleado.put('/api/admin/taller', completo()), await empleado.put('/api/admin/taller', {})]) {
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('FORBIDDEN');
    }
    expect((await createClient(context.app).get('/api/admin/taller')).status).toBe(401);
    const { rows } = await context.db.sql.query('SELECT instagram FROM mgdetailing.taller');
    expect(rows[0]?.instagram).toBeNull();
  });

  it('el superadmin también', async () => {
    const context = await createTestContext();
    const { client } = await loginAs(context, 'superadmin');
    expect((await client.get('/api/admin/taller')).status).toBe(200);
    expect((await client.put('/api/admin/taller', completo())).status).toBe(200);
  });
});

describe('PUT /api/admin/taller', () => {
  it('guarda los seis campos y devuelve lo guardado; un GET posterior lo confirma', async () => {
    const { admin } = await equipo();
    const r = await admin.put('/api/admin/taller', completo());
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toEqual({ taller: completo() });
    expect((await admin.get('/api/admin/taller')).body.taller).toEqual(completo());
  });

  it('los opcionales se vacían con null, con texto en blanco o sin mandarlos; el CUIT acepta 11 dígitos', async () => {
    const { admin } = await equipo();
    const vacio = await admin.put('/api/admin/taller', { nombre: 'Taller Uno', telefono: null, direccion: '   ', instagram: '', cuit: null });
    expect(vacio.body.taller).toEqual({ nombre: 'Taller Uno', telefono: null, direccion: null, instagram: null, cuit: null, leyendaPdf: null });
    expect((await admin.put('/api/admin/taller', completo({ cuit: '20123456789' }))).body.taller.cuit).toBe('20123456789');
    expect((await admin.put('/api/admin/taller', completo({ nombre: '  Con espacios  ', instagram: 'mg.detail_ing' }))).body.taller).toMatchObject({
      nombre: 'Con espacios',
      instagram: 'mg.detail_ing',
    });
  });

  it('límites válidos: nombre de 80, dirección de 160, leyenda de 300, teléfono de 8 y de 15 dígitos, Instagram de 30', async () => {
    const { admin } = await equipo();
    const ok = completo({
      nombre: 'n'.repeat(80),
      direccion: 'd'.repeat(160),
      leyendaPdf: 'l'.repeat(300),
      telefono: '12345678',
      instagram: 'i'.repeat(30),
    });
    expect((await admin.put('/api/admin/taller', ok)).status).toBe(200);
    expect((await admin.put('/api/admin/taller', completo({ telefono: '123456789012345' }))).status).toBe(200);
  });

  it('400 con el campo en cada formato inválido', async () => {
    const { admin } = await equipo();
    const casos: [Record<string, unknown>, string][] = [
      [completo({ nombre: '' }), 'nombre'],
      [completo({ nombre: '   ' }), 'nombre'],
      [completo({ nombre: 'n'.repeat(81) }), 'nombre'],
      [completo({ nombre: 'a\nb' }), 'nombre'],
      [completo({ nombre: null }), 'nombre'],
      [completo({ telefono: '+54 9 380 478-1737' }), 'telefono'],
      [completo({ telefono: '1234567' }), 'telefono'],
      [completo({ telefono: '1234567890123456' }), 'telefono'],
      [completo({ telefono: 5493804781737 }), 'telefono'],
      [completo({ instagram: '@mgdetailing' }), 'instagram'],
      [completo({ instagram: 'mg detailing' }), 'instagram'],
      [completo({ instagram: 'i'.repeat(31) }), 'instagram'],
      [completo({ instagram: 'https://instagram.com/mg' }), 'instagram'],
      [completo({ cuit: '123' }), 'cuit'],
      [completo({ cuit: '2012345678-9' }), 'cuit'],
      [completo({ cuit: '20-1234567-89' }), 'cuit'],
      [completo({ cuit: '20-12345678-X' }), 'cuit'],
      [completo({ direccion: 'd'.repeat(161) }), 'direccion'],
      [completo({ direccion: 'a\tb' }), 'direccion'],
      [completo({ leyendaPdf: 'l'.repeat(301) }), 'leyendaPdf'],
      [completo({ leyendaPdf: 'línea 1\nlínea 2' }), 'leyendaPdf'],
      [completo({ id: 2 }), 'id'],
    ];
    for (const [body, campo] of casos) {
      const r = await admin.put('/api/admin/taller', body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(r.body.error.fields), JSON.stringify(body)).toEqual([campo]);
    }
    const sinNombre = await admin.put('/api/admin/taller', {});
    expect(Object.keys(sinNombre.body.error.fields)).toEqual(['nombre']);
    // nada de lo inválido se guardó
    expect((await admin.get('/api/admin/taller')).body.taller.nombre).toBe('MgDetailing');
  });
});

describe('TallerService (lo que lee el generador de PDF) y la tabla', () => {
  it('obtener() devuelve los datos actuales sin pasar por la API', async () => {
    const { context, admin } = await equipo();
    await admin.put('/api/admin/taller', completo({ nombre: 'Otro nombre' }));
    const servicio = new TallerService({
      taller: new PostgresTallerRepository(context.db.appSql),
      logger: new MemoryLogger(),
      now: () => context.clock.current,
    });
    expect(await servicio.obtener()).toEqual(completo({ nombre: 'Otro nombre' }));
  });

  it('una sola fila: la app no puede insertar otra ni borrarla, y los CHECK de la base se cumplen', async () => {
    const { context } = await equipo();
    await expect(context.db.appSql.query("INSERT INTO mgdetailing.taller (id, nombre) VALUES (2, 'x')")).rejects.toThrow(/permission denied/);
    await expect(context.db.appSql.query('DELETE FROM mgdetailing.taller')).rejects.toThrow(/permission denied/);
    await expect(context.db.sql.query("INSERT INTO mgdetailing.taller (id, nombre) VALUES (2, 'x')")).rejects.toThrow(/taller_una_sola_fila/);
    await expect(context.db.sql.query("UPDATE mgdetailing.taller SET telefono = '12ab'")).rejects.toThrow(/taller_telefono_formato/);
    await expect(context.db.sql.query("UPDATE mgdetailing.taller SET instagram = '@mg'")).rejects.toThrow(/taller_instagram_formato/);
    await expect(context.db.sql.query("UPDATE mgdetailing.taller SET cuit = '1-2-3'")).rejects.toThrow(/taller_cuit_formato/);
    await expect(context.db.appSql.query('UPDATE mgdetailing.taller SET id = 1')).rejects.toThrow(/permission denied/);
  });
});
