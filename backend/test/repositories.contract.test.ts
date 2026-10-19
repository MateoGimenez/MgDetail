import { afterEach, describe, expect, it } from 'vitest';
import type { NewBooking } from '../src/domain/booking.js';
import { SinSuperadminError } from '../src/domain/perfil.js';
import { type Repositories, createPostgresRepositories } from '../src/repositories/index.js';
import { NOW } from './helpers.js';
import { type PgliteDatabase, createPgliteDatabase } from './pglite.js';

/**
 * Repositorios sobre Postgres (PGlite en memoria con las migraciones de supabase/migrations/), usados como el rol
 * dedicado de producción (mgdetailing_app): si le faltara un GRANT o una policy, estos tests fallan.
 */

const opened: PgliteDatabase[] = [];
afterEach(async () => {
  for (const database of opened.splice(0)) await database.close();
});

async function open(): Promise<{ repositories: Repositories; db: PgliteDatabase }> {
  const db = await createPgliteDatabase();
  opened.push(db);
  return { repositories: createPostgresRepositories(db.appSql), db };
}

async function repos(): Promise<Repositories> {
  return (await open()).repositories;
}

function newBooking(overrides: Partial<NewBooking> = {}): NewBooking {
  return {
    nombre: 'Juan Pérez',
    telefono: '0380 15-4123456',
    email: 'juan@example.com',
    vehiculoTipo: 'auto',
    vehiculoModelo: 'Toyota Corolla',
    servicioId: 'pulido',
    fechaPreferida: '2026-10-20',
    franja: 'manana',
    comentario: 'Rayones en el capot',
    ...overrides,
  };
}

describe('turnos', () => {
  it('crea un turno pendiente y lo devuelve con el mismo mapeo (camelCase, fechas ISO, telefonoWhatsapp)', async () => {
    const { bookings } = await repos();

    const created = await bookings.create(newBooking(), NOW);
    const minimal = await bookings.create(
      newBooking({ email: null, vehiculoModelo: null, comentario: null, telefono: '12345678', franja: 'tarde' }),
      NOW,
    );

    expect(created).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      nombre: 'Juan Pérez',
      telefono: '0380 15-4123456',
      telefonoWhatsapp: '5493804123456',
      email: 'juan@example.com',
      vehiculoTipo: 'auto',
      vehiculoModelo: 'Toyota Corolla',
      servicioId: 'pulido',
      fechaPreferida: '2026-10-20',
      franja: 'manana',
      comentario: 'Rayones en el capot',
      estado: 'pendiente',
      createdAt: '2026-10-16T15:00:00.000Z',
      updatedAt: '2026-10-16T15:00:00.000Z',
    });
    expect(minimal).toMatchObject({ email: null, vehiculoModelo: null, comentario: null, telefonoWhatsapp: null });
  });

  it('lista más nuevos primero (estable con el mismo created_at), filtra por estado y pagina con total', async () => {
    const { bookings } = await repos();
    const ids: string[] = [];
    for (const nombre of ['Ana', 'Beto', 'Caro', 'Dani']) {
      ids.push((await bookings.create(newBooking({ nombre }), NOW)).id);
    }
    await bookings.updateEstado(ids[1] ?? '', 'confirmado', NOW);
    await bookings.updateEstado(ids[3] ?? '', 'confirmado', NOW);

    const all = await bookings.list({ limit: 50, offset: 0 });
    expect(all.total).toBe(4);
    expect(all.bookings.map((booking) => booking.nombre)).toEqual(['Dani', 'Caro', 'Beto', 'Ana']);

    const page = await bookings.list({ limit: 2, offset: 1 });
    expect(page).toMatchObject({ total: 4, bookings: [{ nombre: 'Caro' }, { nombre: 'Beto' }] });

    const confirmados = await bookings.list({ estado: 'confirmado', limit: 1, offset: 0 });
    expect(confirmados.total).toBe(2);
    expect(confirmados.bookings.map((booking) => booking.nombre)).toEqual(['Dani']);

    expect(await bookings.list({ estado: 'cancelado', limit: 50, offset: 0 })).toEqual({ bookings: [], total: 0 });
  });

  it('cambia el estado (y updatedAt), borra, y un id inexistente o mal formado no existe', async () => {
    const { bookings } = await repos();
    const { id } = await bookings.create(newBooking(), NOW);
    const later = new Date('2026-10-17T10:30:00.000Z');

    const updated = await bookings.updateEstado(id, 'completado', later);
    expect(updated).toMatchObject({ id, estado: 'completado', createdAt: NOW.toISOString(), updatedAt: later.toISOString() });

    const missing = '00000000-0000-4000-8000-000000000000';
    for (const unknown of [missing, 'no-es-un-uuid']) {
      expect(await bookings.updateEstado(unknown, 'cancelado', later)).toBeUndefined();
      expect(await bookings.delete(unknown)).toBe(false);
    }

    expect(await bookings.delete(id)).toBe(true);
    expect(await bookings.delete(id)).toBe(false);
    expect((await bookings.list({ limit: 50, offset: 0 })).total).toBe(0);
  });

});

