import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type TestContext,
  addUser,
  closeAllContexts,
  countRows,
  createClient,
  createTestContext,
  loginAs,
  MemoryLogger,
  NOW,
  loginClient,
  testConfig,
  validBooking,
} from './helpers.js';
import { type Perfil, type PerfilRepository, SinSuperadminError } from '../src/domain/perfil.js';
import type { SupabaseAdminClient } from '../src/lib/supabase-admin.js';
import { AuthUnavailableError } from '../src/lib/supabase-auth.js';
import { UsuarioService } from '../src/services/usuarios.js';
import { SECRET_KEY, WEAK_PASSWORD_MARK } from './supabase-fake.js';

afterEach(closeAllContexts);

async function crearTurno(context: TestContext): Promise<string> {
  const response = await createClient(context.app).post('/api/bookings', validBooking());
  return String(response.body.booking.id);
}

describe('matriz de roles sobre los turnos (la regla vive en el backend)', () => {
  it('empleado: ve turnos y puede marcarlos completados; no confirma, no cancela, no borra, no gestiona usuarios', async () => {
    const context = await createTestContext();
    const id = await crearTurno(context);
    const { client } = await loginAs(context, 'empleado');

    expect((await client.get('/api/admin/bookings')).status).toBe(200);
    for (const estado of ['confirmado', 'cancelado', 'pendiente']) {
      const response = await client.patch(`/api/admin/bookings/${id}`, { estado });
      expect(response.status, estado).toBe(403);
      expect(response.body.error).toEqual({
        code: 'FORBIDDEN',
        message: 'Con tu rol solo podés marcar los turnos como completados.',
      });
    }
    expect((await client.patch(`/api/admin/bookings/${id}`, { estado: 'completado' })).body.booking.estado).toBe('completado');

    const borrar = await client.delete(`/api/admin/bookings/${id}`);
    expect(borrar.status).toBe(403);
    expect(borrar.body.error.message).toBe('Con tu rol no podés borrar turnos.');
    expect((await client.get('/api/admin/usuarios')).status).toBe(403);
  });

  it('admin: cambia a cualquier estado y borra, pero no gestiona usuarios', async () => {
    const context = await createTestContext();
    const id = await crearTurno(context);
    const { client } = await loginAs(context, 'admin');

    expect((await client.patch(`/api/admin/bookings/${id}`, { estado: 'cancelado' })).status).toBe(200);
    expect((await client.delete(`/api/admin/bookings/${id}`)).status).toBe(204);

    const usuarios = await client.get('/api/admin/usuarios');
    expect(usuarios.status).toBe(403);
    expect(usuarios.body.error).toEqual({ code: 'FORBIDDEN', message: 'Solo un superadmin puede gestionar usuarios.' });
    expect((await client.patch(`/api/admin/usuarios/${randomUUID()}`, { activo: true })).status).toBe(403);
  });

  it('superadmin: todo lo del admin', async () => {
    const context = await createTestContext();
    const id = await crearTurno(context);
    const { client } = await loginAs(context, 'superadmin');

    expect((await client.patch(`/api/admin/bookings/${id}`, { estado: 'confirmado' })).status).toBe(200);
    expect((await client.delete(`/api/admin/bookings/${id}`)).status).toBe(204);
  });
});

