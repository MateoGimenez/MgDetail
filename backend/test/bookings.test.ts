import { afterEach, describe, expect, it } from 'vitest';
import type { BookingRepository } from '../src/domain/booking.js';
import { createPostgresRepositories } from '../src/repositories/index.js';
import { BookingService } from '../src/services/bookings.js';
import {
  MemoryLogger,
  NOW,
  type TestContext,
  TODAY_PLUS_60,
  TODAY_PLUS_61,
  bookingWithout,
  closeAllContexts,
  countRows,
  createTestContext,
  rawPost,
  validBooking,
} from './helpers.js';
import { createPgliteDatabase } from './pglite.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await closeAllContexts();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('POST /api/bookings: creación', () => {
  it('crea un turno válido y responde 201 solo con los campos públicos', async () => {
    const { app, db } = await createTestContext();
    const response = await rawPost(app, '/api/bookings').send(validBooking());

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      booking: {
        id: expect.stringMatching(UUID) as string,
        servicioId: 'pulido',
        fechaPreferida: '2026-10-20',
        franja: 'manana',
        estado: 'pendiente',
      },
    });
    // Nada de datos personales ni timestamps en la respuesta pública.
    expect(Object.keys(response.body.booking as object).sort()).toEqual(
      ['estado', 'fechaPreferida', 'franja', 'id', 'servicioId'],
    );
    expect(await countRows(db, 'bookings')).toBe(1);
  });

  it('guarda los datos normalizados (trim, email en minúsculas)', async () => {
    const { app, db } = await createTestContext();
    const response = await rawPost(app, '/api/bookings').send(
      validBooking({
        nombre: '  María  Gómez ',
        telefono: '  380 4123456 ',
        email: '  MARIA@Example.COM ',
        vehiculoModelo: '  Hilux  ',
        comentario: '  Quiero turno temprano  ',
      }),
    );
    expect(response.status).toBe(201);

    const { rows } = await db.sql.query(
      `SELECT nombre, telefono, email, vehiculo_modelo, comentario, estado,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
       FROM mgdetailing.bookings WHERE id = $1::uuid`,
      [(response.body as { booking: { id: string } }).booking.id],
    );
    expect(rows[0]).toMatchObject({
      nombre: 'María  Gómez',
      telefono: '380 4123456',
      email: 'maria@example.com',
      vehiculo_modelo: 'Hilux',
      comentario: 'Quiero turno temprano',
      estado: 'pendiente',
      created_at: '2026-10-16T15:00:00.000Z',
      updated_at: '2026-10-16T15:00:00.000Z',
    });
  });

  it('email, vehiculoModelo y comentario son opcionales: omitidos, vacíos o null se guardan como null', async () => {
    const { app, db } = await createTestContext();
    const variants: Record<string, unknown>[] = [
      (() => {
        const { email: _e, vehiculoModelo: _v, comentario: _c, ...rest } = validBooking();
        return rest;
      })(),
      validBooking({ email: '', vehiculoModelo: '', comentario: '' }),
      validBooking({ email: '   ', vehiculoModelo: '   ', comentario: '   ' }),
      validBooking({ email: null, vehiculoModelo: null, comentario: null }),
    ];

    for (const payload of variants) {
      const response = await rawPost(app, '/api/bookings').send(payload);
      expect(response.status, JSON.stringify(response.body)).toBe(201);
    }

    const { rows } = await db.sql.query('SELECT email, vehiculo_modelo, comentario FROM mgdetailing.bookings');
    expect(rows).toHaveLength(variants.length);
    for (const row of rows) {
      expect(row.email).toBeNull();
      expect(row.vehiculo_modelo).toBeNull();
      expect(row.comentario).toBeNull();
    }
  });
});

