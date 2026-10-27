import { afterEach, describe, expect, it } from 'vitest';
import type { Estado, Franja } from '../src/domain/booking.js';
import { rangosDelResumen, resolverRango } from '../src/domain/estadisticas.js';
import { sameDayPreviousMonth, sameDayPreviousYear } from '../src/lib/dates.js';
import {
  type Client,
  type TestContext,
  addUser,
  closeAllContexts,
  createTestContext,
  loginClient,
  validBooking,
  rawPost,
} from './helpers.js';

afterEach(closeAllContexts);

/** Hoy en los tests: 2026-10-16 (viernes), 12:00 en La Rioja. */

interface NuevoTurno {
  fecha: string;
  franja?: Franja;
  estado?: Estado;
  monto?: number | null;
  trabajador?: string | null;
  servicio?: string;
  confirmada?: { fecha: string; franja: Franja };
}

async function turno(context: TestContext, t: NuevoTurno): Promise<string> {
  const { rows } = await context.db.sql.query(
    `INSERT INTO mgdetailing.bookings
       (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja, estado, monto, trabajador_id,
        fecha_confirmada, franja_confirmada)
     VALUES ('Cliente', '12345678', 'auto', $1, $2::date, $3, $4, $5, $6::uuid, $7::date, $8)
     RETURNING id::text AS id`,
    [
      t.servicio ?? 'pulido',
      t.fecha,
      t.franja ?? 'manana',
      t.estado ?? 'completado',
      t.monto ?? null,
      t.trabajador ?? null,
      t.confirmada?.fecha ?? null,
      t.confirmada?.franja ?? null,
    ],
  );
  return String(rows[0]?.id);
}

interface Equipo {
  context: TestContext;
  admin: Client;
  adminId: string;
  empleado: Client;
  empleadoId: string;
  superadmin: Client;
}

async function equipo(options: { now?: Date } = {}): Promise<Equipo> {
  const context = await createTestContext(options.now ? { now: options.now } : {});
  const adminId = await addUser(context, { email: 'ana@t.test', rol: 'admin', nombre: 'Ana' });
  const empleadoId = await addUser(context, { email: 'beto@t.test', rol: 'empleado', nombre: 'Beto' });
  await addUser(context, { email: 'super@t.test', rol: 'superadmin', nombre: 'Super' });
  return {
    context,
    adminId,
    empleadoId,
    admin: await loginClient(context, 'ana@t.test'),
    empleado: await loginClient(context, 'beto@t.test'),
    superadmin: await loginClient(context, 'super@t.test'),
  };
}

const fila = async (context: TestContext, id: string) =>
  (
    await context.db.sql.query(
      'SELECT estado, monto, trabajador_id::text AS trabajador_id, updated_at FROM mgdetailing.bookings WHERE id = $1::uuid',
      [id],
    )
  ).rows[0];


