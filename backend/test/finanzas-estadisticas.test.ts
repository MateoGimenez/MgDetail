import { afterEach, describe, expect, it } from 'vitest';
import { type TestContext, closeAllContexts, createTestContext, loginAs } from './helpers.js';

afterEach(closeAllContexts);

/*
 * Estadísticas con gastos (objetivo 10): gastos, ganancia, ganancia neta, margen, gastosPorCategoria y gastos en la
 * serie. Hoy en los tests: 2026-10-16 (viernes), 12:00 en La Rioja.
 */

async function admin(now?: Date) {
  const context = await createTestContext(now ? { now } : {});
  const { client } = await loginAs(context, 'admin', 'ana@t.test');
  return { context, client };
}

async function gasto(context: TestContext, fecha: string, monto: number, categoria = 'otros'): Promise<void> {
  await context.db.sql.query(
    "INSERT INTO mgdetailing.gastos (fecha, categoria, descripcion, monto) VALUES ($1::date, $2, 'Gasto', $3)",
    [fecha, categoria, monto],
  );
}

async function completado(context: TestContext, fecha: string, monto: number): Promise<void> {
  await context.db.sql.query(
    `INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja, estado, monto)
     VALUES ('Cliente', '12345678', 'auto', 'pulido', $1::date, 'manana', 'completado', $2)`,
    [fecha, monto],
  );
}