describe('POST /api/bookings: validaciones', () => {
  it('campo requerido faltante => 400 VALIDATION_ERROR con el campo en `fields`', async () => {
    const { app, db } = await createTestContext();
    const required = ['nombre', 'telefono', 'vehiculoTipo', 'servicioId', 'fechaPreferida', 'franja'];

    for (const field of required) {
      const response = await rawPost(app, '/api/bookings').send(bookingWithout(field));
      expect(response.status, field).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toBe('Revisá los datos ingresados.');
      expect(Object.keys(response.body.error.fields as object), field).toEqual([field]);
    }
    expect(await countRows(db, 'bookings')).toBe(0);
  });

  it('body vacío => lista todos los campos obligatorios', async () => {
    const { app } = await createTestContext();
    const response = await rawPost(app, '/api/bookings').send({});

    expect(response.status).toBe(400);
    expect(Object.keys(response.body.error.fields as object).sort()).toEqual(
      ['fechaPreferida', 'franja', 'nombre', 'servicioId', 'telefono', 'vehiculoTipo'],
    );
  });

  const invalidValues: [field: string, value: unknown, label: string][] = [
    ['nombre', 'A', 'nombre de 1 carácter'],
    ['telefono', '1234567', 'teléfono con 7 dígitos'],
    ['email', 'no-es-un-email', 'email sin @'],
    ['vehiculoTipo', 'bicicleta', 'tipo de vehículo desconocido'],
    ['vehiculoModelo', 'x'.repeat(81), 'modelo de 81 caracteres'],
    ['servicioId', 'servicio-inventado', 'servicio inexistente'],
    ['franja', 'noche', 'franja desconocida'],
    ['comentario', 'x'.repeat(501), 'comentario de 501 caracteres'],
    ['fechaPreferida', '16/10/2026', 'fecha con otro formato'],
  ];

  it.each(invalidValues)('rechaza %s = %j (%s)', async (field, value) => {
    const { app, db } = await createTestContext();
    const response = await rawPost(app, '/api/bookings').send(validBooking({ [field]: value }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const fields = response.body.error.fields as Record<string, string>;
    expect(Object.keys(fields)).toEqual([field]);
    expect(fields[field]).toEqual(expect.any(String));
    expect(fields[field]).not.toBe('');
    expect(await countRows(db, 'bookings')).toBe(0);
  });

  it('los límites exactos son válidos (nombre 80, modelo 80, comentario 500, email 120, teléfono 20)', async () => {
    const { app } = await createTestContext();
    const response = await rawPost(app, '/api/bookings').send(
      validBooking({
        nombre: 'x'.repeat(80),
        vehiculoModelo: 'y'.repeat(80),
        comentario: 'z'.repeat(500),
        email: `${'a'.repeat(108)}@example.com`, // 120 caracteres
        telefono: '1234567890123456789 ', // 19 + espacio, trim => 19
      }),
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
  });

  it('rechaza campos desconocidos (.strict())', async () => {
    const { app, db } = await createTestContext();
    const response = await rawPost(app, '/api/bookings').send(validBooking({ estado: 'confirmado', admin: true }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields).toEqual({
      estado: 'Este campo no está permitido.',
      admin: 'Este campo no está permitido.',
    });
    expect(await countRows(db, 'bookings')).toBe(0);
  });

  it('un campo __proto__ en el JSON se trata como campo desconocido', async () => {
    const { app } = await createTestContext();
    const raw = JSON.stringify(validBooking()).replace('{', '{"__proto__":{"estado":"completado"},');
    const response = await rawPost(app, '/api/bookings').send(raw);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(response.body.error.fields as object)).toEqual(['__proto__']);
  });
});

describe('POST /api/bookings: fecha preferida (hoy en America/Argentina/La_Rioja)', () => {

  it('ayer (fecha pasada) => 400', async () => {
    const { app, db } = await createTestContext();
    const response = await rawPost(app, '/api/bookings').send(validBooking({ fechaPreferida: '2026-10-15' }));

    expect(response.status).toBe(400);
    expect(response.body.error.fields).toEqual({ fechaPreferida: 'La fecha no puede ser anterior a hoy.' });
    expect(await countRows(db, 'bookings')).toBe(0);
  });

  it('hoy + 60 días es válido y hoy + 61 días => 400', async () => {
    const { app } = await createTestContext();

    const ok = await rawPost(app, '/api/bookings').send(validBooking({ fechaPreferida: TODAY_PLUS_60 }));
    expect(ok.status).toBe(201);

    const tooFar = await rawPost(app, '/api/bookings').send(validBooking({ fechaPreferida: TODAY_PLUS_61 }));
    expect(tooFar.status).toBe(400);
    expect(tooFar.body.error.fields).toEqual({
      fechaPreferida: 'Solo podés pedir turno con hasta 60 días de anticipación.',
    });
  });

  it('a las 22:30 locales (01:30 UTC del día siguiente) "hoy" sigue siendo el día local', async () => {
    const { app } = await createTestContext({ now: new Date('2026-10-17T01:30:00.000Z') });

    const today = await rawPost(app, '/api/bookings').send(validBooking({ fechaPreferida: '2026-10-16' }));
    expect(today.status, 'el 16 sigue siendo hoy en La Rioja').toBe(201);

    const yesterday = await rawPost(app, '/api/bookings').send(validBooking({ fechaPreferida: '2026-10-15' }));
    expect(yesterday.status).toBe(400);
  });

  it('a las 00:30 locales (03:30 UTC) ya es el día siguiente: el día anterior se rechaza', async () => {
    const { app } = await createTestContext({ now: new Date('2026-10-17T03:30:00.000Z') });

    const previousDay = await rawPost(app, '/api/bookings').send(validBooking({ fechaPreferida: '2026-10-16' }));
    expect(previousDay.status).toBe(400);

    const today = await rawPost(app, '/api/bookings').send(validBooking({ fechaPreferida: '2026-10-17' }));
    expect(today.status).toBe(201);
  });

  it('el límite de +60 días cruza fin de año y años bisiestos', async () => {
    // 2027-12-31 12:00 local + 60 días = 2028-02-29 (2028 es bisiesto).
    const { app } = await createTestContext({ now: new Date('2027-12-31T15:00:00.000Z') });

    const leapDay = await rawPost(app, '/api/bookings').send(validBooking({ fechaPreferida: '2028-02-29' }));
    expect(leapDay.status).toBe(201);

    const after = await rawPost(app, '/api/bookings').send(validBooking({ fechaPreferida: '2028-03-01' }));
    expect(after.status).toBe(400);
  });
});

describe('POST /api/bookings: honeypot (campo `website`)', () => {
  it('con contenido responde 201 creíble pero NO guarda nada', async () => {
    const context = await createTestContext();
    const response = await rawPost(context.app, '/api/bookings').send(
      validBooking({ website: 'http://spam.example.com' }),
    );

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      booking: {
        id: expect.stringMatching(UUID) as string,
        servicioId: 'pulido',
        fechaPreferida: '2026-10-20',
        franja: 'manana',
        estado: 'pendiente',
      },
    });
    expect(await countRows(context.db, 'bookings')).toBe(0);
    expect(context.logger.text).toContain('descartada por honeypot');
    expect(context.logger.text).not.toContain('spam.example.com');
  });

  it('la respuesta del honeypot es indistinguible de una real (mismas claves, id nuevo cada vez)', async () => {
    const { app } = await createTestContext();
    const real = await rawPost(app, '/api/bookings').send(validBooking());
    const fakeA = await rawPost(app, '/api/bookings').send(validBooking({ website: 'x' }));
    const fakeB = await rawPost(app, '/api/bookings').send(validBooking({ website: 'x' }));

    const keys = (response: typeof real): string[] => Object.keys(response.body.booking as object).sort();
    expect(keys(fakeA)).toEqual(keys(real));
    expect(fakeA.status).toBe(real.status);
    expect(fakeA.body.booking.id).not.toBe(fakeB.body.booking.id);
  });

  it('vacío o solo espacios se considera "no completado" y el turno se guarda', async () => {
    const { app, db } = await createTestContext();
    for (const website of ['', '   ']) {
      const response = await rawPost(app, '/api/bookings').send(validBooking({ website }));
      expect(response.status, JSON.stringify(website)).toBe(201);
    }
    expect(await countRows(db, 'bookings')).toBe(2);
  });

  it('el valor del honeypot nunca se persiste cuando el turno es real', async () => {
    const { app, db } = await createTestContext();
    await rawPost(app, '/api/bookings').send(validBooking({ website: '' }));
    const { rows } = await db.sql.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'mgdetailing' AND table_name = 'bookings'",
    );
    expect(rows.map((column) => column.column_name)).toContain('nombre');
    expect(rows.map((column) => column.column_name)).not.toContain('website');
  });

  it('si el resto de los datos es inválido, igual se valida (400)', async () => {
    const { app } = await createTestContext();
    const response = await rawPost(app, '/api/bookings').send(validBooking({ website: 'x', telefono: '1' }));
    expect(response.status).toBe(400);
  });
});