describe('integridad en la base', () => {
  it('un turno con un servicio que no está en mgdetailing.servicios se rechaza por la FK', async () => {
    const { bookings } = await repos();

    // El cast salta el tipo ServicioId a propósito: zod lo frena antes, esto prueba la última línea de defensa.
    await expect(bookings.create(newBooking({ servicioId: 'teletransporte' as 'pulido' }), NOW)).rejects.toThrow(
      /bookings_servicio_id_fkey/,
    );
    expect((await bookings.list({ limit: 50, offset: 0 })).total).toBe(0);
  });
});

describe('perfiles', () => {
  async function usuario(db: PgliteDatabase, email: string, rol = 'empleado', activo = false): Promise<string> {
    const { rows } = await db.sql.query('INSERT INTO auth.users (email) VALUES ($1) RETURNING id::text AS id', [email]);
    const id = String(rows[0]?.id);
    await db.sql.query('UPDATE mgdetailing.perfiles SET rol_id = $2, activo = $3 WHERE id = $1::uuid', [id, rol, activo]);
    return id;
  }

  it('findForSession devuelve el perfil y si la sesión sigue en auth.sessions; un id mal formado no existe', async () => {
    const { repositories, db } = await open();
    const id = await usuario(db, 'Ana@MgDetailing.test', 'admin', true);
    const sessionId = '11111111-1111-4111-8111-111111111111';

    expect(await repositories.perfiles.findForSession(id, sessionId)).toEqual({
      perfil: {
        id,
        email: 'ana@mgdetailing.test',
        nombre: null,
        rol: 'admin',
        activo: true,
        createdAt: expect.stringMatching(/Z$/),
        updatedAt: expect.stringMatching(/Z$/),
      },
      sesionVigente: false,
    });

    await db.sql.query('INSERT INTO auth.sessions (id, user_id) VALUES ($1::uuid, $2::uuid)', [sessionId, id]);
    expect((await repositories.perfiles.findForSession(id, sessionId))?.sesionVigente).toBe(true);
    await db.sql.query("UPDATE auth.sessions SET not_after = '2000-01-01T00:00:00Z'");
    expect((await repositories.perfiles.findForSession(id, sessionId))?.sesionVigente).toBe(false);

    expect(await repositories.perfiles.findForSession('no-es-un-uuid', sessionId)).toBeUndefined();
    expect(await repositories.perfiles.findForSession('22222222-2222-4222-8222-222222222222', sessionId)).toBeUndefined();
  });

  it('update cambia solo lo indicado, borra el nombre con null y no deja el sistema sin superadmin activo', async () => {
    const { repositories, db } = await open();
    const jefe = await usuario(db, 'jefe@mgdetailing.test', 'superadmin', true);
    const ana = await usuario(db, 'ana@mgdetailing.test');
    const later = new Date('2026-10-17T10:30:00.000Z');

    expect(await repositories.perfiles.update(ana, { nombre: 'Ana', activo: true }, later)).toMatchObject({
      rol: 'empleado',
      activo: true,
      nombre: 'Ana',
      updatedAt: later.toISOString(),
    });
    expect(await repositories.perfiles.update(ana, { nombre: null }, later)).toMatchObject({ nombre: null, activo: true });
    expect(await repositories.perfiles.update('22222222-2222-4222-8222-222222222222', { activo: true }, later)).toBeUndefined();

    await expect(repositories.perfiles.update(jefe, { rol: 'admin' }, later)).rejects.toBeInstanceOf(SinSuperadminError);
    await repositories.perfiles.update(ana, { rol: 'superadmin' }, later);
    expect(await repositories.perfiles.update(jefe, { activo: false }, later)).toMatchObject({ activo: false });

    expect((await repositories.perfiles.list()).map((perfil) => perfil.email)).toEqual([
      'jefe@mgdetailing.test',
      'ana@mgdetailing.test',
    ]);
  });
});
