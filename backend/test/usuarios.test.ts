import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { type TestContext, addUser, closeAllContexts, createClient, createTestContext, loginAs, validBooking } from './helpers.js';

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

    for (const body of [{ email: 'x@y.z' }, { rol: 'dueño' }, { activo: 'si' }, { nombre: 'x'.repeat(81) }, {}]) {
      const response = await client.patch(`/api/admin/usuarios/${otro}`, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await client.patch(`/api/admin/usuarios/${randomUUID()}`, { activo: true })).status).toBe(404);
    expect((await client.patch('/api/admin/usuarios/123', { activo: true })).status).toBe(404);
  });
});