describe('POST /api/bookings: logging', () => {
  it('al crear un turno loguea solo id + servicio + fecha (sin datos personales)', async () => {
    const context = await createTestContext();
    const response = await rawPost(context.app, '/api/bookings').send(
      validBooking({
        nombre: 'Nombre Muy Privado',
        telefono: '380 555-0199',
        email: 'privado@secreto.example',
        comentario: 'Comentario confidencial',
        vehiculoModelo: 'Modelo Privado',
      }),
    );
    expect(response.status).toBe(201);

    const id = (response.body as { booking: { id: string } }).booking.id;
    expect(context.logger.lines).toContain(`INFO Turno creado id=${id} servicio="Pulido" fecha=2026-10-20`);

    const text = context.logger.text;
    for (const secret of ['Nombre Muy Privado', '380 555-0199', '5550199', 'privado@secreto', 'confidencial', 'Modelo Privado']) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it('la línea de request es "MÉTODO ruta status ms", sin query ni body', async () => {
    const context = await createTestContext();
    await rawPost(context.app, '/api/bookings?nombre=Secreto&telefono=123').send(validBooking());

    const requestLine = context.logger.lines.find((line) => line.startsWith('INFO POST /api/bookings'));
    expect(requestLine).toMatch(/^INFO POST \/api\/bookings 201 \d+\.\dms$/);
    expect(context.logger.text).not.toContain('Secreto');
  });
  it('si el repositorio falla, el error se propaga y no se loguea un alta que no ocurrió', async () => {
    const failing: BookingRepository = {
      create: () => Promise.reject(new Error('sin espacio')),
      list: () => Promise.reject(new Error('x')),
      updateEstado: () => Promise.reject(new Error('x')),
      delete: () => Promise.reject(new Error('x')),
    };
    const logger = new MemoryLogger();
    const data = {
      nombre: 'Ana',
      telefono: '3804123456',
      email: null,
      vehiculoTipo: 'auto' as const,
      vehiculoModelo: null,
      servicioId: 'pulido',
      fechaPreferida: '2026-10-20',
      franja: 'manana' as const,
      comentario: null,
    };

    // El catálogo responde bien (el servicio existe y está activo): lo que falla es guardar el turno.
    const servicios = (await createPgliteDatabase().then((db) => {
      cleanups.push(db.close);
      return createPostgresRepositories(db.appSql);
    })).servicios;

    await expect(new BookingService({ bookings: failing, servicios, logger }).createBooking(data, NOW)).rejects.toThrow(
      'sin espacio',
    );
    expect(logger.lines).toEqual([]);
  });
});

describe('POST /api/bookings: higiene de caracteres invisibles', () => {
  // Caracteres construidos por código (no escritos en el fuente): ver test/source-hygiene.test.ts.
  const LRE = String.fromCodePoint(0x202a); // Left-to-Right Embedding
  const PDF = String.fromCodePoint(0x202c); // Pop Directional Formatting
  const RLO = String.fromCodePoint(0x202e); // Right-to-Left Override
  const LRM = String.fromCodePoint(0x200e); // Left-to-Right Mark
  const BEL = String.fromCharCode(7);

  async function storedRow(context: TestContext, payload: Record<string, unknown>) {
    const response = await rawPost(context.app, '/api/bookings').send(payload);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return (await context.db.sql.query('SELECT * FROM mgdetailing.bookings')).rows[0];
  }

  it('un teléfono copiado de WhatsApp (envuelto en controles bidi invisibles) se acepta y se guarda limpio', async () => {
    const context = await createTestContext();
    const row = await storedRow(context, validBooking({ telefono: `${LRE}+54 9 380 412-3456${PDF}` }));

    expect(row?.telefono).toBe('+54 9 380 412-3456');
  });

  it('los controles bidi se QUITAN de nombre, modelo, comentario y email (no se pueden usar para disfrazar texto)', async () => {
    const context = await createTestContext();
    const row = await storedRow(
      context,
      validBooking({
        nombre: `Juan${RLO}Pérez${PDF}`,
        vehiculoModelo: `${LRE}Hilux${PDF}`,
        comentario: `Hola${RLO} mundo${LRM}`,
        email: `${LRM}juan@example.com${PDF}`,
      }),
    );

    expect(row).toMatchObject({
      nombre: 'JuanPérez',
      vehiculo_modelo: 'Hilux',
      comentario: 'Hola mundo',
      email: 'juan@example.com',
    });
    for (const value of Object.values(row ?? {})) {
      if (typeof value === 'string') expect(value).not.toMatch(/\p{Bidi_Control}/u);
    }
  });

  it('los controles C0 (ej.: BEL) siguen rechazándose en nombre, modelo y comentario', async () => {
    const { app } = await createTestContext();
    for (const field of ['nombre', 'vehiculoModelo', 'comentario']) {
      const response = await rawPost(app, '/api/bookings').send(validBooking({ [field]: `abc${BEL}def` }));
      expect(response.status, field).toBe(400);
      expect(Object.keys(response.body.error.fields as object), field).toEqual([field]);
    }
  });
});
