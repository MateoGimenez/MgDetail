import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookingNotifier } from '../src/domain/notifier.js';
import {
  NOW,
  type TestContext,
  closeAllContexts,
  countRows,
  createClient,
  createTestContext,
  loginAs,
  rawPost,
  validBooking,
} from './helpers.js';

/** Catálogo editable: GET /api/servicios y /api/admin/servicios (contrato: reportes/2026-10-22_07_catalogo-editable.md). */

afterEach(closeAllContexts);

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const IDS_INICIALES = ['lavado-basico', 'lavado-premium', 'pulido', 'encerado', 'restauracion-opticas'];
const CAMPOS_PUBLICOS = ['descripcion', 'destacado', 'duracion', 'glosario', 'id', 'incluye', 'nombre', 'precioDesde', 'resumen'];
const CAMPOS_PANEL = [...CAMPOS_PUBLICOS, 'activo', 'orden', 'updatedAt'].sort();

function nuevoServicio(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tratamiento-ceramico',
    nombre: 'Tratamiento cerámico',
    resumen: 'Protección de larga duración para la pintura.',
    descripcion: 'Aplicamos una capa cerámica.\nDura meses.',
    ...overrides,
  };
}

async function editor(rol: 'admin' | 'superadmin' = 'admin') {
  const context = await createTestContext();
  const { client } = await loginAs(context, rol);
  return { context, client };
}

const ids = (body: { servicios: { id: string }[] }): string[] => body.servicios.map((servicio) => servicio.id);

describe('GET /api/servicios (público)', () => {
  it('sin sesión: solo los activos, en orden, solo con los campos públicos', async () => {
    const context = await createTestContext();
    const { client } = await loginAs(context, 'admin');
    await client.patch('/api/admin/servicios/encerado', { activo: false }).expect(200);

    const response = await createClient(context.app).get('/api/servicios');

    expect(response.status).toBe(200);
    expect(ids(response.body)).toEqual(IDS_INICIALES.filter((id) => id !== 'encerado'));
    for (const servicio of response.body.servicios) {
      expect(Object.keys(servicio).sort()).toEqual(CAMPOS_PUBLICOS);
    }
    expect(response.body.servicios[1]).toMatchObject({ id: 'lavado-premium', destacado: true, precioDesde: null });
  });
});

describe('GET /api/admin/servicios', () => {
  it('sin sesión 401; con cualquier rol (también empleado) devuelve todos, inactivos incluidos', async () => {
    const context = await createTestContext();
    expect((await createClient(context.app).get('/api/admin/servicios')).status).toBe(401);

    const { client: admin } = await loginAs(context, 'admin');
    await admin.patch('/api/admin/servicios/pulido', { activo: false }).expect(200);

    const { client: empleado } = await loginAs(context, 'empleado');
    const response = await empleado.get('/api/admin/servicios');
    expect(response.status).toBe(200);
    expect(ids(response.body)).toEqual(IDS_INICIALES);
    const pulido = response.body.servicios[2];
    expect(Object.keys(pulido).sort()).toEqual(CAMPOS_PANEL);
    expect(pulido).toMatchObject({ id: 'pulido', activo: false, orden: 30, updatedAt: NOW.toISOString() });
  });
});