describe('PATCH /api/admin/bookings/:id con cobro', () => {
  it('admin completa con monto y trabajador; las respuestas llevan monto y trabajador {id, nombre}', async () => {
    const { context, admin, adminId } = await equipo();
    const id = await turno(context, { fecha: '2026-10-16', estado: 'confirmado' });

    const response = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'completado', monto: 60000, trabajadorId: adminId });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.booking).toMatchObject({ estado: 'completado', monto: 60000, trabajador: { id: adminId, nombre: 'Ana' } });
    expect(Object.keys(response.body.booking.trabajador as object).sort()).toEqual(['id', 'nombre']);

    const lista = await admin.get('/api/admin/bookings');
    expect(lista.body.bookings[0]).toMatchObject({ monto: 60000, trabajador: { id: adminId, nombre: 'Ana' } });
    const agenda = await admin.get('/api/admin/agenda?desde=2026-10-16&hasta=2026-10-16');
    expect(agenda.body.turnos[0]).toMatchObject({ monto: 60000, trabajador: { id: adminId } });
  });

  it('el nombre del trabajador es su email si no tiene nombre', async () => {
    const { context, admin } = await equipo();
    const sinNombre = await addUser(context, { email: 'sin@t.test', rol: 'empleado', nombre: null });
    const id = await turno(context, { fecha: '2026-10-16', estado: 'confirmado' });
    const response = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'completado', trabajadorId: sinNombre });
    expect(response.body.booking.trabajador).toEqual({ id: sinNombre, nombre: 'sin@t.test' });
  });

  it('corregir solo el cobro de un completado no cambia updatedAt; cambiar el estado sí', async () => {
    const { context, admin, adminId } = await equipo();
    const id = await turno(context, { fecha: '2026-10-16', estado: 'completado' });
    const antes = (await fila(context, id))?.updated_at as Date;

    context.clock.current = new Date('2026-10-16T15:30:00.000Z');
    const corregido = await admin.patch(`/api/admin/bookings/${id}`, { monto: 45000, trabajadorId: adminId });
    expect(corregido.status).toBe(200);
    expect(corregido.body.booking.monto).toBe(45000);
    expect(new Date(corregido.body.booking.updatedAt as string).getTime()).toBe(antes.getTime());

    const mismo = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'completado', monto: 45000 });
    expect(new Date(mismo.body.booking.updatedAt as string).getTime()).toBe(antes.getTime());

    const cambiado = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'confirmado' });
    expect(cambiado.body.booking.updatedAt).toBe('2026-10-16T15:30:00.000Z');
  });

  it('al salir de completado se borran monto y trabajador', async () => {
    const { context, admin, adminId } = await equipo();
    const id = await turno(context, { fecha: '2026-10-16', monto: 1000, trabajador: adminId });
    for (const estado of ['pendiente', 'confirmado', 'cancelado'] as const) {
      await admin.patch(`/api/admin/bookings/${id}`, { estado: 'completado', monto: 1000, trabajadorId: adminId });
      const response = await admin.patch(`/api/admin/bookings/${id}`, { estado });
      expect(response.body.booking).toMatchObject({ estado, monto: null, trabajador: null });
      expect(await fila(context, id)).toMatchObject({ monto: null, trabajador_id: null });
    }
  });

  it('monto y trabajadorId solo valen si el turno queda completado (400 en el campo)', async () => {
    const { context, admin, adminId } = await equipo();
    const id = await turno(context, { fecha: '2026-10-16', estado: 'pendiente' });
    const a = await admin.patch(`/api/admin/bookings/${id}`, { monto: 100 });
    expect(a.status).toBe(400);
    expect(Object.keys(a.body.error.fields)).toEqual(['monto']);
    const b = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'confirmado', trabajadorId: adminId });
    expect(b.status).toBe(400);
    expect(Object.keys(b.body.error.fields)).toEqual(['trabajadorId']);
    const c = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'cancelado', monto: 5, trabajadorId: adminId });
    expect(Object.keys(c.body.error.fields).sort()).toEqual(['monto', 'trabajadorId']);
    // con fecha confirmada tampoco (un turno que se reprograma no está completado)
    const d = await admin.patch(`/api/admin/bookings/${id}`, { fechaConfirmada: '2026-10-20', franjaConfirmada: 'tarde', monto: 5 });
    expect(d.status).toBe(400);
    expect(d.body.error.fields.monto).toBeTypeOf('string');
    expect((await fila(context, id))?.estado).toBe('pendiente'); // nada se guardó
    // null no es error
    expect((await admin.patch(`/api/admin/bookings/${id}`, { estado: 'confirmado', monto: null, trabajadorId: null })).status).toBe(200);
  });

  it('valida el formato: entero 0 a 99.999.999, uuid; y la persona tiene que existir y estar activa', async () => {
    const { context, admin } = await equipo();
    const inactivo = await addUser(context, { email: 'off@t.test', rol: 'empleado', activo: false });
    const id = await turno(context, { fecha: '2026-10-16', estado: 'confirmado' });
    for (const monto of [-1, 1.5, 100_000_000, '500', true]) {
      const response = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'completado', monto });
      expect(response.status, String(monto)).toBe(400);
      expect(response.body.error.fields.monto).toBeTypeOf('string');
    }
    expect((await admin.patch(`/api/admin/bookings/${id}`, { trabajadorId: 'no-es-uuid' })).body.error.fields.trabajadorId).toBeTypeOf('string');
    for (const trabajadorId of [inactivo, '3f2b8a0e-6c1d-4b57-9a43-2d7e1c9f0a11']) {
      const response = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'completado', trabajadorId, monto: 10 });
      expect(response.status).toBe(400);
      expect(Object.keys(response.body.error.fields)).toEqual(['trabajadorId']);
    }
    expect((await fila(context, id))?.estado).toBe('confirmado'); // validó todo antes de guardar nada
    expect((await admin.patch(`/api/admin/bookings/${id}`, { estado: 'completado', monto: 0 })).body.booking.monto).toBe(0);
    expect((await admin.patch(`/api/admin/bookings/${id}`, { monto: 99_999_999 })).body.booking.monto).toBe(99_999_999);
    expect((await admin.patch(`/api/admin/bookings/${id}`, { monto: null, trabajadorId: null })).body.booking).toMatchObject({ monto: null, trabajador: null });
  });

  it('un campo desconocido sigue siendo 400 y un body sin nada, también', async () => {
    const { context, admin } = await equipo();
    const id = await turno(context, { fecha: '2026-10-16', estado: 'confirmado' });
    expect((await admin.patch(`/api/admin/bookings/${id}`, { montoo: 1 })).status).toBe(400);
    expect((await admin.patch(`/api/admin/bookings/${id}`, {})).status).toBe(400);
    expect((await admin.patch('/api/admin/bookings/3f2b8a0e-6c1d-4b57-9a43-2d7e1c9f0a11', { monto: 1 })).status).toBe(404);
  });

  it('empleado: al completar queda él como trabajador, sin monto', async () => {
    const { context, admin, empleado, empleadoId } = await equipo();
    const id = await turno(context, { fecha: '2026-10-16', estado: 'confirmado' });
    const response = await empleado.patch(`/api/admin/bookings/${id}`, { estado: 'completado' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.booking).toMatchObject({ estado: 'completado', monto: null, trabajador: { id: empleadoId, nombre: 'Beto' } });
    // mandar su propio id también vale
    const otro = await turno(context, { fecha: '2026-10-16', estado: 'pendiente' });
    const propio = await empleado.patch(`/api/admin/bookings/${otro}`, { estado: 'completado', trabajadorId: empleadoId });
    expect(propio.body.booking.trabajador.id).toBe(empleadoId);
    // el admin lo completa con el monto
    const cobrado = await admin.patch(`/api/admin/bookings/${id}`, { monto: 70000 });
    expect(cobrado.body.booking).toMatchObject({ monto: 70000, trabajador: { id: empleadoId } });
  });

  it('empleado: 403 si manda monto, a otra persona o toca el cobro de un completado; nada se guarda', async () => {
    const { context, admin, empleado, adminId } = await equipo();
    const id = await turno(context, { fecha: '2026-10-16', estado: 'confirmado' });
    expect((await empleado.patch(`/api/admin/bookings/${id}`, { estado: 'completado', monto: 100 })).status).toBe(403);
    expect((await empleado.patch(`/api/admin/bookings/${id}`, { estado: 'completado', monto: null })).status).toBe(403);
    expect((await empleado.patch(`/api/admin/bookings/${id}`, { estado: 'completado', trabajadorId: adminId })).status).toBe(403);
    expect((await empleado.patch(`/api/admin/bookings/${id}`, { monto: 5 })).status).toBe(403);
    expect(await fila(context, id)).toMatchObject({ estado: 'confirmado', monto: null, trabajador_id: null });

    const hecho = await turno(context, { fecha: '2026-10-16', monto: 5000, trabajador: adminId });
    const propio = await empleado.patch(`/api/admin/bookings/${hecho}`, { trabajadorId: (await fila(context, hecho))?.trabajador_id });
    expect(propio.status).toBe(403);
    expect((await empleado.patch(`/api/admin/bookings/${hecho}`, { trabajadorId: null })).status).toBe(403);
    expect(await fila(context, hecho)).toMatchObject({ monto: 5000, trabajador_id: adminId });
    // completar de nuevo uno ya completado, sin cobro, no cambia nada
    const igual = await empleado.patch(`/api/admin/bookings/${hecho}`, { estado: 'completado' });
    expect(igual.status).toBe(200);
    expect(igual.body.booking.trabajador.id).toBe(adminId);
    // el admin sí puede
    expect((await admin.patch(`/api/admin/bookings/${hecho}`, { monto: 6000 })).status).toBe(200);
  });

  it('empleado: no puede cancelar ni reprogramar, aunque mande cobro', async () => {
    const { context, empleado } = await equipo();
    const id = await turno(context, { fecha: '2026-10-16', estado: 'confirmado' });
    expect((await empleado.patch(`/api/admin/bookings/${id}`, { estado: 'cancelado' })).status).toBe(403);
    expect((await empleado.patch(`/api/admin/bookings/${id}`, { fechaConfirmada: '2026-10-20', franjaConfirmada: 'tarde', monto: 5 })).status).toBe(403);
  });
});

