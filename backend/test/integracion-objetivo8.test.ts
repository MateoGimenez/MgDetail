import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BACKEND_ROOT } from '../src/config.js';
import { type TestContext, addUser, closeAllContexts, createTestContext, loginClient } from './helpers.js';

afterEach(closeAllContexts);

/*
 * Objetivo 8, de punta a punta por la API (app de test + PGlite) y contrato con el frontend.
 *
 * 1. El flujo del taller: completar con cobro, estadísticas, empleado, corrección, baja de la persona, vuelta a pendiente.
 * 2. Las respuestas REALES del backend se guardan en frontend/src/api/fixtures-backend/respuestas.json y el test
 *    frontend/src/api/contrato-backend.test.ts las pasa por los esquemas estrictos del panel. Para regenerarlas:
 *    ACTUALIZAR_FIXTURES=1 npx vitest run test/integracion-objetivo8.test.ts (sin la variable, el test verifica que el
 *    archivo guardado coincide con lo que devuelve el backend hoy: si el contrato cambia y nadie regeneró, falla).
 */

async function turno(context: TestContext, fecha: string, estado = 'confirmado', servicio = 'pulido'): Promise<string> {
  const { rows } = await context.db.sql.query(
    `INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja, estado)
     VALUES ('Cliente Largo Nombre', '12345678', 'auto', $1, $2::date, 'manana', $3) RETURNING id::text AS id`,
    [servicio, fecha, estado],
  );
  return String(rows[0]?.id);
}

describe('flujo completo: cobro, estadísticas, empleado, baja de la persona y vuelta a pendiente', () => {
  it('los números siguen a cada paso', async () => {
    const context = await createTestContext();
    await addUser(context, { email: 'ana@t.test', rol: 'admin', nombre: 'Ana' });
    const beto = await addUser(context, { email: 'beto@t.test', rol: 'empleado', nombre: 'Beto' });
    const carla = await addUser(context, { email: 'carla@t.test', rol: 'empleado', nombre: 'Carla' });
    const admin = await loginClient(context, 'ana@t.test');
    const empleado = await loginClient(context, 'beto@t.test');
    const t1 = await turno(context, '2026-10-16');
    const t2 = await turno(context, '2026-10-16', 'confirmado', 'encerado');
    const stats = async () => (await admin.get('/api/admin/estadisticas')).body;

    // 1. el admin completa con monto y trabajador
    const r1 = await admin.patch(`/api/admin/bookings/${t1}`, { estado: 'completado', monto: 60000, trabajadorId: carla });
    expect(r1.status).toBe(200);
    let s = await stats();
    expect(s.periodo).toMatchObject({ completados: 1, ingresos: 60000, ticketPromedio: 60000, completadosSinMonto: 0 });
    expect(s.porTrabajador).toEqual([{ id: carla, nombre: 'Carla', completados: 1, ingresos: 60000 }]);
    expect(s.resumen.hoy.actual).toEqual({ completados: 1, ingresos: 60000 });

    // 2. el empleado completa otro: queda él, sin monto
    const r2 = await empleado.patch(`/api/admin/bookings/${t2}`, { estado: 'completado' });
    expect(r2.status).toBe(200);
    expect(r2.body.booking).toMatchObject({ monto: null, trabajador: { id: beto, nombre: 'Beto' } });
    s = await stats();
    expect(s.periodo).toMatchObject({ completados: 2, ingresos: 60000, completadosSinMonto: 1, ticketPromedio: 60000 });
    expect(s.porTrabajador.map((f: { nombre: string }) => f.nombre).sort()).toEqual(['Beto', 'Carla']);
    const mias = (await empleado.get('/api/admin/estadisticas/mias')).body;
    expect(mias.completados).toBe(1);
    expect(mias.porServicio).toEqual([{ servicioId: 'encerado', nombre: 'Encerado', completados: 1 }]);
    expect(JSON.stringify(mias)).not.toMatch(/60000|ingresos|monto/);

    // 3. el admin le carga el cobro
    const r3 = await admin.patch(`/api/admin/bookings/${t2}`, { monto: 40000 });
    expect(r3.status).toBe(200);
    s = await stats();
    expect(s.periodo).toMatchObject({ ingresos: 100000, completadosSinMonto: 0, ticketPromedio: 50000 });
    expect(s.completadosSinTrabajador).toBe(0);

    // 4. se borra a Carla: su trabajo queda "Sin asignar" y no se pierde el ingreso
    await context.db.sql.query('DELETE FROM auth.users WHERE id = $1::uuid', [carla]);
    s = await stats();
    expect(s.periodo.ingresos).toBe(100000);
    expect(s.porTrabajador).toContainEqual({ id: null, nombre: 'Sin asignar', completados: 1, ingresos: 60000 });
    expect(s.completadosSinTrabajador).toBe(1);
    const lista = (await admin.get('/api/admin/bookings')).body.bookings as { id: string; monto: number | null; trabajador: unknown }[];
    expect(lista.find((b) => b.id === t1)).toMatchObject({ monto: 60000, trabajador: null });

    // 5. vuelve a pendiente: se limpia el cobro y bajan los ingresos
    const r5 = await admin.patch(`/api/admin/bookings/${t1}`, { estado: 'pendiente' });
    expect(r5.status).toBe(200);
    expect(r5.body.booking).toMatchObject({ estado: 'pendiente', monto: null, trabajador: null });
    s = await stats();
    expect(s.periodo).toMatchObject({ completados: 1, ingresos: 40000, ticketPromedio: 40000 });
    expect(s.completadosSinTrabajador).toBe(0);
    expect(s.resumen.hoy.actual).toEqual({ completados: 1, ingresos: 40000 });
  });
});