describe('permisos: empleado solo lee el catálogo', () => {
  it('POST, PATCH y PUT /orden devuelven 403 FORBIDDEN (antes de validar) y no cambian nada', async () => {
    const context = await createTestContext();
    const { client } = await loginAs(context, 'empleado');

    const responses = [
      await client.post('/api/admin/servicios', nuevoServicio()),
      await client.post('/api/admin/servicios', {}),
      await client.patch('/api/admin/servicios/pulido', { nombre: 'Otro' }),
      await client.put('/api/admin/servicios/orden', { ids: [...IDS_INICIALES].reverse() }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }

    const { body } = await client.get('/api/admin/servicios');
    expect(ids(body)).toEqual(IDS_INICIALES);
    expect(body.servicios[2].nombre).toBe('Pulido');
  });
});

describe('POST /api/admin/servicios', () => {
  it.each(['admin', 'superadmin'] as const)('%s crea un servicio con defaults, al final del orden (201)', async (rol) => {
    const { context, client } = await editor(rol);
    const response = await client.post('/api/admin/servicios', nuevoServicio({ nombre: '  Tratamiento cerámico  ' }));

    expect(response.status).toBe(201);
    expect(response.body.servicio).toEqual({
      id: 'tratamiento-ceramico',
      nombre: 'Tratamiento cerámico',
      resumen: 'Protección de larga duración para la pintura.',
      descripcion: 'Aplicamos una capa cerámica.\nDura meses.',
      incluye: [],
      glosario: [],
      duracion: null,
      precioDesde: null,
      destacado: false,
      activo: true,
      orden: 60,
      updatedAt: expect.stringMatching(ISO_TIMESTAMP),
    });
    expect(context.logger.text).toMatch(/Servicio creado id=tratamiento-ceramico por=/);
    expect(context.logger.text).not.toContain('Protección de larga');
  });

  it('un id que ya existe (activo o no) => 409 SERVICIO_EXISTE', async () => {
    const { client } = await editor();
    await client.patch('/api/admin/servicios/pulido', { activo: false }).expect(200);

    for (const id of ['lavado-basico', 'pulido']) {
      const response = await client.post('/api/admin/servicios', nuevoServicio({ id }));
      expect(response.status, id).toBe(409);
      expect(response.body.error.code).toBe('SERVICIO_EXISTE');
      expect(response.body.error.fields).toHaveProperty('id');
    }
  });

  it('crear uno destacado desmarca al anterior', async () => {
    const { client } = await editor();
    await client.post('/api/admin/servicios', nuevoServicio({ destacado: true })).expect(201);

    const { body } = await client.get('/api/admin/servicios');
    expect(body.servicios.filter((s: { destacado: boolean }) => s.destacado).map((s: { id: string }) => s.id)).toEqual([
      'tratamiento-ceramico',
    ]);
  });

  const invalid: [label: string, body: Record<string, unknown>, field: string][] = [
    ['id con mayúsculas', nuevoServicio({ id: 'Ceramico' }), 'id'],
    ['id con guion al final', nuevoServicio({ id: 'ceramico-' }), 'id'],
    ['id de 65 caracteres', nuevoServicio({ id: 'a'.repeat(65) }), 'id'],
    ['sin nombre', nuevoServicio({ nombre: undefined }), 'nombre'],
    ['nombre solo con espacios', nuevoServicio({ nombre: '   ' }), 'nombre'],
    ['nombre de 81 caracteres', nuevoServicio({ nombre: 'x'.repeat(81) }), 'nombre'],
    ['nombre con salto de línea', nuevoServicio({ nombre: 'a\nb' }), 'nombre'],
    ['resumen de 201 caracteres', nuevoServicio({ resumen: 'x'.repeat(201) }), 'resumen'],
    ['descripción de 1501 caracteres', nuevoServicio({ descripcion: 'x'.repeat(1501) }), 'descripcion'],
    ['16 ítems en incluye', nuevoServicio({ incluye: Array.from({ length: 16 }, () => 'x') }), 'incluye'],
    ['ítem vacío en incluye', nuevoServicio({ incluye: ['ok', ' '] }), 'incluye.1'],
    ['ítem de 121 caracteres', nuevoServicio({ incluye: ['x'.repeat(121)] }), 'incluye.0'],
    ['glosario sin significado', nuevoServicio({ glosario: [{ termino: 'a' }] }), 'glosario.0.significado'],
    ['glosario con campo extra', nuevoServicio({ glosario: [{ termino: 'a', significado: 'b', x: 1 }] }), 'glosario.0.x'],
    ['11 términos', nuevoServicio({ glosario: Array.from({ length: 11 }, () => ({ termino: 'a', significado: 'b' })) }), 'glosario'],
    ['término de 61 caracteres', nuevoServicio({ glosario: [{ termino: 'x'.repeat(61), significado: 'b' }] }), 'glosario.0.termino'],
    ['duración de 61 caracteres', nuevoServicio({ duracion: 'x'.repeat(61) }), 'duracion'],
    ['precio con decimales', nuevoServicio({ precioDesde: 1500.5 }), 'precioDesde'],
    ['precio negativo', nuevoServicio({ precioDesde: -1 }), 'precioDesde'],
    ['precio de 100.000.000', nuevoServicio({ precioDesde: 100_000_000 }), 'precioDesde'],
    ['precio como texto', nuevoServicio({ precioDesde: '25000' }), 'precioDesde'],
    ['destacado no booleano', nuevoServicio({ destacado: 'si' }), 'destacado'],
    ['orden (lo asigna el servidor)', nuevoServicio({ orden: 1 }), 'orden'],
    ['campo desconocido', nuevoServicio({ foto: 'x.jpg' }), 'foto'],
    ['id reservado "orden" (segmento de ruta)', nuevoServicio({ id: 'orden' }), 'id'],
    ['control C0 (BEL) en el resumen', nuevoServicio({ resumen: `a${String.fromCharCode(7)}b` }), 'resumen'],
    ['control C0 en la descripción', nuevoServicio({ descripcion: `a${String.fromCharCode(0)}b` }), 'descripcion'],
    ['control C1 en un ítem', nuevoServicio({ incluye: [`a${String.fromCharCode(0x9b)}b`] }), 'incluye.0'],
    ['tab en el término', nuevoServicio({ glosario: [{ termino: 'a\tb', significado: 'c' }] }), 'glosario.0.termino'],
    ['control en la duración', nuevoServicio({ duracion: `1${String.fromCharCode(27)}h` }), 'duracion'],
    ['destacado e inactivo a la vez', nuevoServicio({ destacado: true, activo: false }), 'destacado'],
  ];

  it.each(invalid)('400 VALIDATION_ERROR: %s', async (_label, body, field) => {
    const { context, client } = await editor();
    const response = await client.post('/api/admin/servicios', body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(response.body.error.fields as object)).toContain(field);
    const { body: catalogo } = await client.get('/api/admin/servicios');
    expect(catalogo.servicios).toHaveLength(5);
    expect(context.logger.errors).toEqual([]);
  });

  it('acepta los topes exactos, duración "" => null y precio 0', async () => {
    const { client } = await editor();
    const response = await client.post(
      '/api/admin/servicios',
      nuevoServicio({
        id: 'a'.repeat(64),
        nombre: 'x'.repeat(80),
        resumen: 'x'.repeat(200),
        descripcion: 'x'.repeat(1500),
        incluye: Array.from({ length: 15 }, () => 'y'.repeat(120)),
        glosario: Array.from({ length: 10 }, () => ({ termino: 't'.repeat(60), significado: 's'.repeat(300) })),
        duracion: '   ',
        precioDesde: 0,
        activo: false,
      }),
    );
    expect(response.status).toBe(201);
    expect(response.body.servicio).toMatchObject({ duracion: null, precioDesde: 0, activo: false });
  });

  it('quita los controles bidireccionales (no los rechaza) y la descripción conserva saltos de línea y tabs', async () => {
    const { client } = await editor();
    const RLO = String.fromCodePoint(0x202e); // construido por código: ver test/source-hygiene.test.ts
    const response = await client.post(
      '/api/admin/servicios',
      nuevoServicio({ nombre: `${RLO}Cerámico`, descripcion: 'Paso 1\n\tPaso 2', incluye: [`Item${RLO}`] }),
    );
    expect(response.status).toBe(201);
    expect(response.body.servicio).toMatchObject({ nombre: 'Cerámico', descripcion: 'Paso 1\n\tPaso 2', incluye: ['Item'] });
  });
});

describe('PATCH /api/admin/servicios/:id', () => {
  it('cambia solo lo indicado; null borra duración y precio', async () => {
    const { context, client } = await editor();
    const later = new Date(NOW.getTime() + 5 * 60_000); // dentro de la vida del access token
    context.clock.current = later;

    const response = await client.patch('/api/admin/servicios/pulido', {
      precioDesde: 85000,
      incluye: ['Pulido en 2 etapas'],
      glosario: [{ termino: 'Etapa', significado: 'una pasada de pulido.' }],
    });
    expect(response.status).toBe(200);
    expect(response.body.servicio).toMatchObject({
      id: 'pulido',
      nombre: 'Pulido',
      precioDesde: 85000,
      incluye: ['Pulido en 2 etapas'],
      glosario: [{ termino: 'Etapa', significado: 'una pasada de pulido.' }],
      duracion: 'Alrededor de 1 día',
      updatedAt: later.toISOString(),
    });

    const cleared = await client.patch('/api/admin/servicios/pulido', { duracion: null, precioDesde: null });
    expect(cleared.body.servicio).toMatchObject({ duracion: null, precioDesde: null, incluye: ['Pulido en 2 etapas'] });
    expect(context.logger.text).toMatch(/Servicio actualizado id=pulido por=\S+ campos=duracion,precioDesde/);
  });

  it('marcar uno como destacado desmarca al anterior (a lo sumo uno)', async () => {
    const { context, client } = await editor();
    await client.patch('/api/admin/servicios/encerado', { destacado: true }).expect(200);

    const publico = await createClient(context.app).get('/api/servicios');
    const destacados = (publico.body.servicios as { id: string; destacado: boolean }[]).filter((s) => s.destacado);
    expect(destacados.map((s) => s.id)).toEqual(['encerado']);
  });

  it('desactivar el destacado lo desmarca en la misma operación (y no queda ningún destacado)', async () => {
    const { context, client } = await editor();

    const response = await client.patch('/api/admin/servicios/lavado-premium', { activo: false });
    expect(response.status).toBe(200);
    expect(response.body.servicio).toMatchObject({ id: 'lavado-premium', activo: false, destacado: false });

    const { body } = await client.get('/api/admin/servicios');
    expect(body.servicios.filter((s: { destacado: boolean }) => s.destacado)).toEqual([]);
    const publico = await createClient(context.app).get('/api/servicios');
    expect(publico.body.servicios.some((s: { destacado: boolean }) => s.destacado)).toBe(false);

    // Reactivarlo no lo vuelve a destacar solo: hay que marcarlo de nuevo.
    const reactivado = await client.patch('/api/admin/servicios/lavado-premium', { activo: true });
    expect(reactivado.body.servicio).toMatchObject({ activo: true, destacado: false });
  });

  it('desactivar uno que no es el destacado no toca al destacado', async () => {
    const { client } = await editor();
    await client.patch('/api/admin/servicios/pulido', { activo: false }).expect(200);
    const { body } = await client.get('/api/admin/servicios');
    expect(body.servicios.filter((s: { destacado: boolean }) => s.destacado).map((s: { id: string }) => s.id)).toEqual([
      'lavado-premium',
    ]);
  });

  it('no se puede destacar un inactivo (400 en destacado), ni desactivar y destacar juntos; el destacado anterior sigue', async () => {
    const { context, client } = await editor();
    await client.patch('/api/admin/servicios/pulido', { activo: false }).expect(200);

    for (const [url, body] of [
      ['/api/admin/servicios/pulido', { destacado: true }],
      ['/api/admin/servicios/pulido', { destacado: true, nombre: 'Pulido nuevo' }],
      ['/api/admin/servicios/encerado', { activo: false, destacado: true }],
    ] as const) {
      const response = await client.patch(url, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.fields).toEqual({ destacado: 'No se puede destacar un servicio inactivo. Activalo primero.' });
    }

    const { body } = await client.get('/api/admin/servicios');
    const porId = new Map(body.servicios.map((s: { id: string }) => [s.id, s]));
    expect(porId.get('lavado-premium')).toMatchObject({ destacado: true });
    expect(porId.get('pulido')).toMatchObject({ activo: false, destacado: false, nombre: 'Pulido' });
    expect(porId.get('encerado')).toMatchObject({ activo: true, destacado: false });
    expect(context.logger.errors).toEqual([]);

    // Activar y destacar en el mismo cambio sí se puede.
    const ok = await client.patch('/api/admin/servicios/pulido', { activo: true, destacado: true });
    expect(ok.status).toBe(200);
    expect(ok.body.servicio).toMatchObject({ activo: true, destacado: true });
  });

  it('404 si no existe o el id tiene un formato imposible; 400 si viene el id, un campo desconocido o nada', async () => {
    const { client } = await editor();

    for (const url of ['/api/admin/servicios/no-existe', '/api/admin/servicios/No%20Existe']) {
      const response = await client.patch(url, { nombre: 'X' });
      expect(response.status, url).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }

    for (const [body, field] of [
      [{ id: 'otro-id' }, 'id'],
      [{ nombre: 'X', orden: 3 }, 'orden'],
      [{ activo: 'no' }, 'activo'],
      [{ resumen: '' }, 'resumen'],
    ] as const) {
      const response = await client.patch('/api/admin/servicios/pulido', body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error.fields).toHaveProperty(field);
    }

    const empty = await client.patch('/api/admin/servicios/pulido', {});
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toMatch(/al menos un cambio/);

    const { body } = await client.get('/api/admin/servicios');
    expect(body.servicios[2]).toMatchObject({ id: 'pulido', nombre: 'Pulido' });
  });
});

describe('PUT /api/admin/servicios/orden', () => {
  it('guarda el orden nuevo (posición × 10) y lo devuelve; el público lo ve igual', async () => {
    const { context, client } = await editor('superadmin');
    const nuevo = ['pulido', 'restauracion-opticas', 'lavado-basico', 'lavado-premium', 'encerado'];

    const response = await client.put('/api/admin/servicios/orden', { ids: nuevo });
    expect(response.status).toBe(200);
    expect(ids(response.body)).toEqual(nuevo);
    expect(response.body.servicios.map((s: { orden: number }) => s.orden)).toEqual([10, 20, 30, 40, 50]);

    expect(ids((await createClient(context.app).get('/api/servicios')).body)).toEqual(nuevo);
  });

  it('400 si faltan, sobran o se repiten ids (y no cambia nada)', async () => {
    const { client } = await editor();

    for (const lista of [
      IDS_INICIALES.slice(1),
      [...IDS_INICIALES, 'no-existe'],
      [...IDS_INICIALES, 'pulido'],
      [],
      ['No Es Slug'],
    ]) {
      const response = await client.put('/api/admin/servicios/orden', { ids: lista });
      expect(response.status, lista.join(',')).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(response.body.error.fields as object).some((key) => key.startsWith('ids'))).toBe(true);
    }
    for (const body of [{}, { ids: IDS_INICIALES, extra: 1 }, { ids: 'pulido' }]) {
      expect((await client.put('/api/admin/servicios/orden', body)).status, JSON.stringify(body)).toBe(400);
    }

    expect(ids((await client.get('/api/admin/servicios')).body)).toEqual(IDS_INICIALES);
  });

  it('CSRF: sin Content-Type JSON 415 y desde otro origen 403', async () => {
    const { client } = await editor();
    const sinJson = await client.agent.put('/api/admin/servicios/orden').set('Content-Type', 'text/plain').send('x');
    expect(sinJson.status).toBe(415);
    const otroOrigen = await client.agent
      .put('/api/admin/servicios/orden')
      .set('Origin', 'https://evil.example')
      .set('Content-Type', 'application/json')
      .send({ ids: IDS_INICIALES });
    expect(otroOrigen.status).toBe(403);
  });
});