describe('el empleado nunca recibe importes', () => {
  it('listado, agenda y PATCH llevan monto null aunque el turno lo tenga; el trabajador sí se ve', async () => {
    const { context, admin, empleado, adminId } = await equipo();
    const id = await turno(context, { fecha: '2026-10-16', monto: 88000, trabajador: adminId });

    const lista = await empleado.get('/api/admin/bookings');
    expect(lista.body.bookings[0]).toMatchObject({ id, monto: null, trabajador: { id: adminId } });
    const agenda = await empleado.get('/api/admin/agenda?desde=2026-10-16&hasta=2026-10-16');
    expect(agenda.body.turnos[0]).toMatchObject({ id, monto: null });
    const patch = await empleado.patch(`/api/admin/bookings/${id}`, { notasInternas: 'nota' });
    expect(patch.body.booking.monto).toBeNull();
    const patch2 = await empleado.patch(`/api/admin/bookings/${id}`, { estado: 'completado' });
    expect(patch2.body.booking.monto).toBeNull();
    for (const body of [lista.body, agenda.body, patch.body, patch2.body]) {
      expect(JSON.stringify(body)).not.toContain('88000');
    }
    expect((await admin.get('/api/admin/bookings')).body.bookings[0].monto).toBe(88000);

    // el resto de los endpoints del empleado
    expect((await empleado.get('/api/admin/estadisticas')).status).toBe(403);
    expect((await empleado.get('/api/admin/trabajadores')).status).toBe(403);
    const mias = await empleado.get('/api/admin/estadisticas/mias?desde=2026-10-01&hasta=2026-10-31');
    expect(JSON.stringify(mias.body)).not.toMatch(/ingresos|monto|88000/);
  });

  it('el seguimiento público nunca devuelve monto ni trabajador', async () => {
    const { context, adminId } = await equipo();
    const id = await turno(context, { fecha: '2026-10-16', monto: 88000, trabajador: adminId });
    const response = await rawPost(context.app, '/api/bookings').send(validBooking());
    expect(response.status).toBe(201);
    for (const turnoId of [id, response.body.booking?.id ?? id]) {
      const seguimiento = await (await import('supertest')).default(context.app).get(`/api/turnos/${turnoId as string}`);
      const texto = JSON.stringify(seguimiento.body);
      expect(texto).not.toMatch(/monto|trabajador|88000|Ana/);
    }
  });
});