/* ---------- Fixtures para el frontend ---------- */

const FIXTURES = path.join(BACKEND_ROOT, '..', 'frontend', 'src', 'api', 'fixtures-backend', 'respuestas.json');

/** Ids y fechas de hora aleatorios se reemplazan por valores estables, en orden de aparición. */
function normalizar(valor: unknown): unknown {
  const ids = new Map<string, string>();
  const texto = JSON.stringify(valor)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => {
      if (!ids.has(id)) ids.set(id, `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, '0')}`);
      return ids.get(id) ?? id;
    })
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '2026-10-16T15:00:00.000Z');
  return JSON.parse(texto);
}

describe('respuestas reales del backend para los esquemas del frontend', () => {
  it('coinciden con las guardadas en frontend/src/api/fixtures-backend (ACTUALIZAR_FIXTURES=1 las regenera)', async () => {
    const context = await createTestContext();
    const ana = await addUser(context, { email: 'ana@t.test', rol: 'admin', nombre: 'Ana' });
    await addUser(context, { email: 'beto@t.test', rol: 'empleado', nombre: 'Beto' });
    await addUser(context, { email: 'sin@t.test', rol: 'empleado', nombre: null });
    const admin = await loginClient(context, 'ana@t.test');
    const empleado = await loginClient(context, 'beto@t.test');

    const a = await turno(context, '2026-10-16');
    const b = await turno(context, '2026-10-16', 'confirmado', 'encerado');
    const c = await turno(context, '2026-10-15', 'pendiente');
    const d = await turno(context, '2026-09-20', 'confirmado');
    await turno(context, '2026-10-14', 'cancelado');
    const capturas: Record<string, { status: number; body: unknown }> = {};
    const cap = (nombre: string, res: { status: number; body: unknown }) => {
      capturas[nombre] = { status: res.status, body: res.body };
    };

    cap('patchAdminCompleta', await admin.patch(`/api/admin/bookings/${a}`, { estado: 'completado', monto: 60000, trabajadorId: ana }));
    cap('patchEmpleadoCompleta', await empleado.patch(`/api/admin/bookings/${b}`, { estado: 'completado' }));
    cap('patchAdminCompletaSinCobro', await admin.patch(`/api/admin/bookings/${d}`, { estado: 'completado' }));
    cap('error400Monto', await admin.patch(`/api/admin/bookings/${c}`, { monto: 5 }));
    cap('error400MontoRango', await admin.patch(`/api/admin/bookings/${a}`, { monto: 100000000 }));
    cap('error400Trabajador', await admin.patch(`/api/admin/bookings/${c}`, { trabajadorId: ana }));
    cap('error400TrabajadorInexistente', await admin.patch(`/api/admin/bookings/${a}`, { trabajadorId: '11111111-1111-4111-8111-111111111111' }));
    cap('error403EmpleadoMonto', await empleado.patch(`/api/admin/bookings/${c}`, { monto: 5 }));
    cap('error403EmpleadoCorrige', await empleado.patch(`/api/admin/bookings/${a}`, { notasInternas: 'x', trabajadorId: ana }));
    cap('error403EstadisticasEmpleado', await empleado.get('/api/admin/estadisticas'));

    cap('listaAdmin', await admin.get('/api/admin/bookings'));
    cap('listaEmpleado', await empleado.get('/api/admin/bookings'));
    cap('agendaAdmin', await admin.get('/api/admin/agenda?desde=2026-10-14&hasta=2026-10-16'));
    cap('agendaEmpleado', await empleado.get('/api/admin/agenda?desde=2026-10-14&hasta=2026-10-16'));
    cap('trabajadores', await admin.get('/api/admin/trabajadores'));
    cap('estadisticasMes', await admin.get('/api/admin/estadisticas'));
    cap('estadisticasAnio', await admin.get('/api/admin/estadisticas?desde=2026-01-01&hasta=2026-12-31'));
    cap('estadisticasVacio', await admin.get('/api/admin/estadisticas?desde=2020-01-01&hasta=2020-01-07'));
    cap('misTrabajos', await empleado.get('/api/admin/estadisticas/mias'));
    cap('misTrabajosAnio', await empleado.get('/api/admin/estadisticas/mias?desde=2026-01-01&hasta=2026-12-31'));
    cap('permisosEmpleado', await empleado.get('/api/admin/permisos'));
    cap('permisosAdmin', await admin.get('/api/admin/permisos'));

    const generadas = normalizar(capturas);
    if (process.env.ACTUALIZAR_FIXTURES === '1') {
      mkdirSync(path.dirname(FIXTURES), { recursive: true });
      writeFileSync(FIXTURES, `${JSON.stringify(generadas, null, 2)}\n`);
    }
    expect(existsSync(FIXTURES), 'Faltan las respuestas guardadas: correr con ACTUALIZAR_FIXTURES=1').toBe(true);
    expect(generadas).toEqual(JSON.parse(readFileSync(FIXTURES, 'utf8')));
  });
});