describe('POST /api/bookings contra el catálogo de la base', () => {
  async function desactivar(context: TestContext, id: string): Promise<void> {
    const { client } = await loginAs(context, 'admin', `admin-${id}@mgdetailing.test`);
    await client.patch(`/api/admin/servicios/${id}`, { activo: false }).expect(200);
  }

  it('un servicio inactivo no se puede reservar (400 en servicioId), tampoco por el honeypot', async () => {
    const context = await createTestContext();
    await desactivar(context, 'pulido');

    for (const body of [validBooking(), validBooking({ website: 'http://spam.example' })]) {
      const response = await rawPost(context.app, '/api/bookings').send(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Revisá los datos ingresados.',
        fields: { servicioId: 'Elegí un servicio de la lista.' },
      });
    }
    expect(await countRows(context.db, 'bookings')).toBe(0);

    // Otro servicio activo sí.
    expect((await rawPost(context.app, '/api/bookings').send(validBooking({ servicioId: 'encerado' }))).status).toBe(201);
  });

  it('un servicio nuevo se puede reservar enseguida; el log y el aviso usan el nombre de la base', async () => {
    const notifyNewBooking = vi.fn<BookingNotifier['notifyNewBooking']>().mockResolvedValue();
    const context = await createTestContext({ notifier: { notifyNewBooking } });
    const { client } = await loginAs(context, 'admin');
    await client.post('/api/admin/servicios', nuevoServicio()).expect(201);
    await client.patch('/api/admin/servicios/pulido', { nombre: 'Pulido profesional' }).expect(200);

    const nuevo = await rawPost(context.app, '/api/bookings').send(validBooking({ servicioId: 'tratamiento-ceramico' }));
    expect(nuevo.status).toBe(201);
    expect(nuevo.body.booking.servicioId).toBe('tratamiento-ceramico');

    const pulido = await rawPost(context.app, '/api/bookings').send(validBooking());
    expect(context.logger.lines).toContain(
      `INFO Turno creado id=${String(pulido.body.booking.id)} servicio="Pulido profesional" fecha=2026-10-20`,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notifyNewBooking.mock.calls.map((call) => call[1])).toEqual(['Tratamiento cerámico', 'Pulido profesional']);
  });

  it('un servicio inexistente con formato válido también da 400 en servicioId', async () => {
    const { app } = await createTestContext();
    const response = await rawPost(app, '/api/bookings').send(validBooking({ servicioId: 'teletransporte' }));
    expect(response.status).toBe(400);
    expect(response.body.error.fields).toEqual({ servicioId: 'Elegí un servicio de la lista.' });
  });
});