describe('base de datos: monto y trabajador_id', () => {
  it('CHECK de rango y de coherencia con el estado; mgdetailing_app puede actualizar las dos columnas', async () => {
    const { context, adminId } = await equipo();
    const pendiente = await turno(context, { fecha: '2026-10-16', estado: 'pendiente' });
    const hecho = await turno(context, { fecha: '2026-10-16' });

    await expect(context.db.sql.query('UPDATE mgdetailing.bookings SET monto = 10 WHERE id = $1::uuid', [pendiente])).rejects.toThrow(/bookings_cobro_solo_completado/);
    await expect(context.db.sql.query('UPDATE mgdetailing.bookings SET trabajador_id = $2::uuid WHERE id = $1::uuid', [pendiente, adminId])).rejects.toThrow(/bookings_cobro_solo_completado/);
    await expect(context.db.sql.query('UPDATE mgdetailing.bookings SET monto = -1 WHERE id = $1::uuid', [hecho])).rejects.toThrow(/bookings_monto_rango/);
    await expect(context.db.sql.query('UPDATE mgdetailing.bookings SET monto = 100000000 WHERE id = $1::uuid', [hecho])).rejects.toThrow(/bookings_monto_rango/);
    await expect(context.db.sql.query("UPDATE mgdetailing.bookings SET trabajador_id = gen_random_uuid() WHERE id = $1::uuid", [hecho])).rejects.toThrow(/bookings_trabajador_id_fkey/);
    await expect(context.db.sql.query("UPDATE mgdetailing.bookings SET estado = 'pendiente' WHERE id = $1::uuid", [await turno(context, { fecha: '2026-10-16', monto: 1 })])).rejects.toThrow(/bookings_cobro_solo_completado/);

    await context.db.appSql.query('UPDATE mgdetailing.bookings SET monto = 10, trabajador_id = $2::uuid WHERE id = $1::uuid', [hecho, adminId]);
    expect(await fila(context, hecho)).toMatchObject({ monto: 10, trabajador_id: adminId });
  });

  it('editar solo monto o trabajador no cambia updated_at; el resto de los cambios sí lo actualiza', async () => {
    const { context, adminId } = await equipo();
    const id = await turno(context, { fecha: '2026-10-16' });
    await context.db.sql.query("UPDATE mgdetailing.bookings SET updated_at = '2000-01-01T00:00:00Z'");
    await context.db.sql.query('UPDATE mgdetailing.bookings SET monto = 5, trabajador_id = $1::uuid', [adminId]);
    expect(((await fila(context, id))?.updated_at as Date).getUTCFullYear()).toBe(2000);
    await context.db.sql.query("UPDATE mgdetailing.bookings SET notas_internas = 'x'");
    expect(((await fila(context, id))?.updated_at as Date).getUTCFullYear()).toBeGreaterThan(2020);
  });

  it('si la persona se borra, el turno queda sin asignar y las estadísticas lo cuentan como "Sin asignar"', async () => {
    const { context, admin } = await equipo();
    const baja = await addUser(context, { email: 'baja@t.test', rol: 'empleado', nombre: 'Baja' });
    const id = await turno(context, { fecha: '2026-10-16', monto: 1000, trabajador: baja });
    await context.db.sql.query('DELETE FROM auth.users WHERE id = $1::uuid', [baja]);
    expect(await fila(context, id)).toMatchObject({ monto: 1000, trabajador_id: null });
    const stats = await admin.get('/api/admin/estadisticas?desde=2026-10-16&hasta=2026-10-16');
    expect(stats.body.porTrabajador).toEqual([{ id: null, nombre: 'Sin asignar', completados: 1, ingresos: 1000 }]);
    expect(stats.body.completadosSinTrabajador).toBe(1);
  });
});

