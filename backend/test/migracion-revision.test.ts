import { afterEach, describe, expect, it } from 'vitest';
import { closeAllContexts, createTestContext, loginAs } from './helpers.js';

afterEach(closeAllContexts);

/*
 * Revisión de las migraciones M1, M2 y M3 como si fueran a producción: índices con miles de filas (EXPLAIN), la función
 * IMMUTABLE de ítems con casos hostiles, que la numeración no se reutilice y que reactivar un insumo con el nombre de
 * otro activo sea un 409 y no un 500.
 */

async function plan(context: Awaited<ReturnType<typeof createTestContext>>, consulta: string): Promise<string> {
  // eslint-disable-next-line no-restricted-syntax -- EXPLAIN de consultas fijas del propio test
  const { rows } = await context.db.pg.query<Record<string, string>>(`EXPLAIN ${consulta}`);
  return rows.map((r) => r['QUERY PLAN']).join('\n');
}

describe('índices con miles de filas', () => {
  it('gastos: el rango de fechas de un mes usa gastos_fecha_idx', async () => {
    const context = await createTestContext();
     
    await context.db.pg.exec(`
      INSERT INTO mgdetailing.gastos (fecha, categoria, descripcion, monto)
      SELECT date '2022-01-01' + (g % 1500), 'otros', 'Gasto ' || g, 1000 + g FROM generate_series(1, 20000) g;
      ANALYZE mgdetailing.gastos;`);
    const p = await plan(context, "SELECT * FROM mgdetailing.gastos WHERE fecha BETWEEN '2024-03-01' AND '2024-03-31' ORDER BY fecha DESC LIMIT 50");
    expect(p).toMatch(/gastos_fecha_idx/);
  });

  it('movimientos: el historial de un insumo usa movimientos_stock_insumo_idx', async () => {
    const context = await createTestContext();
     
    await context.db.pg.exec(`
      INSERT INTO mgdetailing.insumos (nombre, unidad, stock) SELECT 'Insumo ' || g, 'litro', 100 FROM generate_series(1, 20) g;
      INSERT INTO mgdetailing.movimientos_stock (insumo_id, tipo, cantidad, created_at)
        SELECT (SELECT id FROM mgdetailing.insumos WHERE nombre = 'Insumo ' || (1 + g % 20)), 'ajuste', 1 + (g % 5), now() - (g || ' minutes')::interval
        FROM generate_series(1, 10000) g;
      ANALYZE mgdetailing.movimientos_stock;`);
    const { rows } = await context.db.pg.query<{ id: string }>("SELECT id::text FROM mgdetailing.insumos WHERE nombre = 'Insumo 3'");
    const id = rows[0]?.id ?? '';
    const p = await plan(context, `SELECT * FROM mgdetailing.movimientos_stock WHERE insumo_id = '${id}' ORDER BY created_at DESC, id LIMIT 50`);
    expect(p).toMatch(/movimientos_stock_insumo_idx/);
    expect(p).not.toMatch(/Sort/);
  });

  it('insumos: el nombre único entre activos usa su índice parcial', async () => {
    const context = await createTestContext();
     
    await context.db.pg.exec(`INSERT INTO mgdetailing.insumos (nombre, unidad) SELECT 'Insumo ' || g, 'unidad' FROM generate_series(1, 5000) g; ANALYZE mgdetailing.insumos;`);
    const p = await plan(context, "SELECT 1 FROM mgdetailing.insumos WHERE activo AND lower(btrim(nombre)) = lower(btrim('insumo 77'))");
    expect(p).toMatch(/insumos_nombre_activo_uidx/);
  });
});

describe('presupuesto_items_validos (IMMUTABLE) con casos hostiles', () => {
  const valida = async (context: Awaited<ReturnType<typeof createTestContext>>, json: string): Promise<boolean> => {
    // eslint-disable-next-line no-restricted-syntax -- función de la migración con casos fijos
    const { rows } = await context.db.pg.query<{ ok: boolean }>(`SELECT mgdetailing.presupuesto_items_validos('${json}'::jsonb) AS ok`);
    return rows[0]?.ok === true;
  };
  const item = (extra = '') => `{"descripcion":"a","cantidad":1,"precioUnitario":100${extra}}`;

  it('acepta el borde y rechaza lo que no cierra, sin lanzar errores de cast', async () => {
    const context = await createTestContext();
    expect(await valida(context, `[{"descripcion":"a","cantidad":999,"precioUnitario":99999999},{"descripcion":"b","cantidad":0.01,"precioUnitario":0}]`)).toBe(true);
    expect(await valida(context, `[${Array.from({ length: 30 }, () => item()).join(',')}]`)).toBe(true);
    for (const malo of [
      `[${Array.from({ length: 31 }, () => item()).join(',')}]`,
      '[]',
      '{}',
      'null',
      '"texto"',
      `[${item(',"extra":1')}]`,
      '[{"descripcion":"a","cantidad":1}]',
      '[{"descripcion":"a","cantidad":1.005,"precioUnitario":1}]',
      '[{"descripcion":"a","cantidad":0,"precioUnitario":1}]',
      '[{"descripcion":"a","cantidad":1000,"precioUnitario":1}]',
      '[{"descripcion":"a","cantidad":1,"precioUnitario":1.5}]',
      '[{"descripcion":"a","cantidad":1,"precioUnitario":-1}]',
      '[{"descripcion":"a","cantidad":1,"precioUnitario":100000000}]',
      '[{"descripcion":"  ","cantidad":1,"precioUnitario":1}]',
      '[{"descripcion":1,"cantidad":1,"precioUnitario":1}]',
      '[{"descripcion":"a","cantidad":"1","precioUnitario":1}]',
      '[1,2]',
      '[null]',
    ]) {
      expect(await valida(context, malo), malo).toBe(false);
    }
  });
});

describe('numeración y reactivaciones', () => {
  it('el número de presupuesto y de comprobante no se reutiliza tras borrar', async () => {
    const context = await createTestContext();
    const admin = (await loginAs(context, 'admin', 'ana@t.test')).client;
    const nuevo = () => admin.post('/api/admin/presupuestos', { clienteNombre: 'Juan', items: [{ descripcion: 'a', cantidad: 1, precioUnitario: 10 }] });
    const a = await nuevo();
    const b = await nuevo();
    expect([a.body.presupuesto.codigo, b.body.presupuesto.codigo]).toEqual(['P-0001', 'P-0002']);
    expect((await admin.delete(`/api/admin/presupuestos/${String(b.body.presupuesto.id)}`)).status).toBe(204);
    expect((await nuevo()).body.presupuesto.codigo).toBe('P-0003');
  });

  it('reactivar un insumo cuyo nombre ya usa otro activo es 409 con fields.nombre (no 500)', async () => {
    const context = await createTestContext();
    const admin = (await loginAs(context, 'admin', 'ana@t.test')).client;
    const viejo = (await admin.post('/api/admin/insumos', { nombre: 'Cera', unidad: 'unidad' })).body.insumo.id as string;
    expect((await admin.patch(`/api/admin/insumos/${viejo}`, { activo: false })).status).toBe(200);
    expect((await admin.post('/api/admin/insumos', { nombre: 'cera', unidad: 'unidad' })).status).toBe(201);
    const r = await admin.patch(`/api/admin/insumos/${viejo}`, { activo: true });
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.error.fields.nombre).toBeTruthy();
  });
});
