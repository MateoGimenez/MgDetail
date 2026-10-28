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
    expect(s.resumen.hoy.actual).toEqual({ completados: 1, ingresos: 60000, gastos: 0, ganancia: 60000 });

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
    expect(s.resumen.hoy.actual).toEqual({ completados: 1, ingresos: 40000, gastos: 0, ganancia: 40000 });
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

    // Objetivo 10 (M1): gastos, metas y datos del taller. Los gastos van ANTES de las estadísticas que los suman.
    cap('gastoCrea', await admin.post('/api/admin/gastos', { fecha: '2026-10-14', categoria: 'insumos', descripcion: 'Cera en pasta y paños', monto: 12500, proveedor: 'Distribuidora Norte' }));
    cap('gastoCreaSinProveedor', await admin.post('/api/admin/gastos', { fecha: '2026-10-02', categoria: 'alquiler', descripcion: 'Alquiler del local', monto: 90000 }));
    await admin.post('/api/admin/gastos', { fecha: '2026-09-20', categoria: 'servicios', descripcion: 'Luz y agua', monto: 8000 });
    await context.db.sql.query(
      "INSERT INTO mgdetailing.gastos (fecha, categoria, descripcion, monto, origen) VALUES ('2026-10-10', 'insumos', 'Compra: Shampoo (5 litro)', 6000, 'inventario')",
    );
    cap('error400GastoFechaFutura', await admin.post('/api/admin/gastos', { fecha: '2026-10-17', categoria: 'otros', descripcion: 'x', monto: 5 }));
    cap('error400GastoMonto', await admin.post('/api/admin/gastos', { fecha: '2026-10-14', categoria: 'otros', descripcion: 'x', monto: 0 }));
    cap('gastosLista', await admin.get('/api/admin/gastos'));
    cap('gastosFiltrados', await admin.get('/api/admin/gastos?categoria=insumos&q=cera&limit=1'));
    const inventario = (capturas.gastosLista?.body as { gastos: { id: string; origen: string }[] }).gastos.find((g) => g.origen === 'inventario');
    cap('error409GastoDeInventario', await admin.patch(`/api/admin/gastos/${String(inventario?.id)}`, { monto: 1 }));
    cap('error403GastosEmpleado', await empleado.get('/api/admin/gastos'));
    cap('metaPut', await admin.put('/api/admin/metas/2026-10', { ingresosObjetivo: 1500000, trabajosObjetivo: 40 }));
    await admin.put('/api/admin/metas/2026-09', { ingresosObjetivo: 50000 });
    cap('error400MetaVacia', await admin.put('/api/admin/metas/2026-08', {}));
    cap('metasActual', await admin.get('/api/admin/metas/actual'));
    cap('metasAnio', await admin.get('/api/admin/metas?anio=2026'));
    cap('error403MetasEmpleado', await empleado.get('/api/admin/metas/actual'));
    cap('tallerGet', await admin.get('/api/admin/taller'));
    cap('tallerPut', await admin.put('/api/admin/taller', { nombre: 'MgDetailing', telefono: '5493804781737', direccion: 'Calle Olta Pasaje N2, La Rioja', instagram: 'mgdetailing', cuit: '20-12345678-9', leyendaPdf: 'Gracias por confiar en nosotros.' }));
    cap('error400Taller', await admin.put('/api/admin/taller', { nombre: '', telefono: '380-478', instagram: '@mgdetailing', cuit: '123' }));
    cap('error403TallerEmpleado', await empleado.get('/api/admin/taller'));

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

    // Objetivo 10 (M2/M3): inventario, presupuestos y comprobantes. Van al FINAL: una compra con costo crea un gasto del
    // mes, y las capturas de gastos y estadísticas de arriba no tienen que cambiar.
    cap('insumoCrea', await admin.post('/api/admin/insumos', { nombre: 'Shampoo ph neutro', categoria: 'Lavado', unidad: 'litro', stockInicial: 5, stockMinimo: 2, costoUnitario: 1200 }));
    cap('insumoCreaSinCosto', await admin.post('/api/admin/insumos', { nombre: 'Cera en pasta', unidad: 'unidad', stockInicial: 1, stockMinimo: 3 }));
    cap('error400Insumo', await admin.post('/api/admin/insumos', { nombre: '', unidad: 'galon', stockInicial: 1.234 }));
    cap('error409InsumoRepetido', await admin.post('/api/admin/insumos', { nombre: 'SHAMPOO PH NEUTRO', unidad: 'litro' }));
    cap('error403InsumoEmpleado', await empleado.post('/api/admin/insumos', { nombre: 'Paño', unidad: 'unidad' }));
    const shampoo = (capturas.insumoCrea?.body as { insumo: { id: string } }).insumo.id;
    const cera = (capturas.insumoCreaSinCosto?.body as { insumo: { id: string } }).insumo.id;
    cap('insumoPatch', await admin.patch(`/api/admin/insumos/${shampoo}`, { categoria: 'Lavado exterior', stockMinimo: 1.5 }));
    cap('movimientoUsoAdmin', await admin.post(`/api/admin/insumos/${shampoo}/movimientos`, { tipo: 'uso', cantidad: 0.5, nota: 'Auto de Juan', turnoId: a }));
    cap('movimientoUsoEmpleado', await empleado.post(`/api/admin/insumos/${shampoo}/movimientos`, { tipo: 'uso', cantidad: 1.25 }));
    cap('movimientoCompra', await admin.post(`/api/admin/insumos/${cera}/movimientos`, { tipo: 'compra', cantidad: 5, costoTotal: 12500, proveedor: 'Distribuidora Norte', nota: 'Factura 0001' }));
    cap('movimientoAjuste', await admin.post(`/api/admin/insumos/${cera}/movimientos`, { tipo: 'ajuste', stockReal: 4.5, nota: 'Conteo del sábado' }));
    cap('movimientoAjusteSinCambio', await admin.post(`/api/admin/insumos/${cera}/movimientos`, { tipo: 'ajuste', stockReal: 4.5 }));
    cap('error409Stock', await empleado.post(`/api/admin/insumos/${shampoo}/movimientos`, { tipo: 'uso', cantidad: 10 }));
    cap('error400Movimiento', await admin.post(`/api/admin/insumos/${shampoo}/movimientos`, { tipo: 'uso', cantidad: 0 }));
    cap('error403CompraEmpleado', await empleado.post(`/api/admin/insumos/${shampoo}/movimientos`, { tipo: 'compra', cantidad: 1, costoTotal: 100 }));
    cap('error403AjusteEmpleado', await empleado.post(`/api/admin/insumos/${shampoo}/movimientos`, { tipo: 'ajuste', stockReal: 1 }));
    cap('movimientosAdmin', await admin.get(`/api/admin/insumos/${cera}/movimientos`));
    cap('movimientosEmpleado', await empleado.get(`/api/admin/insumos/${cera}/movimientos`));
    cap('insumosAdmin', await admin.get('/api/admin/insumos'));
    cap('insumosEmpleado', await empleado.get('/api/admin/insumos'));
    cap('insumosBajoStock', await admin.get('/api/admin/insumos?bajoStock=true'));
    cap('presupuestoCrea', await admin.post('/api/admin/presupuestos', {
      clienteNombre: 'María Núñez', clienteTelefono: '380 412-3456', vehiculo: 'Ford Ka 2019',
      items: [{ descripcion: 'Pulido completo', cantidad: 1, precioUnitario: 25000 }, { descripcion: 'Encerado', cantidad: 1.5, precioUnitario: 10001 }],
      descuento: 3000, validezDias: 10, notas: 'Incluye lavado previo.',
    }));
    cap('presupuestoCreaMinimo', await admin.post('/api/admin/presupuestos', { clienteNombre: 'Pedro', items: [{ descripcion: 'Lavado', cantidad: 1, precioUnitario: 8000 }] }));
    const presu = (capturas.presupuestoCrea?.body as { presupuesto: { id: string } }).presupuesto.id;
    cap('error400Presupuesto', await admin.post('/api/admin/presupuestos', { clienteNombre: '', items: [{ descripcion: 'ok', cantidad: 1, precioUnitario: 1 }, { descripcion: '', cantidad: 0, precioUnitario: 1.5 }] }));
    cap('presupuestoPatch', await admin.patch(`/api/admin/presupuestos/${presu}`, { estado: 'aceptado', clienteTelefono: null }));
    cap('error409PresupuestoAceptado', await admin.delete(`/api/admin/presupuestos/${presu}`));
    cap('presupuestosLista', await admin.get('/api/admin/presupuestos'));
    cap('error403PresupuestosEmpleado', await empleado.get('/api/admin/presupuestos'));
    cap('error404Comprobante', await admin.get(`/api/admin/bookings/${a}/comprobante`));
    cap('error400ComprobanteSinCobro', await admin.post(`/api/admin/bookings/${c}/comprobante`, { formaPago: 'efectivo' }));
    cap('comprobanteCrea', await admin.post(`/api/admin/bookings/${a}/comprobante`, { formaPago: 'transferencia', notas: 'Alias mg.detailing' }));
    cap('comprobanteExistente', await admin.post(`/api/admin/bookings/${a}/comprobante`, { formaPago: 'efectivo' }));
    cap('comprobanteGet', await admin.get(`/api/admin/bookings/${a}/comprobante`));
    cap('error403ComprobanteEmpleado', await empleado.post(`/api/admin/bookings/${a}/comprobante`, { formaPago: 'efectivo' }));
    // Revisión de los objetivos 9 y 10: más errores reales que el panel tiene que manejar.
    cap('error400ComprobanteFormaPago', await admin.post(`/api/admin/bookings/${a}/comprobante`, { formaPago: 'bitcoin' }));
    cap('error409TurnoConComprobante', await admin.delete(`/api/admin/bookings/${a}`));
    cap('error404Gasto', await admin.delete('/api/admin/gastos/22222222-2222-4222-8222-222222222222'));
    cap('error404Presupuesto', await admin.get('/api/admin/presupuestos/22222222-2222-4222-8222-222222222222'));
    cap('error404Insumo', await admin.post('/api/admin/insumos/22222222-2222-4222-8222-222222222222/movimientos', { tipo: 'uso', cantidad: 1 }));
    cap('error400MetaMes', await admin.put('/api/admin/metas/2030-01', { ingresosObjetivo: 1000 }));
    cap('error400CompraCostoAlto', await admin.post(`/api/admin/insumos/${cera}/movimientos`, { tipo: 'compra', cantidad: 0.01, costoTotal: 5000000 }));
    cap('error400PresupuestoTotal', await admin.post('/api/admin/presupuestos', { clienteNombre: 'Pedro', items: [{ descripcion: 'x', cantidad: 999, precioUnitario: 99999999 }] }));

    const generadas = normalizar(capturas);
    if (process.env.ACTUALIZAR_FIXTURES === '1') {
      mkdirSync(path.dirname(FIXTURES), { recursive: true });
      writeFileSync(FIXTURES, `${JSON.stringify(generadas, null, 2)}\n`);
    }
    expect(existsSync(FIXTURES), 'Faltan las respuestas guardadas: correr con ACTUALIZAR_FIXTURES=1').toBe(true);
    expect(generadas).toEqual(JSON.parse(readFileSync(FIXTURES, 'utf8')));
  });
});