describe('GET /api/admin/trabajadores', () => {
  it('personas activas de cualquier rol, por nombre; solo admin y superadmin', async () => {
    const { context, admin, superadmin, empleado } = await equipo();
    await addUser(context, { email: 'zeta@t.test', rol: 'empleado', nombre: 'zeta' });
    await addUser(context, { email: 'off@t.test', rol: 'empleado', nombre: 'Inactivo', activo: false });
    await addUser(context, { email: 'mail@t.test', rol: 'admin', nombre: null });
    for (const client of [admin, superadmin]) {
      const response = await client.get('/api/admin/trabajadores');
      expect(response.status).toBe(200);
      expect((response.body.trabajadores as { nombre: string; rol: string }[]).map((t) => [t.nombre, t.rol])).toEqual([
        ['Ana', 'admin'],
        ['Beto', 'empleado'],
        ['mail@t.test', 'admin'],
        ['Super', 'superadmin'],
        ['zeta', 'empleado'],
      ]);
      expect(Object.keys(response.body.trabajadores[0] as object).sort()).toEqual(['id', 'nombre', 'rol']);
    }
    expect((await empleado.get('/api/admin/trabajadores')).status).toBe(403);
    expect((await createTestContext().then(async (c) => (await import('supertest')).default(c.app).get('/api/admin/trabajadores'))).status).toBe(401);
  });
});

async function cargarDatos(context: TestContext, ana: string, beto: string): Promise<void> {
  await turno(context, { fecha: '2026-10-16', monto: 50000, trabajador: ana, servicio: 'pulido', franja: 'manana' });
  await turno(context, { fecha: '2026-10-15', monto: 30000, trabajador: beto, servicio: 'encerado', franja: 'tarde' });
  await turno(context, { fecha: '2026-10-02', servicio: 'pulido' }); // sin monto ni trabajador
  await turno(context, { fecha: '2026-10-10', estado: 'cancelado' });
  await turno(context, { fecha: '2026-10-12', estado: 'pendiente', franja: 'tarde' });
  await turno(context, { fecha: '2026-10-13', estado: 'confirmado', servicio: 'lavado-basico' });
  await turno(context, { fecha: '2026-09-16', monto: 20000, trabajador: ana });
  await turno(context, { fecha: '2026-09-17', monto: 99999, trabajador: ana }); // fuera del "mes pasado hasta el 16"
  await turno(context, { fecha: '2025-10-16', monto: 10000, trabajador: beto });
  await turno(context, { fecha: '2025-10-17', monto: 777, trabajador: beto }); // fuera del "año pasado hasta el 16/10"
}