describe('gestión de usuarios (superadmin)', () => {
  it('lista los perfiles y activa a un usuario nuevo con un rol y un nombre', async () => {
    const context = await createTestContext();
    const { client, id: superId } = await loginAs(context, 'superadmin', 'jefe@mgdetailing.test');
    // Un usuario recién creado en Supabase: el trigger lo deja como empleado inactivo.
    const { rows } = await context.db.sql.query(
      "INSERT INTO auth.users (email) VALUES ('Nuevo@MgDetailing.test') RETURNING id::text AS id",
    );
    const nuevoId = String(rows[0]?.id);

    const list = await client.get('/api/admin/usuarios');
    expect(list.status).toBe(200);
    expect(list.body.usuarios).toEqual([
      expect.objectContaining({ id: superId, email: 'jefe@mgdetailing.test', rol: 'superadmin', activo: true }),
      {
        id: nuevoId,
        email: 'nuevo@mgdetailing.test',
        nombre: null,
        rol: 'empleado',
        activo: false,
        createdAt: expect.stringMatching(/Z$/),
        updatedAt: expect.stringMatching(/Z$/),
      },
    ]);

    const patched = await client.patch(`/api/admin/usuarios/${nuevoId}`, { rol: 'admin', activo: true, nombre: '  Lucía  ' });
    expect(patched.status).toBe(200);
    expect(patched.body.usuario).toMatchObject({ id: nuevoId, rol: 'admin', activo: true, nombre: 'Lucía' });
    expect(patched.body.usuario.updatedAt).toBe('2026-10-16T15:00:00.000Z');
    expect(context.logger.text).toContain(`Usuario actualizado id=${nuevoId} por=${superId} campos=rol,activo,nombre`);
    expect(context.logger.text).not.toContain('nuevo@mgdetailing.test');
  });

  it('no puede quitarse su propio rol ni desactivarse, y no se puede dejar el sistema sin superadmin activo', async () => {
    const context = await createTestContext();
    const { client, id: yo } = await loginAs(context, 'superadmin');

    const degradarme = await client.patch(`/api/admin/usuarios/${yo}`, { rol: 'admin' });
    expect(degradarme.status).toBe(409);
    expect(degradarme.body.error.code).toBe('CONFLICT');
    expect((await client.patch(`/api/admin/usuarios/${yo}`, { activo: false })).status).toBe(409);
    expect((await client.patch(`/api/admin/usuarios/${yo}`, { nombre: 'Yo' })).status).toBe(200); // lo demás sí

    // Dos superadmins: uno puede degradar al otro, pero no al último (lo frena el trigger de la base).
    const otro = await addUser(context, { email: 'otro@mgdetailing.test', rol: 'superadmin' });
    expect((await client.patch(`/api/admin/usuarios/${otro}`, { rol: 'admin' })).status).toBe(200);
    // Ahora "yo" es el último: aunque la API no lo frenara (por ejemplo, dos cambios simultáneos), la base sí.
    await expect(
      context.db.appSql.query("UPDATE mgdetailing.perfiles SET activo = false WHERE id = $1::uuid", [yo]),
    ).rejects.toThrow(/sin ningún superadmin activo/);
  });

  it('validación estricta: campo desconocido, rol inválido, body vacío => 400; id inexistente o mal formado => 404', async () => {
    const context = await createTestContext();
    const { client } = await loginAs(context, 'superadmin');
    const otro = await addUser(context, { email: 'otro@mgdetailing.test', rol: 'empleado' });

    const invalidos = [
      { telefono: '123' },
      { rol: 'dueño' },
      { email: 'no-es-email' },
      { password: 'corta' },
      { activo: 'si' },
      { nombre: 'x'.repeat(81) },
      {},
    ];
    for (const body of invalidos) {
      const response = await client.patch(`/api/admin/usuarios/${otro}`, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await client.patch(`/api/admin/usuarios/${randomUUID()}`, { activo: true })).status).toBe(404);
    expect((await client.patch('/api/admin/usuarios/123', { activo: true })).status).toBe(404);
  });
});

