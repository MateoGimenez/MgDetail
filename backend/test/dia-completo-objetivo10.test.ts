import { afterEach, describe, expect, it } from 'vitest';
import { type TestContext, addUser, closeAllContexts, createTestContext, loginClient } from './helpers.js';

afterEach(closeAllContexts);

/*
 * Un día completo del taller por la API (app de test + PGlite), "hoy" = 2026-10-16: crear un insumo y comprarlo (genera
 * el gasto), usarlo (empleado), completar un turno con monto, emitir el comprobante (idempotente), armar un presupuesto
 * con PDF, ver los gastos del mes, las estadísticas con ganancia neta y la meta del mes. El empleado no ve un importe.
 */

async function turno(context: TestContext, fecha: string): Promise<string> {
  const { rows } = await context.db.sql.query(
    `INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, vehiculo_modelo, servicio_id, fecha_preferida, franja, estado)
     VALUES ('María Núñez', '12345678', 'auto', 'Ford Ka', 'pulido', $1::date, 'manana', 'confirmado') RETURNING id::text AS id`,
    [fecha],
  );
  return String(rows[0]?.id);
}

describe('un día completo', () => {
  it('inventario, cobro, comprobante, presupuesto, gastos, estadísticas y meta cuadran; el empleado no ve plata', async () => {
    const context = await createTestContext();
    await addUser(context, { email: 'ana@t.test', rol: 'admin', nombre: 'Ana' });
    await addUser(context, { email: 'beto@t.test', rol: 'empleado', nombre: 'Beto' });
    const admin = await loginClient(context, 'ana@t.test');
    const empleado = await loginClient(context, 'beto@t.test');
    const cuerposDelEmpleado: string[] = [];
    const delEmpleado = async (ruta: string) => {
      const r = await empleado.get(ruta);
      cuerposDelEmpleado.push(JSON.stringify(r.body));
      return r;
    };

    // 1. Insumo y compra con costo: crea el gasto y el costo por unidad
    const insumo = (await admin.post('/api/admin/insumos', { nombre: 'Shampoo', unidad: 'litro', stockInicial: 1, stockMinimo: 2 })).body.insumo as { id: string };
    const compra = await admin.post(`/api/admin/insumos/${insumo.id}/movimientos`, { tipo: 'compra', cantidad: 5, costoTotal: 48750, proveedor: 'Distribuidora Sur' });
    expect(compra.status).toBe(201);
    expect(compra.body.insumo).toMatchObject({ stock: 6, costoUnitario: 9750, valorEnStock: 58500 });
    const gastos = (await admin.get('/api/admin/gastos')).body;
    expect(gastos.gastos).toHaveLength(1);
    expect(gastos.gastos[0]).toMatchObject({ origen: 'inventario', categoria: 'insumos', monto: 48750, fecha: '2026-10-16', descripcion: 'Compra: Shampoo (5 litro)' });

    // 2. El empleado usa insumo y ve el inventario sin un peso
    const uso = await empleado.post(`/api/admin/insumos/${insumo.id}/movimientos`, { tipo: 'uso', cantidad: 0.75, nota: 'Auto de María' });
    cuerposDelEmpleado.push(JSON.stringify(uso.body));
    expect(uso.status).toBe(201);
    expect(uso.body.insumo.stock).toBe(5.25);
    await delEmpleado('/api/admin/insumos');
    await delEmpleado(`/api/admin/insumos/${insumo.id}/movimientos`);

    // 3. Un gasto manual del día
    expect((await admin.post('/api/admin/gastos', { fecha: '2026-10-16', categoria: 'servicios', descripcion: 'Luz del taller', monto: 11250 })).status).toBe(201);

    // 4. Turno completado con monto y comprobante idempotente
    const t = await turno(context, '2026-10-16');
    expect((await admin.patch(`/api/admin/bookings/${t}`, { estado: 'completado', monto: 90000 })).status).toBe(200);
    const c1 = await admin.post(`/api/admin/bookings/${t}/comprobante`, { formaPago: 'transferencia' });
    const c2 = await admin.post(`/api/admin/bookings/${t}/comprobante`, { formaPago: 'efectivo' });
    expect([c1.status, c2.status]).toEqual([201, 200]);
    expect(c2.body.comprobante).toEqual(c1.body.comprobante);
    expect(c1.body.comprobante).toMatchObject({ monto: 90000, formaPago: 'transferencia', codigo: 'R-0001' });
    const pdfC = await admin.get(`/api/admin/comprobantes/${String(c1.body.comprobante.id)}/pdf`);
    expect(pdfC.status).toBe(200);
    expect(pdfC.headers['content-type']).toBe('application/pdf');
    // El empleado ve el turno completado sin monto y no puede pedir el comprobante
    const turnoEmpleado = await delEmpleado('/api/admin/bookings');
    expect(turnoEmpleado.body.bookings[0].monto).toBeNull();
    expect((await empleado.get(`/api/admin/bookings/${t}/comprobante`)).status).toBe(403);

    // 5. Un presupuesto con PDF; el total sale del backend
    const p = await admin.post('/api/admin/presupuestos', {
      clienteNombre: 'Pedro Gómez',
      vehiculo: 'Corsa 2010',
      items: [
        { descripcion: 'Pulido', cantidad: 1, precioUnitario: 70000 },
        { descripcion: 'Encerado', cantidad: 2, precioUnitario: 12500 },
      ],
      descuento: 5000,
    });
    expect(p.body.presupuesto).toMatchObject({ subtotal: 95000, total: 90000 });
    expect((await admin.get(`/api/admin/presupuestos/${String(p.body.presupuesto.id)}/pdf`)).status).toBe(200);

    // 6. Gastos del mes, estadísticas y meta
    const delMes = (await admin.get('/api/admin/gastos?desde=2026-10-01&hasta=2026-10-31')).body;
    expect(delMes.suma).toBe(48750 + 11250);
    const e = (await admin.get('/api/admin/estadisticas')).body;
    expect(e.periodo).toMatchObject({ ingresos: 90000, gastos: 60000, gananciaNeta: 30000 });
    expect(e.periodo.margen).toBeCloseTo(30000 / 90000, 4);
    expect(e.resumen.hoy.actual).toMatchObject({ ingresos: 90000, gastos: 60000, ganancia: 30000 });
    expect(e.gastosPorCategoria).toEqual([
      { categoria: 'insumos', monto: 48750 },
      { categoria: 'servicios', monto: 11250 },
    ]);
    expect((await admin.put('/api/admin/metas/2026-10', { ingresosObjetivo: 1000000, trabajosObjetivo: 10 })).status).toBe(200);
    const meta = (await admin.get('/api/admin/metas/actual')).body;
    expect(meta.progreso).toMatchObject({ ingresos: 90000, trabajos: 1 });
    expect(['adelantado', 'en-ritmo', 'atrasado']).toContain(meta.progreso.estado);
    expect(meta.progreso.porcentajeIngresos).toBeCloseTo(0.09, 4);

    // 7. El inventario con stock bajo: el empleado se entera, sin valores
    await admin.post(`/api/admin/insumos/${insumo.id}/movimientos`, { tipo: 'ajuste', stockReal: 1.5 });
    const bajo = await delEmpleado('/api/admin/insumos?bajoStock=true');
    expect(bajo.body).toMatchObject({ bajoStock: 1, valorTotal: null });

    // 8. Y todo lo demás es 403 para el empleado, antes de validar
    const prohibidas: [string, string][] = [
      ['get', '/api/admin/gastos'],
      ['post', '/api/admin/gastos'],
      ['get', '/api/admin/metas/actual'],
      ['put', '/api/admin/metas/2026-10'],
      ['get', '/api/admin/taller'],
      ['put', '/api/admin/taller'],
      ['get', '/api/admin/presupuestos'],
      ['post', '/api/admin/presupuestos'],
      ['get', `/api/admin/presupuestos/${String(p.body.presupuesto.id)}/pdf`],
      ['get', `/api/admin/comprobantes/${String(c1.body.comprobante.id)}/pdf`],
      ['get', '/api/admin/estadisticas'],
    ];
    for (const [metodo, ruta] of prohibidas) {
      const r = await (metodo === 'get' ? empleado.get(ruta) : metodo === 'post' ? empleado.post(ruta, {}) : empleado.put(ruta, {}));
      expect(r.status, `${metodo} ${ruta}`).toBe(403);
      cuerposDelEmpleado.push(JSON.stringify(r.body));
    }
    // Ninguna respuesta del empleado contiene un importe de este día, un proveedor ni un email.
    for (const cuerpo of cuerposDelEmpleado) {
      expect(cuerpo).not.toMatch(/48750|9750|58500|11250|90000|95000|70000|12500|Distribuidora|ana@t|beto@t/);
    }
  });
});
