import { afterEach, describe, expect, it } from 'vitest';
import { closeAllContexts, createClient, createTestContext, loginAs } from './helpers.js';

afterEach(closeAllContexts);

const CLAVES_INSUMO = ['activo', 'bajoStock', 'categoria', 'costoUnitario', 'id', 'nombre', 'stock', 'stockMinimo', 'unidad', 'updatedAt', 'valorEnStock'];
const CLAVES_MOVIMIENTO = ['cantidad', 'costoTotal', 'createdAt', 'id', 'nota', 'persona', 'proveedor', 'tipo', 'turnoId'];

async function equipo(now?: Date) {
  const context = await createTestContext(now === undefined ? {} : { now });
  const admin = await loginAs(context, 'admin', 'ana@t.test');
  const empleado = await loginAs(context, 'empleado', 'beto@t.test');
  return { context, admin: admin.client, adminId: admin.id, empleado: empleado.client, empleadoId: empleado.id };
}

async function insumo(client: Awaited<ReturnType<typeof equipo>>['admin'], extra: Record<string, unknown> = {}) {
  const r = await client.post('/api/admin/insumos', { nombre: 'Shampoo', unidad: 'litro', stockInicial: 5, stockMinimo: 2, costoUnitario: 1200, ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.insumo as { id: string };
}

const claves = (o: object) => Object.keys(o).sort();

describe('insumos: alta, edición y lista', () => {
  it('201 con la forma exacta; un stock inicial deja un ajuste "Stock inicial"', async () => {
    const { admin, adminId } = await equipo();
    const r = await admin.post('/api/admin/insumos', { nombre: ' Shampoo ', categoria: 'Lavado', unidad: 'litro', stockInicial: 4.5, stockMinimo: 2, costoUnitario: 1000 });
    expect(r.status).toBe(201);
    expect(claves(r.body.insumo)).toEqual(CLAVES_INSUMO);
    expect(r.body.insumo).toMatchObject({ nombre: 'Shampoo', categoria: 'Lavado', unidad: 'litro', stock: 4.5, stockMinimo: 2, costoUnitario: 1000, activo: true, bajoStock: false, valorEnStock: 4500 });
    const movs = await admin.get(`/api/admin/insumos/${String(r.body.insumo.id)}/movimientos`);
    expect(movs.body.total).toBe(1);
    expect(claves(movs.body.movimientos[0])).toEqual(CLAVES_MOVIMIENTO);
    expect(movs.body.movimientos[0]).toMatchObject({ tipo: 'ajuste', cantidad: 4.5, nota: 'Stock inicial', persona: { id: adminId } });
  });

  it('sin stock inicial no hay movimiento; los opcionales quedan en null/0', async () => {
    const { admin } = await equipo();
    const r = await admin.post('/api/admin/insumos', { nombre: 'Paño', unidad: 'unidad' });
    expect(r.body.insumo).toMatchObject({ categoria: null, stock: 0, stockMinimo: 0, costoUnitario: null, valorEnStock: null, bajoStock: false });
    expect((await admin.get(`/api/admin/insumos/${String(r.body.insumo.id)}/movimientos`)).body.total).toBe(0);
  });

  it('400 con fields: nombre, unidad, topes, decimales y campos de más', async () => {
    const { admin } = await equipo();
    const r = await admin.post('/api/admin/insumos', {
      nombre: 'x'.repeat(81), categoria: 'c'.repeat(41), unidad: 'galon', stockInicial: 1.234, stockMinimo: -1, costoUnitario: 1.5, otro: 1,
    });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.fields).sort()).toEqual(['categoria', 'costoUnitario', 'nombre', 'otro', 'stockInicial', 'stockMinimo', 'unidad']);
    expect((await admin.post('/api/admin/insumos', { nombre: '   ', unidad: 'kg' })).body.error.fields.nombre).toBeDefined();
    expect((await admin.post('/api/admin/insumos', { nombre: 'ok', unidad: 'kg', stockInicial: 1000000 })).status).toBe(400);
  });

  it('409 con fields.nombre si el nombre está repetido entre activos (sin distinguir mayúsculas); desactivado se puede reutilizar', async () => {
    const { admin } = await equipo();
    const a = await insumo(admin, { nombre: 'Cera' });
    const dup = await admin.post('/api/admin/insumos', { nombre: 'CERA', unidad: 'kg' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.fields.nombre).toBeDefined();
    expect((await admin.patch(`/api/admin/insumos/${a.id}`, { activo: false })).body.insumo.activo).toBe(false);
    const nuevo = await admin.post('/api/admin/insumos', { nombre: 'cera', unidad: 'kg' });
    expect(nuevo.status).toBe(201);
    // reactivar el viejo choca con el nuevo
    const re = await admin.patch(`/api/admin/insumos/${a.id}`, { activo: true });
    expect(re.status).toBe(409);
    // renombrar a un nombre en uso también
    const otro = await insumo(admin, { nombre: 'Otro' });
    expect((await admin.patch(`/api/admin/insumos/${otro.id}`, { nombre: 'CERA' })).status).toBe(409);
  });

  it('PATCH: cambia campos, vacía categoría y costo con null, exige al menos uno y 404', async () => {
    const { admin } = await equipo();
    const a = await insumo(admin, { categoria: 'Lavado' });
    const r = await admin.patch(`/api/admin/insumos/${a.id}`, { nombre: 'Shampoo PH', categoria: null, costoUnitario: null, stockMinimo: 10, unidad: 'ml' });
    expect(r.status).toBe(200);
    expect(r.body.insumo).toMatchObject({ nombre: 'Shampoo PH', categoria: null, costoUnitario: null, valorEnStock: null, stockMinimo: 10, unidad: 'ml', bajoStock: true });
    expect((await admin.patch(`/api/admin/insumos/${a.id}`, {})).status).toBe(400);
    expect((await admin.patch(`/api/admin/insumos/${a.id}`, { stock: 5 })).status).toBe(400);
    expect((await admin.patch('/api/admin/insumos/11111111-1111-4111-8111-111111111111', { activo: false })).status).toBe(404);
    expect((await admin.patch('/api/admin/insumos/nope', { activo: false })).status).toBe(404);
  });

  it('lista: stock bajo primero, filtros, búsqueda con comodines como texto, conteos de todo el inventario y valorTotal', async () => {
    const { admin } = await equipo();
    await insumo(admin, { nombre: 'Zeta', stockInicial: 10, stockMinimo: 1, costoUnitario: 100 }); // 1000
    await insumo(admin, { nombre: 'Álamo 100%', stockInicial: 1, stockMinimo: 5, costoUnitario: 50 }); // bajo, 50
    await insumo(admin, { nombre: 'Beta', stockInicial: 2, stockMinimo: 2, costoUnitario: null }); // bajo (<=), sin costo
    const off = await insumo(admin, { nombre: 'Inactivo', stockInicial: 1, stockMinimo: 9 });
    await admin.patch(`/api/admin/insumos/${off.id}`, { activo: false });

    const r = await admin.get('/api/admin/insumos');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['bajoStock', 'insumos', 'total', 'valorTotal']);
    expect(r.body.insumos.map((i: { nombre: string }) => i.nombre)).toEqual(['Álamo 100%', 'Beta', 'Zeta']);
    expect(r.body).toMatchObject({ total: 3, bajoStock: 2, valorTotal: 1050 });

    const bajos = await admin.get('/api/admin/insumos?bajoStock=true&limit=1');
    expect(bajos.body).toMatchObject({ total: 2, bajoStock: 2, valorTotal: 1050 });
    expect(bajos.body.insumos).toHaveLength(1);
    expect((await admin.get('/api/admin/insumos?activo=todos')).body.total).toBe(4);
    expect((await admin.get('/api/admin/insumos?activo=false')).body.insumos.map((i: { nombre: string }) => i.nombre)).toEqual(['Inactivo']);
    expect((await admin.get('/api/admin/insumos?q=alamo')).body.total).toBe(1);
    expect((await admin.get('/api/admin/insumos?q=100%25')).body.total).toBe(1);
    expect((await admin.get('/api/admin/insumos?q=%25%25')).body.total).toBe(0);
    expect((await admin.get('/api/admin/insumos?q=_e')).body.total).toBe(0);
    expect((await admin.get('/api/admin/insumos?limit=0')).status).toBe(400);
    expect((await admin.get('/api/admin/insumos?activo=si')).status).toBe(400);
  });
});