describe('de punta a punta: el ciclo de vida de un servicio', () => {
  it('crear → se ve en público → se reserva → se desactiva → ya no se reserva ni se ve → se reordena', async () => {
    const context = await createTestContext();
    const { client: admin } = await loginAs(context, 'admin');
    const publico = createClient(context.app);

    // 1. Alta desde el panel, ya destacado: desmarca al anterior.
    const creado = await admin.post(
      '/api/admin/servicios',
      nuevoServicio({ precioDesde: 120000, duracion: '1 día', destacado: true, incluye: ['Capa cerámica'] }),
    );
    expect(creado.status).toBe(201);

    // 2. La landing lo ve al final, con sus datos públicos.
    const catalogo = await publico.get('/api/servicios');
    expect(ids(catalogo.body)).toEqual([...IDS_INICIALES, 'tratamiento-ceramico']);
    expect(catalogo.body.servicios.at(-1)).toEqual({
      id: 'tratamiento-ceramico',
      nombre: 'Tratamiento cerámico',
      resumen: 'Protección de larga duración para la pintura.',
      descripcion: 'Aplicamos una capa cerámica.\nDura meses.',
      incluye: ['Capa cerámica'],
      glosario: [],
      duracion: '1 día',
      precioDesde: 120000,
      destacado: true,
    });
    expect(catalogo.body.servicios.filter((s: { destacado: boolean }) => s.destacado)).toHaveLength(1);

    // 3. Un cliente reserva un turno con ese servicio; el panel lo ve.
    const turno = await rawPost(context.app, '/api/bookings').send(validBooking({ servicioId: 'tratamiento-ceramico' }));
    expect(turno.status).toBe(201);
    const turnos = await admin.get('/api/admin/bookings');
    expect(turnos.status).toBe(200);
    expect(JSON.stringify(turnos.body)).toContain('tratamiento-ceramico');

    // 4. Se desactiva: como era el destacado, queda desmarcado.
    const desactivado = await admin.patch('/api/admin/servicios/tratamiento-ceramico', { activo: false });
    expect(desactivado.body.servicio).toMatchObject({ activo: false, destacado: false });

    // 5. Ya no se puede reservar ni aparece en la landing; el turno viejo sigue ahí (no se borra nada).
    const rechazado = await rawPost(context.app, '/api/bookings').send(validBooking({ servicioId: 'tratamiento-ceramico' }));
    expect(rechazado.status).toBe(400);
    expect(rechazado.body.error.fields).toEqual({ servicioId: 'Elegí un servicio de la lista.' });
    expect(ids((await publico.get('/api/servicios')).body)).toEqual(IDS_INICIALES);
    expect(await countRows(context.db, 'bookings')).toBe(1);

    // 6. Reordenar con una lista vieja (sin el servicio nuevo, como una pestaña que no recargó) => 400 y no cambia.
    const viejo = await admin.put('/api/admin/servicios/orden', { ids: [...IDS_INICIALES].reverse() });
    expect(viejo.status).toBe(400);
    expect(viejo.body.error.fields).toHaveProperty('ids');

    // Con la lista completa (inactivos incluidos) sí.
    const nuevoOrden = ['tratamiento-ceramico', ...[...IDS_INICIALES].reverse()];
    const ordenado = await admin.put('/api/admin/servicios/orden', { ids: nuevoOrden });
    expect(ordenado.status).toBe(200);
    expect(ids(ordenado.body)).toEqual(nuevoOrden);
    expect(ids((await publico.get('/api/servicios')).body)).toEqual([...IDS_INICIALES].reverse());
  });
});