describe('GET /api/admin/estadisticas', () => {
  it('forma exacta del contrato, con el mes actual hasta hoy por omisión', async () => {
    const { context, admin, adminId, empleadoId } = await equipo();
    await cargarDatos(context, adminId, empleadoId);
    const response = await admin.get('/api/admin/estadisticas');
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const body = response.body;
    expect(Object.keys(body).sort()).toEqual(
      ['completadosSinTrabajador', 'granularidad', 'periodo', 'porDiaSemana', 'porServicio', 'porTrabajador', 'rango', 'resumen', 'serie'],
    );
    expect(body.rango).toEqual({ desde: '2026-10-01', hasta: '2026-10-16' });
    expect(body.granularidad).toBe('dia');
    expect(body.resumen).toEqual({
      hoy: { actual: { completados: 1, ingresos: 50000 }, anterior: { completados: 1, ingresos: 30000 } },
      mes: { actual: { completados: 3, ingresos: 80000 }, anterior: { completados: 1, ingresos: 20000 } },
      anio: { actual: { completados: 5, ingresos: 199999 }, anterior: { completados: 1, ingresos: 10000 } },
    });
    expect(body.periodo).toEqual({
      turnos: 6,
      pedidos: 5,
      pendientes: 1,
      confirmados: 1,
      completados: 3,
      cancelados: 1,
      ingresos: 80000,
      ticketPromedio: 40000,
      completadosSinMonto: 1,
      tasaCancelacion: 0.1667,
    });
    expect(body.serie).toHaveLength(16);
    expect(body.serie[0]).toEqual({ clave: '2026-10-01', completados: 0, ingresos: 0 });
    expect(body.serie[15]).toEqual({ clave: '2026-10-16', completados: 1, ingresos: 50000 });
    expect(body.serie[1]).toEqual({ clave: '2026-10-02', completados: 1, ingresos: 0 });
    expect(body.porServicio[0]).toEqual({ servicioId: 'pulido', nombre: 'Pulido', pedidos: 3, completados: 2, ingresos: 50000 });
    expect(body.porTrabajador).toEqual([
      { id: adminId, nombre: 'Ana', completados: 1, ingresos: 50000 },
      { id: empleadoId, nombre: 'Beto', completados: 1, ingresos: 30000 },
      { id: null, nombre: 'Sin asignar', completados: 1, ingresos: 0 },
    ]);
    expect(body.completadosSinTrabajador).toBe(1);
    expect(body.porDiaSemana).toHaveLength(7);
    // viernes 16/10 mañana (1), jueves 15/10 tarde (1), lunes 12/10 tarde, martes 13/10 mañana, viernes 2/10 mañana
    expect(body.porDiaSemana[5]).toEqual({ dia: 5, manana: 2, tarde: 0 });
    expect(body.porDiaSemana[4]).toEqual({ dia: 4, manana: 0, tarde: 1 });
    expect(body.porDiaSemana[0]).toEqual({ dia: 0, manana: 0, tarde: 0 });
  });

  it('porServicio: activos sin pedidos con 0; desactivado solo si tuvo pedidos; ordenado por pedidos', async () => {
    const { context, admin } = await equipo();
    await context.db.sql.query("UPDATE mgdetailing.servicios SET activo = false WHERE id IN ('encerado', 'restauracion-opticas')");
    await turno(context, { fecha: '2026-10-05', servicio: 'encerado' });
    await turno(context, { fecha: '2026-10-05', servicio: 'lavado-basico', estado: 'pendiente' });
    await turno(context, { fecha: '2026-10-06', servicio: 'lavado-basico', estado: 'confirmado' });
    await turno(context, { fecha: '2026-10-06', servicio: 'restauracion-opticas', estado: 'cancelado' });
    const { body } = await admin.get('/api/admin/estadisticas?desde=2026-10-01&hasta=2026-10-31');
    expect((body.porServicio as { servicioId: string; pedidos: number }[]).map((s) => [s.servicioId, s.pedidos])).toEqual([
      ['lavado-basico', 2],
      ['encerado', 1],
      ['lavado-premium', 0],
      ['pulido', 0],
    ]);
  });

  it('usa la fecha confirmada de agenda cuando existe', async () => {
    const { context, admin } = await equipo();
    await turno(context, { fecha: '2026-10-01', estado: 'confirmado', confirmada: { fecha: '2026-10-16', franja: 'tarde' } });
    const { body } = await admin.get('/api/admin/estadisticas?desde=2026-10-16&hasta=2026-10-16');
    expect(body.periodo.turnos).toBe(1);
    expect(body.porDiaSemana[5]).toEqual({ dia: 5, manana: 0, tarde: 1 });
    expect((await admin.get('/api/admin/estadisticas?desde=2026-10-01&hasta=2026-10-01')).body.periodo.turnos).toBe(0);
  });

  it('período vacío: ceros, ticket y tasa null, serie completa; también un rango en el futuro', async () => {
    const { admin } = await equipo();
    const { body } = await admin.get('/api/admin/estadisticas?desde=2027-03-01&hasta=2027-03-03');
    expect(body.periodo).toMatchObject({ turnos: 0, ingresos: 0, ticketPromedio: null, tasaCancelacion: null, completadosSinMonto: 0 });
    expect(body.serie).toEqual(['2027-03-01', '2027-03-02', '2027-03-03'].map((clave) => ({ clave, completados: 0, ingresos: 0 })));
    expect(body.porTrabajador).toEqual([]);
    expect(body.resumen.hoy).toEqual({ actual: { completados: 0, ingresos: 0 }, anterior: { completados: 0, ingresos: 0 } });
  });

  it('granularidad: por día hasta 62 días y por mes con más, con todos los meses', async () => {
    const { context, admin } = await equipo();
    await turno(context, { fecha: '2026-01-31', monto: 100 });
    await turno(context, { fecha: '2026-02-01', monto: 200 });
    await turno(context, { fecha: '2026-06-15', monto: 400 });
    const dia = await admin.get('/api/admin/estadisticas?desde=2026-01-01&hasta=2026-03-03'); // 62 días
    expect(dia.body.granularidad).toBe('dia');
    expect(dia.body.serie).toHaveLength(62);
    const mes = await admin.get('/api/admin/estadisticas?desde=2026-01-01&hasta=2026-03-04'); // 63 días
    expect(mes.body.granularidad).toBe('mes');
    expect(mes.body.serie).toEqual([
      { clave: '2026-01', completados: 1, ingresos: 100 },
      { clave: '2026-02', completados: 1, ingresos: 200 },
      { clave: '2026-03', completados: 0, ingresos: 0 },
    ]);
    const anio = await admin.get('/api/admin/estadisticas?desde=2026-01-01&hasta=2026-12-31');
    expect(anio.body.serie).toHaveLength(12);
    expect(anio.body.serie[5]).toEqual({ clave: '2026-06', completados: 1, ingresos: 400 });
    // meses parciales: solo cuenta lo que cae en el rango
    const parcial = await admin.get('/api/admin/estadisticas?desde=2026-01-31&hasta=2026-04-30');
    expect(parcial.body.serie[0]).toEqual({ clave: '2026-01', completados: 1, ingresos: 100 });
    expect((await admin.get('/api/admin/estadisticas?desde=2026-02-01&hasta=2026-04-30')).body.serie[0]).toEqual({
      clave: '2026-02',
      completados: 1,
      ingresos: 200,
    });
  });

  it('rango inválido: formato, hasta anterior a desde y más de 366 días (366 sí)', async () => {
    const { admin } = await equipo();
    const casos: [string, string][] = [
      ['desde=2026-13-01', 'desde'],
      ['desde=2026-02-30&hasta=2026-03-01', 'desde'],
      ['hasta=hoy', 'hasta'],
      ['desde=2026-10-10&hasta=2026-10-09', 'hasta'],
      ['desde=2025-10-16&hasta=2026-10-17', 'hasta'], // 367 días
      ['desde=2026-10-17', 'hasta'], // sin hasta: hoy es anterior a desde
    ];
    for (const [query, campo] of casos) {
      const response = await admin.get(`/api/admin/estadisticas?${query}`);
      expect(response.status, query).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.fields[campo], query).toBeTypeOf('string');
      expect((await admin.get(`/api/admin/estadisticas/mias?${query}`)).status, query).toBe(400);
    }
    expect((await admin.get('/api/admin/estadisticas?desde=2025-10-16&hasta=2026-10-16')).status).toBe(200); // 366 días
    expect((await admin.get('/api/admin/estadisticas?desde=2024-02-29&hasta=2025-02-28')).status).toBe(200); // 366 días
    expect((await admin.get('/api/admin/estadisticas?desde=2024-02-29&hasta=2025-03-01')).status).toBe(400); // 367
  });

  it('un servidor en UTC no corre el día: a las 22:30 de La Rioja ya es "mañana" en UTC y hoy sigue siendo hoy', async () => {
    const tz = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const { context, admin, adminId } = await equipo({ now: new Date('2026-10-17T01:30:00.000Z') }); // 16/10 22:30 en La Rioja
      await turno(context, { fecha: '2026-10-16', monto: 1000, trabajador: adminId });
      await turno(context, { fecha: '2026-10-17', monto: 5000, trabajador: adminId });
      const { body } = await admin.get('/api/admin/estadisticas');
      expect(body.rango).toEqual({ desde: '2026-10-01', hasta: '2026-10-16' });
      expect(body.resumen.hoy.actual).toEqual({ completados: 1, ingresos: 1000 });
      expect(body.periodo.ingresos).toBe(1000);
      // pasada la medianoche de La Rioja (03:00 UTC) cambia el día
      context.clock.current = new Date('2026-10-17T03:00:00.000Z');
      const manana = await loginClient(context, 'ana@t.test');
      expect((await manana.get('/api/admin/estadisticas')).body.resumen.hoy.actual).toEqual({ completados: 1, ingresos: 5000 });
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  it('superadmin también las ve; sin sesión, 401', async () => {
    const { superadmin, context } = await equipo();
    expect((await superadmin.get('/api/admin/estadisticas')).status).toBe(200);
    const anon = (await import('supertest')).default(context.app);
    expect((await anon.get('/api/admin/estadisticas')).status).toBe(401);
    expect((await anon.get('/api/admin/estadisticas/mias')).status).toBe(401);
  });
});

describe('fechas de los períodos de comparación', () => {
  it('mes pasado con tope en el último día del mes más corto; año pasado con 29/02', () => {
    expect(sameDayPreviousMonth('2026-03-31')).toBe('2026-02-28');
    expect(sameDayPreviousMonth('2028-03-31')).toBe('2028-02-29');
    expect(sameDayPreviousMonth('2026-01-15')).toBe('2025-12-15');
    expect(sameDayPreviousMonth('2026-05-31')).toBe('2026-04-30');
    expect(sameDayPreviousYear('2028-02-29')).toBe('2027-02-28');
    expect(sameDayPreviousYear('2029-03-10')).toBe('2028-03-10');
    expect(sameDayPreviousYear('2026-12-31')).toBe('2025-12-31');
  });

  it('rangosDelResumen en fin de mes, fin de año y año bisiesto', () => {
    const rangos = (hoy: string) => Object.fromEntries(rangosDelResumen(hoy).map((r) => [r.clave, [r.desde, r.hasta]]));
    expect(rangos('2026-03-31')).toMatchObject({
      'hoy.anterior': ['2026-03-30', '2026-03-30'],
      'mes.actual': ['2026-03-01', '2026-03-31'],
      'mes.anterior': ['2026-02-01', '2026-02-28'],
    });
    expect(rangos('2027-01-01')).toMatchObject({
      'hoy.anterior': ['2026-12-31', '2026-12-31'],
      'mes.anterior': ['2026-12-01', '2026-12-01'],
      'anio.actual': ['2027-01-01', '2027-01-01'],
      'anio.anterior': ['2026-01-01', '2026-01-01'],
    });
    expect(rangos('2028-02-29')).toMatchObject({
      'mes.anterior': ['2028-01-01', '2028-01-29'],
      'anio.anterior': ['2027-01-01', '2027-02-28'],
    });
    expect(rangos('2029-03-01')).toMatchObject({ 'anio.anterior': ['2028-01-01', '2028-03-01'] });
    expect(rangos('2026-10-16')['hoy.anterior']).toEqual(['2026-10-15', '2026-10-15']);
  });

  it('comparación con un 29/02 de por medio, de punta a punta', async () => {
    const { context, admin } = await equipo({ now: new Date('2029-03-01T15:00:00.000Z') });
    await turno(context, { fecha: '2028-02-29', monto: 700 }); // dentro de "año pasado hasta el 1/3"
    await turno(context, { fecha: '2028-03-01', monto: 300 });
    await turno(context, { fecha: '2028-03-02', monto: 9 }); // fuera
    const { body } = await admin.get('/api/admin/estadisticas');
    expect(body.resumen.anio.anterior).toEqual({ completados: 2, ingresos: 1000 });
    expect(body.resumen.hoy.anterior).toEqual({ completados: 0, ingresos: 0 }); // el 28/02/2029
  });

  it('resolverRango: valores por omisión', () => {
    expect(resolverRango({}, '2026-10-16')).toEqual({ ok: true, rango: { desde: '2026-10-01', hasta: '2026-10-16' } });
    expect(resolverRango({ hasta: '2026-08-20' }, '2026-10-16')).toEqual({ ok: true, rango: { desde: '2026-08-01', hasta: '2026-08-20' } });
    expect(resolverRango({ desde: '2026-10-10' }, '2026-10-16')).toEqual({ ok: true, rango: { desde: '2026-10-10', hasta: '2026-10-16' } });
  });
});

describe('GET /api/admin/estadisticas/mias', () => {
  it('solo lo que completó esa persona, por servicio y por día, sin importes ni datos de otros', async () => {
    const { context, empleado, empleadoId, adminId, admin } = await equipo();
    await turno(context, { fecha: '2026-10-15', monto: 30000, trabajador: empleadoId, servicio: 'encerado' });
    await turno(context, { fecha: '2026-10-15', monto: 1, trabajador: empleadoId, servicio: 'encerado' });
    await turno(context, { fecha: '2026-10-16', trabajador: empleadoId, servicio: 'pulido' });
    await turno(context, { fecha: '2026-10-16', monto: 50000, trabajador: adminId, servicio: 'pulido' });
    await turno(context, { fecha: '2026-10-16', estado: 'pendiente' });
    await turno(context, { fecha: '2026-09-30', trabajador: empleadoId }); // fuera del rango
    const response = await empleado.get('/api/admin/estadisticas/mias');
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['completados', 'porServicio', 'rango', 'serie']);
    expect(response.body.rango).toEqual({ desde: '2026-10-01', hasta: '2026-10-16' });
    expect(response.body.completados).toBe(3);
    expect(response.body.porServicio).toEqual([
      { servicioId: 'encerado', nombre: 'Encerado', completados: 2 },
      { servicioId: 'pulido', nombre: 'Pulido', completados: 1 },
    ]);
    expect(response.body.serie).toHaveLength(16);
    expect(response.body.serie[14]).toEqual({ clave: '2026-10-15', completados: 2 });
    expect(response.body.serie[15]).toEqual({ clave: '2026-10-16', completados: 1 });
    expect(response.body.serie[0]).toEqual({ clave: '2026-10-01', completados: 0 });
    expect(JSON.stringify(response.body)).not.toMatch(/ingresos|monto|30000|50000/);
    // el admin ve solo lo suyo en "mias"
    const suyas = await admin.get('/api/admin/estadisticas/mias');
    expect(suyas.body.completados).toBe(1);
    // sin trabajos: ceros
    const vacio = await empleado.get('/api/admin/estadisticas/mias?desde=2026-01-01&hasta=2026-01-03');
    expect(vacio.body).toMatchObject({ completados: 0, porServicio: [] });
    expect(vacio.body.serie).toHaveLength(3);
    // por mes en rangos largos
    const largo = await empleado.get('/api/admin/estadisticas/mias?desde=2026-01-01&hasta=2026-12-31');
    expect(largo.body.serie).toHaveLength(12);
    expect(largo.body.serie[9]).toEqual({ clave: '2026-10', completados: 3 });
  });
});
