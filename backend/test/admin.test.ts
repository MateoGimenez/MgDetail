import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { PostgresBookingRepository } from '../src/repositories/postgres/bookings.js';
import {
  NOW,
  type Client,
  type TestContext,
  addAdmin,
  closeAllContexts,
  countRows,
  createClient,
  cookieHeader,
  createTestContext,
  loginClient,
  validBooking,
} from './helpers.js';

afterEach(closeAllContexts);

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

async function adminContext(): Promise<{ context: TestContext; admin: Client }> {
  const context = await createTestContext();
  await addAdmin(context);
  const admin = await loginClient(context);
  return { context, admin };
}

/** Crea turnos por la API pública y devuelve sus ids en orden de creación. */
async function createBookings(context: TestContext, names: string[], overrides: Record<string, unknown> = {}): Promise<string[]> {
  const publicClient = createClient(context.app);
  const ids: string[] = [];
  for (const nombre of names) {
    const response = await publicClient.post('/api/bookings', validBooking({ nombre, ...overrides }));
    expect(response.status, nombre).toBe(201);
    ids.push((response.body as { booking: { id: string } }).booking.id);
  }
  return ids;
}

describe('rutas /api/admin sin sesión', () => {
  it('GET, PATCH y DELETE de turnos devuelven 401 UNAUTHORIZED', async () => {
    const context = await createTestContext();
    await addAdmin(context);
    const anonymous = createClient(context.app);
    const id = randomUUID();

    const responses = [
      await anonymous.get('/api/admin/bookings'),
      await anonymous.patch(`/api/admin/bookings/${id}`, { estado: 'confirmado' }),
      await anonymous.delete(`/api/admin/bookings/${id}`),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    }
  });
});