describe('alta, cambio de email o contraseña y baja de usuarios (superadmin, API admin de Supabase Auth)', () => {
  const NUEVO = {
    email: '  Lucia@MgDetailing.test ',
    password: 'clave-nueva-123',
    nombre: 'Lucía',
    rol: 'admin',
    activo: true,
  };

  it('crea el usuario en Supabase Auth; el trigger crea su perfil y queda con el rol, el nombre y el estado pedidos', async () => {
    const context = await createTestContext();
    const { client, id: superId } = await loginAs(context, 'superadmin');

    const list = await client.get('/api/admin/usuarios');
    expect(list.body.gestionCuentas).toBe(true);

    const created = await client.post('/api/admin/usuarios', NUEVO);
    expect(created.status).toBe(201);
    expect(created.body.usuario).toMatchObject({
      email: 'lucia@mgdetailing.test',
      nombre: 'Lucía',
      rol: 'admin',
      activo: true,
    });
    const nuevoId = String(created.body.usuario.id);
    expect(await countRows(context.db, 'perfiles')).toBe(2);

    // La secret key va solo en apikey (sin Authorization) y nunca se loguea, ni la contraseña ni el email.
    expect(context.supabase.calls.at(-1)).toEqual({ path: '/admin/users', method: 'POST', apikey: SECRET_KEY, bearer: false });
    expect(context.logger.text).toContain(`Usuario creado id=${nuevoId} por=${superId} rol=admin activo=true`);
    for (const secreto of [SECRET_KEY, NUEVO.password, 'lucia@mgdetailing.test']) {
      expect(context.logger.text).not.toContain(secreto);
    }

    // Y puede entrar al panel con esa contraseña.
    const lucia = await loginClient(context, 'lucia@mgdetailing.test', NUEVO.password);
    expect((await lucia.get('/api/admin/bookings')).status).toBe(200);
  });

  it('alta: email repetido => 409; contraseña débil para Supabase => 400 en password; datos inválidos => 400', async () => {
    const context = await createTestContext();
    const { client } = await loginAs(context, 'superadmin', 'jefe@mgdetailing.test');

    const repetido = await client.post('/api/admin/usuarios', { ...NUEVO, email: 'JEFE@mgdetailing.test' });
    expect(repetido.status).toBe(409);
    expect(repetido.body.error).toEqual({
      code: 'CONFLICT',
      message: 'Ya existe un usuario con ese email.',
      fields: { email: 'Ya existe un usuario con ese email.' },
    });

    const debil = await client.post('/api/admin/usuarios', { ...NUEVO, password: `muy-${WEAK_PASSWORD_MARK}-123` });
    expect(debil.status).toBe(400);
    expect(Object.keys(debil.body.error.fields)).toEqual(['password']);

    const invalidos = [
      { ...NUEVO, password: '1234567' },
      { ...NUEVO, password: 'ñ'.repeat(37) }, // 37 caracteres, 74 bytes: supera el tope de bcrypt
      { ...NUEVO, email: 'no-es-email' },
      { ...NUEVO, rol: 'dueño' },
      { ...NUEVO, extra: true },
      { email: NUEVO.email, password: NUEVO.password },
    ];
    for (const body of invalidos) {
      const response = await client.post('/api/admin/usuarios', body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await countRows(context.db, 'perfiles')).toBe(1);
  });

  it('cambia la contraseña (recuperación) y el email de otro usuario; el perfil copia el email nuevo', async () => {
    const context = await createTestContext();
    const { client } = await loginAs(context, 'superadmin');
    const otro = await addUser(context, { email: 'olvidadizo@mgdetailing.test', rol: 'empleado' });

    const clave = await client.patch(`/api/admin/usuarios/${otro}`, { password: 'otra-clave-456' });
    expect(clave.status).toBe(200);
    expect(context.supabase.passwordOf('olvidadizo@mgdetailing.test')).toBe('otra-clave-456');
    expect(context.logger.text).toContain('campos=password');
    expect(context.logger.text).not.toContain('otra-clave-456');

    const email = await client.patch(`/api/admin/usuarios/${otro}`, { email: 'Nuevo.Mail@MgDetailing.test', nombre: 'Pepe' });
    expect(email.status).toBe(200);
    expect(email.body.usuario).toMatchObject({ id: otro, email: 'nuevo.mail@mgdetailing.test', nombre: 'Pepe' });
    await loginClient(context, 'nuevo.mail@mgdetailing.test', 'otra-clave-456');

    // El superadmin también puede cambiar su propia contraseña.
    const { client: jefe, id: jefeId } = await loginAs(context, 'superadmin', 'jefe@mgdetailing.test');
    expect((await jefe.patch(`/api/admin/usuarios/${jefeId}`, { password: 'mi-clave-nueva' })).status).toBe(200);

    expect((await client.patch(`/api/admin/usuarios/${otro}`, { email: 'jefe@mgdetailing.test' })).status).toBe(409);
  });

  it('elimina a otro usuario (perfil y sesiones en cascada); no puede eliminarse a sí mismo', async () => {
    const context = await createTestContext();
    const { client, id: yo } = await loginAs(context, 'superadmin');
    const otroId = await addUser(context, { email: 'chau@mgdetailing.test', rol: 'empleado' });
    const otro = await loginClient(context, 'chau@mgdetailing.test');

    const borrar = await client.delete(`/api/admin/usuarios/${otroId}`);
    expect(borrar.status).toBe(204);
    expect(await countRows(context.db, 'perfiles')).toBe(1);
    expect(context.logger.text).toContain(`Usuario eliminado id=${otroId} por=${yo}`);
    // Su sesión abierta deja de servir en el request siguiente (ya no tiene perfil: NO_ACCESS).
    const despues = await otro.get('/api/admin/bookings');
    expect(despues.status).toBe(403);
    expect(despues.body.error.code).toBe('NO_ACCESS');
    expect(await context.supabase.sessionCount()).toBe(1);

    expect((await client.delete(`/api/admin/usuarios/${otroId}`)).status).toBe(404);
    expect((await client.delete('/api/admin/usuarios/123')).status).toBe(404);
    const yoMismo = await client.delete(`/api/admin/usuarios/${yo}`);
    expect(yoMismo.status).toBe(409);
    expect(yoMismo.body.error.message).toBe('No podés eliminar tu propio usuario.');
  });

  it('elimina a otro superadmin activo (el trigger de "al menos un superadmin" corre como el rol de Supabase Auth)', async () => {
    const context = await createTestContext();
    const { client } = await loginAs(context, 'superadmin');
    const otroSuper = await addUser(context, { email: 'otro-super@mgdetailing.test', rol: 'superadmin' });

    const borrar = await client.delete(`/api/admin/usuarios/${otroSuper}`);
    expect(borrar.status, JSON.stringify(borrar.body)).toBe(204);
    expect(await countRows(context.db, 'perfiles')).toBe(1);

    // En Supabase, el trigger AFTER DELETE de la cascada corre como supabase_auth_admin (sin USAGE sobre mgdetailing):
    // tiene que ser SECURITY DEFINER o el borrado falla con 42501. PGlite no reproduce ese detalle, así que se verifica
    // la definición: los dos triggers usan la función privada, que nadie más puede ejecutar.
    const { rows: triggers } = await context.db.sql.query(
      `SELECT t.tgname, p.pronamespace::regnamespace::text AS esquema, p.prosecdef,
              has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE') AS auth_exec,
              has_function_privilege('mgdetailing_app', p.oid, 'EXECUTE') AS app_exec
       FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE t.tgrelid = 'mgdetailing.perfiles'::regclass AND t.tgname LIKE 'perfiles_al_menos_un_superadmin%'
       ORDER BY t.tgname`,
    );
    expect(triggers).toEqual(
      ['perfiles_al_menos_un_superadmin', 'perfiles_al_menos_un_superadmin_al_borrar'].map((tgname) => ({
        tgname,
        esquema: 'mgdetailing_private',
        prosecdef: true,
        auth_exec: false,
        app_exec: false,
      })),
    );

    // Y el último superadmin activo sigue protegido aunque lo borre Supabase Auth directamente.
    const { rows } = await context.db.sql.query("SELECT id::text AS id FROM mgdetailing.perfiles WHERE rol_id = 'superadmin'");
    await expect(
      context.db.authSql.query('DELETE FROM auth.users WHERE id = $1::uuid', [String(rows[0]?.id)]),
    ).rejects.toThrow(/sin ningún superadmin activo/);
  });

  it('solo el superadmin: admin y empleado reciben 403 en alta, cambio de contraseña y baja', async () => {
    const context = await createTestContext();
    const victima = await addUser(context, { email: 'victima@mgdetailing.test', rol: 'empleado' });
    for (const rol of ['admin', 'empleado'] as const) {
      const { client } = await loginAs(context, rol);
      expect((await client.post('/api/admin/usuarios', NUEVO)).status, rol).toBe(403);
      expect((await client.patch(`/api/admin/usuarios/${victima}`, { password: 'hackeada-123' })).status, rol).toBe(403);
      expect((await client.delete(`/api/admin/usuarios/${victima}`)).status, rol).toBe(403);
    }
    expect(context.supabase.calls.some((call) => call.path.startsWith('/admin/'))).toBe(false);
  });

  it('sin SUPABASE_SECRET_KEY: lista con gestionCuentas=false; alta, baja, email y contraseña => 503; rol y nombre siguen', async () => {
    const context = await createTestContext({ config: { supabase: { ...testConfig().supabase, secretKey: undefined } } });
    const { client } = await loginAs(context, 'superadmin');
    const otro = await addUser(context, { email: 'otro@mgdetailing.test', rol: 'empleado' });

    expect((await client.get('/api/admin/usuarios')).body.gestionCuentas).toBe(false);
    const respuestas = [
      await client.post('/api/admin/usuarios', NUEVO),
      await client.patch(`/api/admin/usuarios/${otro}`, { password: 'otra-clave-456' }),
      await client.patch(`/api/admin/usuarios/${otro}`, { email: 'x@mgdetailing.test' }),
      await client.delete(`/api/admin/usuarios/${otro}`),
    ];
    for (const response of respuestas) {
      expect(response.status).toBe(503);
      expect(response.body.error.message).toMatch(/SUPABASE_SECRET_KEY/);
    }
    expect((await client.patch(`/api/admin/usuarios/${otro}`, { nombre: 'Otro' })).status).toBe(200);
  });

  it('Supabase caído o limitando => 503 / 429, sin filtrar la contraseña', async () => {
    const context = await createTestContext();
    const { client } = await loginAs(context, 'superadmin');
    context.supabase.mode = 'down';
    expect((await client.post('/api/admin/usuarios', NUEVO)).status).toBe(503);
    context.supabase.mode = 'rate';
    expect((await client.post('/api/admin/usuarios', NUEVO)).status).toBe(429);
    context.supabase.mode = 'error';
    expect((await client.post('/api/admin/usuarios', NUEVO)).status).toBe(503);
    expect(context.logger.text).not.toContain(NUEVO.password);
  });
});

describe('UsuarioService: operaciones que tocan Auth y la base (casos a medias)', () => {
  const actor = {
    id: '00000000-0000-4000-8000-000000000001',
    email: null,
    nombre: null,
    rol: 'superadmin' as const,
    sessionId: '00000000-0000-4000-8000-000000000002',
  };
  const perfilDe = (id: string, cambios: Partial<Perfil> = {}): Perfil => ({
    id,
    email: 'x@mgdetailing.test',
    nombre: null,
    rol: 'empleado',
    activo: true,
    createdAt: '2026-10-16T15:00:00.000Z',
    updatedAt: '2026-10-16T15:00:00.000Z',
    ...cambios,
  });

  function servicio(perfiles: Partial<PerfilRepository>, admin: Partial<SupabaseAdminClient>) {
    const logger = new MemoryLogger();
    const service = new UsuarioService({
      perfiles: perfiles as PerfilRepository,
      admin: admin as SupabaseAdminClient,
      logger,
      now: () => NOW,
    });
    return { service, logger };
  }

  it('alta: si falla la configuración del perfil, borra el usuario recién creado en Auth (no queda a medias)', async () => {
    const borrados: string[] = [];
    const { service, logger } = servicio(
      { update: () => Promise.reject(new Error('la base se cayó')) },
      {
        createUser: () => Promise.resolve('11111111-1111-4111-8111-111111111111'),
        deleteUser: (id: string) => {
          borrados.push(id);
          return Promise.resolve(true);
        },
      },
    );
    await expect(
      service.create(actor, { email: 'a@b.test', password: 'clave-larga-1', nombre: null, rol: 'admin', activo: true }),
    ).rejects.toThrow('la base se cayó');
    expect(borrados).toEqual(['11111111-1111-4111-8111-111111111111']);
    expect(logger.text).toContain('Alta revertida id=11111111-1111-4111-8111-111111111111');
  });

  it('PATCH con perfil y cuenta: si el perfil choca con una regla, Auth no se toca', async () => {
    let authTocado = false;
    const { service } = servicio(
      { update: () => Promise.reject(new SinSuperadminError()) },
      {
        updateUser: () => {
          authTocado = true;
          return Promise.resolve(true);
        },
      },
    );
    await expect(
      service.update(actor, '22222222-2222-4222-8222-222222222222', { rol: 'admin', email: 'nuevo@b.test' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(authTocado).toBe(false);
  });

  it('baja: si Auth falla al borrar al último superadmin activo (carrera), responde 409 y no 503', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    const { service } = servicio(
      {
        findById: () => Promise.resolve(perfilDe(id, { rol: 'superadmin' })),
        list: () => Promise.resolve([perfilDe(id, { rol: 'superadmin' }), perfilDe(actor.id, { rol: 'superadmin', activo: false })]),
      },
      { deleteUser: () => Promise.reject(new AuthUnavailableError(500)) },
    );
    await expect(service.remove(actor, id)).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
  });
});