describe('movimientos', () => {
  it('uso: resta, 201 con insumo y movimiento negativo, con nota y turno', async () => {
    const { context, admin, adminId } = await equipo();
    const a = await insumo(admin);
    const { rows } = await context.db.sql.query(
      "INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja) VALUES ('C', '12345678', 'auto', 'pulido', '2026-10-20', 'manana') RETURNING id::text AS id",
    );
    const turnoId = String(rows[0]?.id);
    const r = await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'uso', cantidad: 0.5, nota: 'Auto de Juan', turnoId });
    expect(r.status).toBe(201);
    expect(Object.keys(r.body).sort()).toEqual(['insumo', 'movimiento']);
    expect(r.body.insumo.stock).toBe(4.5);
    expect(claves(r.body.movimiento)).toEqual(CLAVES_MOVIMIENTO);
    expect(r.body.movimiento).toMatchObject({ tipo: 'uso', cantidad: -0.5, nota: 'Auto de Juan', turnoId, persona: { id: adminId }, costoTotal: null });
  });

  it('409 STOCK_INSUFICIENTE con el mensaje y fields.cantidad; el stock no cambia', async () => {
    const { admin } = await equipo();
    const a = await insumo(admin, { stockInicial: 0.3 });
    const r = await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'uso', cantidad: 0.5 });
    expect(r.status).toBe(409);
    expect(r.body.error).toEqual({ code: 'STOCK_INSUFICIENTE', message: 'Solo quedan 0,3 litros.', fields: { cantidad: 'Solo quedan 0,3 litros.' } });
    const vacio = await insumo(admin, { nombre: 'Vacío', stockInicial: 0 });
    expect((await admin.post(`/api/admin/insumos/${vacio.id}/movimientos`, { tipo: 'uso', cantidad: 1 })).body.error.message).toBe('No queda stock de este insumo.');
    expect((await admin.get('/api/admin/insumos')).body.insumos.find((i: { id: string }) => i.id === a.id).stock).toBe(0.3);
  });

  it('dos usos a la vez que no caben juntos: uno entra y el otro es 409; nunca queda negativo', async () => {
    const { context, admin } = await equipo();
    const a = await insumo(admin, { stockInicial: 1 });
    const [r1, r2] = await Promise.all([
      admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'uso', cantidad: 0.7 }),
      admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'uso', cantidad: 0.7 }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const { rows } = await context.db.sql.query('SELECT stock::float8 AS stock FROM mgdetailing.insumos');
    expect(rows[0]?.stock).toBe(0.3);
  });

  it('el CHECK stock >= 0 es la red de seguridad de la base', async () => {
    const { context, admin } = await equipo();
    const a = await insumo(admin, { stockInicial: 1 });
    await expect(context.db.sql.query('UPDATE mgdetailing.insumos SET stock = stock - 2 WHERE id = $1::uuid', [a.id])).rejects.toThrow();
  });

  it('compra con costo: suma, actualiza costoUnitario y crea su gasto vinculado (origen inventario, hoy en La Rioja)', async () => {
    const { context, admin, adminId } = await equipo();
    const a = await insumo(admin, { nombre: 'Cera en pasta', unidad: 'unidad', stockInicial: 1, costoUnitario: null });
    const r = await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'compra', cantidad: 5, costoTotal: 12500, proveedor: 'Distribuidora Norte', nota: 'Factura 123' });
    expect(r.status).toBe(201);
    expect(r.body.insumo).toMatchObject({ stock: 6, costoUnitario: 2500, valorEnStock: 15000 });
    expect(r.body.movimiento).toMatchObject({ tipo: 'compra', cantidad: 5, costoTotal: 12500, proveedor: 'Distribuidora Norte', nota: 'Factura 123' });
    const g = await context.db.sql.query('SELECT fecha::text AS fecha, categoria, descripcion, monto, proveedor, origen, creado_por::text AS creado_por, id::text AS id FROM mgdetailing.gastos');
    expect(g.rows).toHaveLength(1);
    expect(g.rows[0]).toMatchObject({ fecha: '2026-10-16', categoria: 'insumos', descripcion: 'Compra: Cera en pasta (5 unidad)', monto: 12500, proveedor: 'Distribuidora Norte', origen: 'inventario', creado_por: adminId });
    const m = await context.db.sql.query('SELECT gasto_id::text AS gasto_id FROM mgdetailing.movimientos_stock WHERE tipo = $1', ['compra']);
    expect(m.rows[0]?.gasto_id).toBe(g.rows[0]?.id);
    // el gasto aparece en Finanzas, marcado como de inventario, y no se edita
    const lista = await admin.get('/api/admin/gastos');
    expect(lista.body.gastos[0]).toMatchObject({ origen: 'inventario', monto: 12500 });
    expect((await admin.patch(`/api/admin/gastos/${String(g.rows[0]?.id)}`, { monto: 1 })).status).toBe(409);
  });

  it('la fecha del gasto es la de La Rioja, no la del servidor', async () => {
    const { context, admin } = await equipo(new Date('2026-10-17T01:30:00.000Z')); // 22:30 del 16 en La Rioja
    const a = await insumo(admin);
    await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'compra', cantidad: 1, costoTotal: 100 });
    expect((await context.db.sql.query('SELECT fecha::text AS fecha FROM mgdetailing.gastos')).rows[0]?.fecha).toBe('2026-10-16');
  });

  it('compra sin costo (o con 0): suma stock y no crea gasto ni toca el costo', async () => {
    const { context, admin } = await equipo();
    const a = await insumo(admin);
    const r = await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'compra', cantidad: 2.25, costoTotal: 0 });
    expect(r.status).toBe(201);
    expect(r.body.insumo).toMatchObject({ stock: 7.25, costoUnitario: 1200 });
    expect(r.body.movimiento.costoTotal).toBeNull();
    expect((await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'compra', cantidad: 1 })).status).toBe(201);
    expect((await context.db.sql.query('SELECT count(*)::int AS n FROM mgdetailing.gastos')).rows[0]?.n).toBe(0);
  });

  it('si el gasto falla la transacción entera se revierte (stock y movimiento intactos)', async () => {
    const { context, admin } = await equipo();
    const a = await insumo(admin, { nombre: 'N'.repeat(80) });
    // "Compra: <80 caracteres> (…)" se recorta a 120; para forzar el fallo, el proveedor se rompe a mano en la base
    await context.db.sql.query('ALTER TABLE mgdetailing.gastos ADD CONSTRAINT falla CHECK (monto <> 777)');
    const r = await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'compra', cantidad: 3, costoTotal: 777 });
    expect(r.status).toBe(500);
    expect((await admin.get('/api/admin/insumos')).body.insumos[0].stock).toBe(5);
    expect((await admin.get(`/api/admin/insumos/${a.id}/movimientos`)).body.total).toBe(1);
  });

  it('ajuste: guarda la diferencia con signo; sin diferencia devuelve 200 { insumo } sin movimiento', async () => {
    const { admin } = await equipo();
    const a = await insumo(admin, { stockInicial: 5 });
    const baja = await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'ajuste', stockReal: 3, nota: 'Conteo' });
    expect(baja.status).toBe(201);
    expect(baja.body.insumo.stock).toBe(3);
    expect(baja.body.movimiento).toMatchObject({ tipo: 'ajuste', cantidad: -2, nota: 'Conteo' });
    const sube = await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'ajuste', stockReal: 3.5 });
    expect(sube.body.movimiento.cantidad).toBe(0.5);
    const igual = await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'ajuste', stockReal: 3.5 });
    expect(igual.status).toBe(200);
    expect(Object.keys(igual.body)).toEqual(['insumo']);
    expect((await admin.get(`/api/admin/insumos/${a.id}/movimientos`)).body.total).toBe(3);
    expect((await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'ajuste', stockReal: 0 })).body.movimiento.cantidad).toBe(-3.5);
  });

  it('400 con fields: cantidad, stockReal, tipo, turno inexistente y campos que no corresponden al tipo', async () => {
    const { admin } = await equipo();
    const a = await insumo(admin);
    const url = `/api/admin/insumos/${a.id}/movimientos`;
    expect((await admin.post(url, { tipo: 'uso', cantidad: 0 })).body.error.fields.cantidad).toBeDefined();
    expect((await admin.post(url, { tipo: 'uso', cantidad: 1.234 })).body.error.fields.cantidad).toBeDefined();
    expect((await admin.post(url, { tipo: 'uso', cantidad: 1000000 })).status).toBe(400);
    expect((await admin.post(url, { tipo: 'uso', cantidad: '1' })).status).toBe(400);
    expect((await admin.post(url, { tipo: 'ajuste', stockReal: -1 })).body.error.fields.stockReal).toBeDefined();
    expect((await admin.post(url, { tipo: 'regalo', cantidad: 1 })).body.error.fields.tipo).toBeDefined();
    expect((await admin.post(url, {})).status).toBe(400);
    expect((await admin.post(url, { tipo: 'uso', cantidad: 1, costoTotal: 5 })).body.error.fields.costoTotal).toBeDefined();
    expect((await admin.post(url, { tipo: 'uso', cantidad: 1, turnoId: '11111111-1111-4111-8111-111111111111' })).body.error.fields.turnoId).toBeDefined();
    expect((await admin.post(url, { tipo: 'compra', cantidad: 1, costoTotal: 1.5 })).body.error.fields.costoTotal).toBeDefined();
    expect((await admin.post('/api/admin/insumos/11111111-1111-4111-8111-111111111111/movimientos', { tipo: 'uso', cantidad: 1 })).status).toBe(404);
  });

  it('historial: más nuevos primero, paginado; 404 si el insumo no existe', async () => {
    const { admin } = await equipo();
    const a = await insumo(admin);
    await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'uso', cantidad: 1 });
    await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'compra', cantidad: 2 });
    const r = await admin.get(`/api/admin/insumos/${a.id}/movimientos`);
    expect(r.body.movimientos.map((m: { tipo: string }) => m.tipo)).toEqual(['compra', 'uso', 'ajuste']);
    expect((await admin.get(`/api/admin/insumos/${a.id}/movimientos?limit=1&offset=1`)).body.movimientos[0].tipo).toBe('uso');
    expect((await admin.get('/api/admin/insumos/11111111-1111-4111-8111-111111111111/movimientos')).status).toBe(404);
    expect((await admin.get(`/api/admin/insumos/${a.id}/movimientos?limit=500`)).status).toBe(400);
  });
});