describe('GET /api/admin/bookings', () => {

  it('devuelve los turnos con todos los campos del contrato, en camelCase y fechas ISO 8601', async () => {
    const { context, admin } = await adminContext();
    const [id] = await createBookings(context, ['María Gómez']);
    const response = await admin.get('/api/admin/bookings');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    const booking = (response.body as { bookings: Record<string, unknown>[] }).bookings[0];
    expect(booking).toEqual({
      id,
      nombre: 'María Gómez',
      telefono: '+54 9 380 412-3456',
      telefonoWhatsapp: '5493804123456',
      email: 'juan@example.com',
      vehiculoTipo: 'auto',
      vehiculoModelo: 'Toyota Corolla 2020',
      servicioId: 'pulido',
      fechaPreferida: '2026-10-20',
      franja: 'manana',
      fechaConfirmada: null,
      franjaConfirmada: null,
      comentario: 'Tiene rayones en el capot.',
      estado: 'pendiente',
      notasInternas: null,
      turnosDelCliente: 1,
      createdAt: '2026-10-16T15:00:00.000Z',
      updatedAt: '2026-10-16T15:00:00.000Z',
    });
    expect(booking?.createdAt).toMatch(ISO_TIMESTAMP);
  });

  it('un teléfono válido para el formulario pero no interpretable da telefonoWhatsapp null (y el turno igual se guarda)', async () => {
    const { context, admin } = await adminContext();
    await createBookings(context, ['Número raro'], { telefono: '1234-5678' });
    const response = await admin.get('/api/admin/bookings');

    expect(response.body.bookings[0]).toMatchObject({ telefono: '1234-5678', telefonoWhatsapp: null });
  });

  it('telefonoWhatsapp se guarda al crear (columna telefono_whatsapp) y también sale en PATCH', async () => {
    const { context, admin } = await adminContext();
    const [id] = await createBookings(context, ['Cliente'], { telefono: '+1 415 555 2671' });

    const { rows } = await context.db.sql.query(
      'SELECT telefono_whatsapp FROM mgdetailing.bookings WHERE id = $1::uuid',
      [id],
    );
    expect(rows[0]?.telefono_whatsapp).toBe('14155552671');

    const patched = await admin.patch(`/api/admin/bookings/${id ?? ''}`, { estado: 'confirmado' });
    expect(patched.body.booking).toMatchObject({ telefono: '+1 415 555 2671', telefonoWhatsapp: '14155552671' });
  });

  it('ordena de la más nueva a la más vieja (incluso con el mismo timestamp)', async () => {
    const { context, admin } = await adminContext();
    await createBookings(context, ['Uno', 'Dos', 'Tres']);
    const response = await admin.get('/api/admin/bookings');

    const names = (response.body as { bookings: { nombre: string }[] }).bookings.map((booking) => booking.nombre);
    expect(names).toEqual(['Tres', 'Dos', 'Uno']);
  });

  it('filtra por estado y `total` cuenta solo los que cumplen el filtro', async () => {
    const { context, admin } = await adminContext();
    const [uno, dos, tres] = await createBookings(context, ['Uno', 'Dos', 'Tres']);
    await admin.patch(`/api/admin/bookings/${dos ?? ''}`, { estado: 'confirmado' });
    await admin.patch(`/api/admin/bookings/${tres ?? ''}`, { estado: 'cancelado' });

    const pendientes = await admin.get('/api/admin/bookings?estado=pendiente');
    expect(pendientes.body.total).toBe(1);
    expect((pendientes.body as { bookings: { id: string }[] }).bookings.map((b) => b.id)).toEqual([uno]);

    const confirmados = await admin.get('/api/admin/bookings?estado=confirmado');
    expect(confirmados.body.total).toBe(1);
    expect((confirmados.body as { bookings: { id: string }[] }).bookings.map((b) => b.id)).toEqual([dos]);

    const completados = await admin.get('/api/admin/bookings?estado=completado');
    expect(completados.body).toEqual({ bookings: [], total: 0 });

    const todos = await admin.get('/api/admin/bookings');
    expect(todos.body.total).toBe(3);
  });

  it('pagina con limit y offset; `total` es el total sin paginar', async () => {
    const { context, admin } = await adminContext();
    await createBookings(context, ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco']);

    const first = await admin.get('/api/admin/bookings?limit=2&offset=0');
    expect((first.body as { bookings: { nombre: string }[] }).bookings.map((b) => b.nombre)).toEqual(['Cinco', 'Cuatro']);
    expect(first.body.total).toBe(5);

    const second = await admin.get('/api/admin/bookings?limit=2&offset=2');
    expect((second.body as { bookings: { nombre: string }[] }).bookings.map((b) => b.nombre)).toEqual(['Tres', 'Dos']);

    const last = await admin.get('/api/admin/bookings?limit=2&offset=4');
    expect((last.body as { bookings: { nombre: string }[] }).bookings.map((b) => b.nombre)).toEqual(['Uno']);

    const beyond = await admin.get('/api/admin/bookings?limit=2&offset=50');
    expect(beyond.body).toEqual({ bookings: [], total: 5 });
  });

  it('el límite por defecto es 50 y el máximo 100', async () => {
    const { context, admin } = await adminContext();
    const repository = new PostgresBookingRepository(context.db.sql);
    for (let index = 0; index < 120; index++) {
      await repository.create(
        {
          nombre: `Cliente ${String(index)}`,
          telefono: '3804123456',
          email: null,
          vehiculoTipo: 'auto',
          vehiculoModelo: null,
          servicioId: 'pulido',
          fechaPreferida: '2026-10-20',
          franja: 'manana',
          comentario: null,
        },
        NOW,
      );
    }

    const byDefault = await admin.get('/api/admin/bookings');
    expect(byDefault.body.bookings).toHaveLength(50);
    expect(byDefault.body.total).toBe(120);

    const max = await admin.get('/api/admin/bookings?limit=100');
    expect(max.body.bookings).toHaveLength(100);

    const tooMany = await admin.get('/api/admin/bookings?limit=101');
    expect(tooMany.status).toBe(400);
  });

  const invalidQueries: [query: string, field: string][] = [
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['limit=abc', 'limit'],
    ['offset=-1', 'offset'],
    ['estado=pendientes', 'estado'],
  ];

  it.each(invalidQueries)('query inválida "%s" => 400 VALIDATION_ERROR sobre `%s`', async (query, field) => {
    const { admin } = await adminContext();
    const response = await admin.get(`/api/admin/bookings?${encodeURI(query)}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(response.body.error.fields as object)).toEqual([field]);
  });
});

describe('logs del panel', () => {
  it('listar turnos no escribe datos personales ni la query en el log', async () => {
    const { context, admin } = await adminContext();
    await createBookings(context, ['Persona Privada']);
    await admin.get('/api/admin/bookings?estado=pendiente');

    const line = context.logger.lines.find((entry) => entry.includes('GET /api/admin/bookings'));
    expect(line).toMatch(/^INFO GET \/api\/admin\/bookings 200 \d+\.\dms$/);
    expect(context.logger.text).not.toContain('Persona Privada');
  });
});

describe('PATCH /api/admin/bookings/:id', () => {
  it('cambia el estado, devuelve { booking } y actualiza updatedAt', async () => {
    const { context, admin } = await adminContext();
    const [id] = await createBookings(context, ['Cliente']);

    context.clock.current = new Date(NOW.getTime() + 5 * 60_000);
    const response = await admin.patch(`/api/admin/bookings/${id ?? ''}`, { estado: 'confirmado' });

    expect(response.status).toBe(200);
    expect(response.body.booking).toMatchObject({
      id,
      estado: 'confirmado',
      createdAt: '2026-10-16T15:00:00.000Z',
      updatedAt: '2026-10-16T15:05:00.000Z',
    });
    expect(Object.keys(response.body as object)).toEqual(['booking']);
  });

  it('id inexistente => 404 NOT_FOUND', async () => {
    const { admin } = await adminContext();
    const response = await admin.patch(`/api/admin/bookings/${randomUUID()}`, { estado: 'confirmado' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No encontramos ese turno.' } });
  });

  it('id con formato inválido => 404 (nunca llega a la base)', async () => {
    const { admin } = await adminContext();
    for (const id of ['123', 'no-es-un-uuid', "1' OR '1'='1", '..%2F..%2Fetc', '00000000-0000-0000-0000-00000000000']) {
      const response = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'confirmado' });
      expect(response.status, id).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('estado inválido, faltante o campos extra => 400 con `fields`', async () => {
    const { context, admin } = await adminContext();
    const [id] = await createBookings(context, ['Cliente']);
    const url = `/api/admin/bookings/${id ?? ''}`;

    const invalid = await admin.patch(url, { estado: 'archivado' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.fields).toEqual({
      estado: 'El estado tiene que ser pendiente, confirmado, completado o cancelado.',
    });

    const missing = await admin.patch(url, {});
    expect(missing.status).toBe(400);
    expect(Object.keys(missing.body.error.fields as object)).toEqual(['estado']);

    const extra = await admin.patch(url, { estado: 'confirmado', nombre: 'Otro Nombre' });
    expect(extra.status).toBe(400);
    expect(Object.keys(extra.body.error.fields as object)).toEqual(['nombre']);

    // No se modificó nada.
    const list = await admin.get('/api/admin/bookings');
    expect(list.body.bookings[0]).toMatchObject({ estado: 'pendiente', nombre: 'Cliente' });
  });
});

describe('DELETE /api/admin/bookings/:id', () => {
  it('borra el turno: 204 sin body; después no aparece y borrarlo otra vez da 404', async () => {
    const { context, admin } = await adminContext();
    const [uno, dos] = await createBookings(context, ['Uno', 'Dos']);

    const response = await admin.delete(`/api/admin/bookings/${uno ?? ''}`);
    expect(response.status).toBe(204);
    expect(response.text).toBe('');

    const list = await admin.get('/api/admin/bookings');
    expect(list.body.total).toBe(1);
    expect((list.body as { bookings: { id: string }[] }).bookings.map((b) => b.id)).toEqual([dos]);

    const again = await admin.delete(`/api/admin/bookings/${uno ?? ''}`);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('NOT_FOUND');
    expect((await admin.patch(`/api/admin/bookings/${uno ?? ''}`, { estado: 'confirmado' })).status).toBe(404);
  });
});

describe('defensa CSRF en las rutas de administración', () => {
  it('PATCH y DELETE con un Origin ajeno => 403 FORBIDDEN_ORIGIN aunque haya sesión válida', async () => {
    const { context } = await adminContext();
    const [id] = await createBookings(context, ['Uno']);
    const login = await createClient(context.app).post('/api/auth/login', {
      email: 'dueno@mgdetailing.test',
      password: 'clave-de-prueba-123',
    });
    const cookie = cookieHeader(login);

    const patch = await request(context.app)
      .patch(`/api/admin/bookings/${id ?? ''}`)
      .set('Origin', 'https://sitio-malicioso.example')
      .set('Content-Type', 'application/json')
      .set('Cookie', cookie)
      .send({ estado: 'cancelado' });
    expect(patch.status).toBe(403);
    expect(patch.body.error.code).toBe('FORBIDDEN_ORIGIN');

    const del = await request(context.app)
      .delete(`/api/admin/bookings/${id ?? ''}`)
      .set('Origin', 'https://sitio-malicioso.example')
      .set('Content-Type', 'application/json')
      .set('Cookie', cookie);
    expect(del.status).toBe(403);

    expect(await countRows(context.db, 'bookings')).toBe(1); // sigue ahí, sin modificar
  });

  it('un formulario clásico (application/x-www-form-urlencoded) con sesión => 415', async () => {
    const { context } = await adminContext();
    const [id] = await createBookings(context, ['Uno']);
    const login = await createClient(context.app).post('/api/auth/login', {
      email: 'dueno@mgdetailing.test',
      password: 'clave-de-prueba-123',
    });
    const cookie = cookieHeader(login);

    const response = await request(context.app)
      .patch(`/api/admin/bookings/${id ?? ''}`)
      .set('Cookie', cookie)
      .type('form')
      .send({ estado: 'cancelado' });
    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});