describe('gastos en las estadísticas completas', () => {
  it('resumen, período, serie y categorías suman los gastos por la fecha del gasto', async () => {
    const { context, client } = await admin();
    await completado(context, '2026-10-16', 50_000);
    await completado(context, '2026-10-15', 30_000);
    await gasto(context, '2026-10-16', 4_000, 'insumos');
    await gasto(context, '2026-10-02', 90_000, 'alquiler');
    await gasto(context, '2026-10-02', 1_000, 'insumos');
    await gasto(context, '2026-09-16', 7_000, 'sueldos'); // mismo día del mes pasado
    await gasto(context, '2026-09-17', 99_999, 'sueldos'); // fuera del "mes pasado hasta el 16"
    await gasto(context, '2025-10-16', 500); // el año pasado hasta hoy
    const { body } = await client.get('/api/admin/estadisticas');
    expect(body.resumen.hoy.actual).toEqual({ completados: 1, ingresos: 50_000, gastos: 4_000, ganancia: 46_000 });
    expect(body.resumen.hoy.anterior).toEqual({ completados: 1, ingresos: 30_000, gastos: 0, ganancia: 30_000 });
    expect(body.resumen.mes.actual).toEqual({ completados: 2, ingresos: 80_000, gastos: 95_000, ganancia: -15_000 });
    expect(body.resumen.mes.anterior).toEqual({ completados: 0, ingresos: 0, gastos: 7_000, ganancia: -7_000 });
    expect(body.resumen.anio.actual.gastos).toBe(95_000 + 7_000 + 99_999);
    expect(body.resumen.anio.anterior).toEqual({ completados: 0, ingresos: 0, gastos: 500, ganancia: -500 });
    expect(body.periodo).toMatchObject({ ingresos: 80_000, gastos: 95_000, gananciaNeta: -15_000, margen: -0.1875 });
    expect(body.gastosPorCategoria).toEqual([
      { categoria: 'alquiler', monto: 90_000 },
      { categoria: 'insumos', monto: 5_000 },
    ]);
    expect(body.serie).toHaveLength(16);
    expect(body.serie[1]).toEqual({ clave: '2026-10-02', completados: 0, ingresos: 0, gastos: 91_000 });
    expect(body.serie[15]).toEqual({ clave: '2026-10-16', completados: 1, ingresos: 50_000, gastos: 4_000 });
    expect(body.serie[14]).toEqual({ clave: '2026-10-15', completados: 1, ingresos: 30_000, gastos: 0 });
    expect(body.serie.reduce((suma: number, p: { gastos: number }) => suma + p.gastos, 0)).toBe(body.periodo.gastos);
  });

  it('margen null con ingresos 0 (aunque haya gastos) y sin gastos todo en cero', async () => {
    const { context, client } = await admin();
    await gasto(context, '2026-10-10', 3_000);
    const conGastos = await client.get('/api/admin/estadisticas');
    expect(conGastos.body.periodo).toMatchObject({ ingresos: 0, gastos: 3_000, gananciaNeta: -3_000, margen: null });
    const vacio = await client.get('/api/admin/estadisticas?desde=2027-03-01&hasta=2027-03-03');
    expect(vacio.body.periodo).toMatchObject({ gastos: 0, gananciaNeta: 0, margen: null });
    expect(vacio.body.gastosPorCategoria).toEqual([]);
    expect(vacio.body.serie.every((p: { gastos: number }) => p.gastos === 0)).toBe(true);
  });

  it('margen positivo redondeado a 4 decimales y ganancia igual a ingresos si no hay gastos', async () => {
    const { context, client } = await admin();
    await completado(context, '2026-10-10', 30_000);
    await gasto(context, '2026-10-10', 10_000);
    expect((await client.get('/api/admin/estadisticas')).body.periodo).toMatchObject({ gananciaNeta: 20_000, margen: 0.6667 });
  });

  it('por mes (más de 62 días): los gastos se agrupan por mes, con fin de mes, de año y 29/02', async () => {
    const { context, client } = await admin(new Date('2028-06-15T15:00:00.000Z'));
    await gasto(context, '2027-12-31', 10);
    await gasto(context, '2028-01-01', 20);
    await gasto(context, '2028-01-31', 30);
    await gasto(context, '2028-02-29', 40);
    await gasto(context, '2028-03-01', 50);
    await completado(context, '2028-02-29', 1_000);
    const { body } = await client.get('/api/admin/estadisticas?desde=2027-12-01&hasta=2028-03-31');
    expect(body.granularidad).toBe('mes');
    expect(body.serie).toEqual([
      { clave: '2027-12', completados: 0, ingresos: 0, gastos: 10 },
      { clave: '2028-01', completados: 0, ingresos: 0, gastos: 50 },
      { clave: '2028-02', completados: 1, ingresos: 1_000, gastos: 40 },
      { clave: '2028-03', completados: 0, ingresos: 0, gastos: 50 },
    ]);
    expect(body.periodo).toMatchObject({ gastos: 150, gananciaNeta: 850 });
    // un rango que termina el 29/02 incluye el gasto de ese día; el que termina el 28/02 no
    const hasta29 = await client.get('/api/admin/estadisticas?desde=2028-02-01&hasta=2028-02-29');
    expect(hasta29.body.periodo.gastos).toBe(40);
    expect((await client.get('/api/admin/estadisticas?desde=2028-02-01&hasta=2028-02-28')).body.periodo.gastos).toBe(0);
  });

  it('con el servidor en UTC, "hoy" es el de La Rioja también para los gastos', async () => {
    // 16/10 22:30 en La Rioja = 17/10 01:30 UTC
    const { context, client } = await admin(new Date('2026-10-17T01:30:00.000Z'));
    await gasto(context, '2026-10-16', 700);
    await gasto(context, '2026-10-15', 300);
    const { body } = await client.get('/api/admin/estadisticas');
    expect(body.rango).toEqual({ desde: '2026-10-01', hasta: '2026-10-16' });
    expect(body.resumen.hoy.actual.gastos).toBe(700);
    expect(body.resumen.hoy.anterior.gastos).toBe(300);
  });

  it('los gastos de cualquier origen suman (también los de inventario)', async () => {
    const { context, client } = await admin();
    await context.db.sql.query(
      "INSERT INTO mgdetailing.gastos (fecha, categoria, descripcion, monto, origen) VALUES ('2026-10-10', 'insumos', 'Compra', 600, 'inventario')",
    );
    await gasto(context, '2026-10-10', 400, 'insumos');
    expect((await client.get('/api/admin/estadisticas')).body.gastosPorCategoria).toEqual([{ categoria: 'insumos', monto: 1_000 }]);
  });
});

describe('el empleado no recibe gastos ni ganancia', () => {
  it('/estadisticas es 403 y /mias no cambia (sin gastos, ganancia ni importes)', async () => {
    const context = await createTestContext();
    const { client } = await loginAs(context, 'empleado', 'beto@t.test');
    await gasto(context, '2026-10-10', 12_345);
    expect((await client.get('/api/admin/estadisticas')).status).toBe(403);
    const mias = await client.get('/api/admin/estadisticas/mias');
    expect(mias.status).toBe(200);
    expect(Object.keys(mias.body).sort()).toEqual(['completados', 'porServicio', 'rango', 'serie']);
    expect(JSON.stringify(mias.body)).not.toMatch(/gasto|ganancia|margen|12345|ingresos/i);
  });
});