describe('el empleado', () => {
  async function conStock(admin: Awaited<ReturnType<typeof equipo>>['admin']) {
    const a = await insumo(admin);
    await admin.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'compra', cantidad: 1, costoTotal: 1500, proveedor: 'Prov' });
    return a;
  }

  it('ve el inventario y los movimientos, pero costos y valores van en null en CADA respuesta', async () => {
    const { admin, empleado } = await equipo();
    const a = await conStock(admin);
    const lista = await empleado.get('/api/admin/insumos');
    expect(lista.status).toBe(200);
    expect(lista.body.valorTotal).toBeNull();
    expect(lista.body.insumos[0]).toMatchObject({ costoUnitario: null, valorEnStock: null, nombre: 'Shampoo' });
    expect(claves(lista.body.insumos[0])).toEqual(CLAVES_INSUMO);
    const movs = await empleado.get(`/api/admin/insumos/${a.id}/movimientos`);
    expect(movs.status).toBe(200);
    expect(movs.body.movimientos.every((m: { costoTotal: unknown }) => m.costoTotal === null)).toBe(true);
    const uso = await empleado.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'uso', cantidad: 1 });
    expect(uso.status).toBe(201);
    expect(uso.body.insumo).toMatchObject({ costoUnitario: null, valorEnStock: null });
    expect(uso.body.movimiento.persona).not.toBeNull();
    for (const r of [lista, movs, uso]) expect(JSON.stringify(r.body)).not.toMatch(/1200|1500|7200|"valorTotal":\d/);
    // el rechazo por stock tampoco filtra nada
    const sinStock = await empleado.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'uso', cantidad: 100 });
    expect(sinStock.status).toBe(409);
    expect(JSON.stringify(sinStock.body)).not.toMatch(/1200|1500/);
  });

  it('403 al crear, editar, comprar y ajustar (antes de validar) y nada cambia; 401 sin sesión', async () => {
    const { context, admin, empleado } = await equipo();
    const a = await conStock(admin);
    const base = `/api/admin/insumos/${a.id}`;
    for (const r of [
      await empleado.post('/api/admin/insumos', { nombre: 'X', unidad: 'kg' }),
      await empleado.post('/api/admin/insumos', {}),
      await empleado.patch(base, { activo: false }),
      await empleado.post(`${base}/movimientos`, { tipo: 'compra', cantidad: 1, costoTotal: 5 }),
      await empleado.post(`${base}/movimientos`, { tipo: 'ajuste', stockReal: 99 }),
      await empleado.post(`${base}/movimientos`, {}),
      await empleado.post(`${base}/movimientos`, { tipo: 'raro' }),
    ]) {
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('FORBIDDEN');
    }
    expect((await admin.get('/api/admin/insumos')).body.insumos[0]).toMatchObject({ stock: 6, activo: true });
    expect((await createClient(context.app).get('/api/admin/insumos')).status).toBe(401);
    expect((await createClient(context.app).post(`${base}/movimientos`, { tipo: 'uso', cantidad: 1 })).status).toBe(401);
  });

  it('superadmin puede todo', async () => {
    const context = await createTestContext();
    const { client } = await loginAs(context, 'superadmin');
    const a = await insumo(client);
    expect((await client.post(`/api/admin/insumos/${a.id}/movimientos`, { tipo: 'ajuste', stockReal: 1 })).status).toBe(201);
  });
});
