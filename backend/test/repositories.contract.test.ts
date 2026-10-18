import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrations.js';
import type { NewBooking } from '../src/domain/booking.js';
import { type Repositories, createPostgresRepositories, createSqliteRepositories } from '../src/repositories/index.js';
import { NOW } from './helpers.js';
import { createPgliteDatabase } from './pglite.js';

/**
 * Contrato de los repositorios: la MISMA batería corre contra SQLite y contra Postgres (PGlite en memoria, con las
 * migraciones de supabase/migrations/). Si un motor se comporta distinto, rutas y servicios dejarían de valer.
 */

interface Engine {
  repositories: Repositories;
  close: () => Promise<void>;
}

const ENGINES: readonly [string, () => Promise<Engine>][] = [
  [
    'SQLite',
    () => {
      const db = openDatabase(':memory:');
      migrate(db);
      return Promise.resolve({
        repositories: createSqliteRepositories(db),
        close: () => {
          db.close();
          return Promise.resolve();
        },
      });
    },
  ],
  [
    'Postgres (PGlite, rol mgdetailing_app)',
    async () => {
      // Como el rol dedicado de producción: si le faltara un GRANT o una policy, el contrato falla.
      const database = await createPgliteDatabase({ asAppRole: true });
      return { repositories: createPostgresRepositories(database.sql), close: database.close };
    },
  ],
];

const opened: Engine[] = [];
afterEach(async () => {
  for (const engine of opened.splice(0)) await engine.close();
});

const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const HASH = '$scrypt$ln=10,r=8,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA';

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

describe.each(ENGINES)('contrato de repositorios: %s', (_name, open) => {
  async function repos(): Promise<Repositories> {
    const engine = await open();
    opened.push(engine);
    return engine.repositories;
  }

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

  it('admins: busca por email sin distinguir mayúsculas; guardar de nuevo actualiza la contraseña', async () => {
    const { admins } = await repos();

    const first = await admins.save('Dueno@MgDetailing.com', HASH, NOW);
    expect(first.created).toBe(true);
    expect(await admins.findByEmail('DUENO@mgdetailing.COM')).toEqual({
      id: first.id,
      email: 'dueno@mgdetailing.com',
      passwordHash: HASH,
    });

    const second = await admins.save('dueno@mgdetailing.com', `${HASH}x`, NOW);
    expect(second).toEqual({ id: first.id, created: false });
    expect((await admins.findByEmail('dueno@mgdetailing.com'))?.passwordHash).toBe(`${HASH}x`);
    expect(await admins.findByEmail('otro@mgdetailing.com')).toBeUndefined();
  });

  it('sesiones: crear, encontrar vigente, vencer, revocar una o todas, y purgar las vencidas', async () => {
    const { admins, sessions } = await repos();
    const { id: adminId } = await admins.save('dueno@mgdetailing.com', HASH, NOW);
    const [a, b, c] = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];

    await sessions.create(a, adminId, NOW_SECONDS + 3600, NOW);
    await sessions.create(b, adminId, NOW_SECONDS + 7200, NOW);
    await sessions.create(c, adminId, NOW_SECONDS + 60, NOW);

    expect(await sessions.findActive(a, adminId, NOW_SECONDS)).toEqual({ sessionId: a, adminId, email: 'dueno@mgdetailing.com' });
    expect(await sessions.findActive(a, adminId + 1, NOW_SECONDS)).toBeUndefined(); // otro admin
    expect(await sessions.findActive(a, adminId, NOW_SECONDS + 3600)).toBeUndefined(); // vencida justo en exp
    expect(await sessions.findActive('no-es-un-uuid', adminId, NOW_SECONDS)).toBeUndefined();

    expect(await sessions.purgeExpired(NOW_SECONDS + 60)).toBe(1); // solo c
    await sessions.delete(a);
    expect(await sessions.findActive(a, adminId, NOW_SECONDS)).toBeUndefined();
    expect(await sessions.findActive(b, adminId, NOW_SECONDS)).toBeDefined();

    expect(await sessions.deleteAllForAdmin(adminId)).toBe(1);
    expect(await sessions.findActive(b, adminId, NOW_SECONDS)).toBeUndefined();
  });
});

describe('Postgres: integridad que SQLite no tiene', () => {
  it('un turno con un servicio que no está en mgdetailing.servicios se rechaza por la FK', async () => {
    const database = await createPgliteDatabase();
    opened.push({ repositories: createPostgresRepositories(database.sql), close: database.close });
    const { bookings } = createPostgresRepositories(database.sql);

    // El cast salta el tipo ServicioId a propósito: zod lo frena antes, esto prueba la última línea de defensa.
    await expect(bookings.create(newBooking({ servicioId: 'teletransporte' as 'pulido' }), NOW)).rejects.toThrow(
      /bookings_servicio_id_fkey/,
    );
    expect((await bookings.list({ limit: 50, offset: 0 })).total).toBe(0);
  });
});
