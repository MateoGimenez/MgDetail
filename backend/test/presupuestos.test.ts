import { afterEach, describe, expect, it } from 'vitest';
import {
  armarPresupuesto,
  calcularSubtotal,
  calcularTotal,
  codigoDePresupuesto,
  estaVencido,
  importeDeItem,
} from '../src/domain/presupuestos.js';
import { formatearNumero, formatearPesos } from '../src/lib/formato.js';
import { closeAllContexts, createClient, createTestContext, loginAs } from './helpers.js';

afterEach(closeAllContexts);

const CLAVES = [
  'clienteNombre', 'clienteTelefono', 'codigo', 'creadoPor', 'createdAt', 'descuento', 'estado', 'id', 'items', 'notas', 'numero',
  'subtotal', 'total', 'turnoId', 'updatedAt', 'validezDias', 'vehiculo', 'venceEl', 'vencido',
];

async function equipo(now?: Date) {
  const context = await createTestContext(now === undefined ? {} : { now });
  const admin = await loginAs(context, 'admin', 'ana@t.test');
  const empleado = await loginAs(context, 'empleado', 'beto@t.test');
  return { context, admin: admin.client, adminId: admin.id, empleado: empleado.client };
}

const item = (extra: Record<string, unknown> = {}) => ({ descripcion: 'Pulido completo', cantidad: 1, precioUnitario: 25000, ...extra });
const valido = (extra: Record<string, unknown> = {}) => ({ clienteNombre: 'Juan Pérez', items: [item()], ...extra });

describe('cuentas (dominio)', () => {
  it('redondea cantidad x precio con .5 hacia arriba, sin errores de coma flotante', () => {
    expect(importeDeItem({ descripcion: 'a', cantidad: 1.15, precioUnitario: 100 })).toBe(115);
    expect(importeDeItem({ descripcion: 'a', cantidad: 0.5, precioUnitario: 25 })).toBe(13); // 12,5
    expect(importeDeItem({ descripcion: 'a', cantidad: 0.01, precioUnitario: 149 })).toBe(1); // 1,49
    expect(importeDeItem({ descripcion: 'a', cantidad: 2.5, precioUnitario: 333 })).toBe(833); // 832,5
    expect(importeDeItem({ descripcion: 'a', cantidad: 999, precioUnitario: 99_999_999 })).toBe(99_899_999_001);
    expect(importeDeItem({ descripcion: 'a', cantidad: 3, precioUnitario: 0 })).toBe(0);
  });
  it('subtotal suma importes; el total nunca es negativo', () => {
    const items = [{ descripcion: 'a', cantidad: 1.5, precioUnitario: 1001 }, { descripcion: 'b', cantidad: 2, precioUnitario: 500 }];
    expect(calcularSubtotal(items)).toBe(1502 + 1000);
    expect(calcularTotal(2502, 502)).toBe(2000);
    expect(calcularTotal(2502, 9_000_000)).toBe(0);
  });
  it('vencido solo en borrador y enviado, y el día de vencimiento todavía vale', () => {
    expect(estaVencido('enviado', '2026-10-15', '2026-10-16')).toBe(true);
    expect(estaVencido('borrador', '2026-10-16', '2026-10-16')).toBe(false);
    expect(estaVencido('aceptado', '2026-01-01', '2026-10-16')).toBe(false);
    expect(estaVencido('rechazado', '2026-01-01', '2026-10-16')).toBe(false);
  });
  it('códigos y formatos es-AR independientes del servidor', () => {
    expect(codigoDePresupuesto(7)).toBe('P-0007');
    expect(codigoDePresupuesto(12345)).toBe('P-12345');
    expect(formatearPesos(12500)).toBe('$ 12.500');
    expect(formatearPesos(1250)).toBe('$ 1.250');
    expect(formatearNumero(4.5)).toBe('4,5');
    expect(formatearNumero(1234567.891)).toBe('1.234.567,89');
  });
});

describe('POST /api/admin/presupuestos', () => {
  it('201 con las claves exactas del contrato y las cuentas hechas', async () => {
    const { admin, adminId } = await equipo();
    const r = await admin.post('/api/admin/presupuestos', {
      clienteNombre: ' Juan Pérez ', clienteTelefono: '380 412-3456', vehiculo: 'Toyota Corolla 2020',
      items: [item(), item({ descripcion: 'Encerado', cantidad: 1.5, precioUnitario: 10001 })], descuento: 5000, validezDias: 10, notas: 'Línea 1\nLínea 2',
    });
    expect(r.status).toBe(201);
    const p = r.body.presupuesto;
    expect(Object.keys(p).sort()).toEqual(CLAVES);
    expect(p).toMatchObject({
      numero: 1, codigo: 'P-0001', clienteNombre: 'Juan Pérez', clienteTelefono: '5493804123456', vehiculo: 'Toyota Corolla 2020',
      subtotal: 25000 + 15002, descuento: 5000, total: 35002, validezDias: 10, venceEl: '2026-10-26', estado: 'borrador', vencido: false,
      notas: 'Línea 1\nLínea 2', turnoId: null, creadoPor: { id: adminId },
    });
    expect(p.items).toEqual([item(), item({ descripcion: 'Encerado', cantidad: 1.5, precioUnitario: 10001 })]);
    expect((await admin.get(`/api/admin/presupuestos/${String(p.id)}`)).body.presupuesto).toEqual(p);
  });

  it('los opcionales vacíos o null se omiten; validez 7 por omisión', async () => {
    const { admin } = await equipo();
    const r = await admin.post('/api/admin/presupuestos', valido({ clienteTelefono: '', vehiculo: null, notas: '   ' }));
    expect(r.status).toBe(201);
    expect(r.body.presupuesto).toMatchObject({ clienteTelefono: null, vehiculo: null, notas: null, validezDias: 7, venceEl: '2026-10-23', descuento: 0 });
  });

  it('cuentas de borde: decimales, descuento mayor al subtotal (total 0) y 30 ítems', async () => {
    const { admin } = await equipo();
    const r1 = await admin.post('/api/admin/presupuestos', valido({ items: [item({ cantidad: 0.33, precioUnitario: 1000 }), item({ cantidad: 2.5, precioUnitario: 333 })] }));
    expect(r1.body.presupuesto).toMatchObject({ subtotal: 330 + 833, total: 1163 });
    const r2 = await admin.post('/api/admin/presupuestos', valido({ descuento: 99999 }));
    expect(r2.body.presupuesto).toMatchObject({ subtotal: 25000, descuento: 99999, total: 0 });
    const treinta = Array.from({ length: 30 }, (_, i) => item({ descripcion: `Ítem ${String(i + 1)}`, cantidad: 1, precioUnitario: 100 }));
    const r3 = await admin.post('/api/admin/presupuestos', valido({ items: treinta }));
    expect(r3.status).toBe(201);
    expect(r3.body.presupuesto).toMatchObject({ subtotal: 3000, total: 3000 });
    expect(r3.body.presupuesto.items).toHaveLength(30);
    expect((await admin.post('/api/admin/presupuestos', valido({ items: [...treinta, item()] }))).body.error.fields.items).toBeDefined();
  });

  it('400 con errores por campo en items.N.*, teléfono, nombre, validez y campos de más', async () => {
    const { admin } = await equipo();
    const r = await admin.post('/api/admin/presupuestos', {
      clienteNombre: '', clienteTelefono: 'abc', vehiculo: 'v'.repeat(81), descuento: -1, validezDias: 91, notas: 'n'.repeat(501), extra: 1,
      items: [item(), item({ descripcion: '' }), item({ cantidad: 0 }), item({ precioUnitario: 1.5 }), item({ cantidad: 1.234 }), item({ cantidad: 1000 }), item({ precioUnitario: -1 }), item({ descripcion: 'd'.repeat(121) }), 'x'],
    });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.fields).sort()).toEqual([
      'clienteNombre', 'clienteTelefono', 'descuento', 'extra', 'items.1.descripcion', 'items.2.cantidad', 'items.3.precioUnitario',
      'items.4.cantidad', 'items.5.cantidad', 'items.6.precioUnitario', 'items.7.descripcion', 'items.8', 'notas', 'validezDias', 'vehiculo',
    ]);
    expect((await admin.post('/api/admin/presupuestos', valido({ items: [] }))).body.error.fields.items).toBeDefined();
    expect((await admin.post('/api/admin/presupuestos', valido({ items: [{ ...item(), oculto: 1 }] }))).body.error.fields['items.0.oculto']).toBeDefined();
    expect((await admin.post('/api/admin/presupuestos', {})).body.error.fields).toMatchObject({ clienteNombre: expect.any(String), items: expect.any(String) });
    expect((await admin.post('/api/admin/presupuestos', valido({ turnoId: '11111111-1111-4111-8111-111111111111' }))).body.error.fields.turnoId).toBeDefined();
  });

  it('un subtotal que no entra en el tope es 400 en items; la base lo rechaza también por CHECK', async () => {
    const { context, admin } = await equipo();
    const items = [item({ cantidad: 999, precioUnitario: 99_999_999 })];
    const r = await admin.post('/api/admin/presupuestos', valido({ items }));
    expect(r.status).toBe(400);
    expect(r.body.error.fields.items).toBeDefined();
    await expect(
      context.db.appSql.query(
        "INSERT INTO mgdetailing.presupuestos (cliente_nombre, items, total) VALUES ('x', '[{\"descripcion\":\"a\",\"cantidad\":1.001,\"precioUnitario\":1}]'::jsonb, 1)",
      ),
    ).rejects.toThrow();
    await expect(
      context.db.appSql.query("INSERT INTO mgdetailing.presupuestos (cliente_nombre, items, total) VALUES ('x', '[]'::jsonb, 1)"),
    ).rejects.toThrow();
    await expect(
      context.db.appSql.query(
        "INSERT INTO mgdetailing.presupuestos (cliente_nombre, items, total) VALUES ('x', '[{\"descripcion\":\"a\",\"cantidad\":1,\"precioUnitario\":1,\"x\":1}]'::jsonb, 1)",
      ),
    ).rejects.toThrow();
  });

  it('los teléfonos llegan normalizados (solo dígitos, con 549) y se pueden vaciar con null en el PATCH', async () => {
    const { admin } = await equipo();
    const p = (await admin.post('/api/admin/presupuestos', valido({ clienteTelefono: '+54 9 380 412-3456' }))).body.presupuesto;
    expect(p.clienteTelefono).toBe('5493804123456');
    const r = await admin.patch(`/api/admin/presupuestos/${String(p.id)}`, { clienteTelefono: null, vehiculo: null, notas: null });
    expect(r.body.presupuesto).toMatchObject({ clienteTelefono: null, vehiculo: null, notas: null });
  });
});

describe('numeración, listado y vencimiento', () => {
  it('el número no se reutiliza aunque se borre el último', async () => {
    const { admin } = await equipo();
    const a = (await admin.post('/api/admin/presupuestos', valido())).body.presupuesto;
    const b = (await admin.post('/api/admin/presupuestos', valido())).body.presupuesto;
    expect([a.codigo, b.codigo]).toEqual(['P-0001', 'P-0002']);
    expect((await admin.delete(`/api/admin/presupuestos/${String(b.id)}`)).status).toBe(204);
    const c = (await admin.post('/api/admin/presupuestos', valido())).body.presupuesto;
    expect(c.codigo).toBe('P-0003');
  });

  it('lista: más nuevos primero, filtro por estado, búsqueda por cliente, vehículo y código, comodines como texto', async () => {
    const { admin } = await equipo();
    const a = (await admin.post('/api/admin/presupuestos', valido({ clienteNombre: 'Ana Gómez', vehiculo: 'Ford Fiesta' }))).body.presupuesto;
    await admin.post('/api/admin/presupuestos', valido({ clienteNombre: 'Beto 100%', vehiculo: 'Fiat Uno' }));
    await admin.patch(`/api/admin/presupuestos/${String(a.id)}`, { estado: 'enviado' });
    const todos = await admin.get('/api/admin/presupuestos');
    expect(Object.keys(todos.body).sort()).toEqual(['presupuestos', 'total']);
    expect(todos.body.presupuestos.map((p: { codigo: string }) => p.codigo)).toEqual(['P-0002', 'P-0001']);
    expect((await admin.get('/api/admin/presupuestos?estado=enviado')).body.total).toBe(1);
    expect((await admin.get('/api/admin/presupuestos?q=gomez')).body.total).toBe(1);
    expect((await admin.get('/api/admin/presupuestos?q=FIAT')).body.total).toBe(1);
    expect((await admin.get('/api/admin/presupuestos?q=p-0002')).body.presupuestos[0].codigo).toBe('P-0002');
    expect((await admin.get('/api/admin/presupuestos?q=100%25')).body.total).toBe(1);
    expect((await admin.get('/api/admin/presupuestos?q=%25%25')).body.total).toBe(0);
    expect((await admin.get('/api/admin/presupuestos?limit=1&offset=1')).body.presupuestos[0].codigo).toBe('P-0001');
    expect((await admin.get('/api/admin/presupuestos?estado=otro')).status).toBe(400);
  });

  it('vencido en hora de La Rioja: vale todo el día de vencimiento y se pasa a las 00:00 locales', async () => {
    const { admin } = await equipo();
    const p = (await admin.post('/api/admin/presupuestos', valido({ validezDias: 1 }))).body.presupuesto; // creado 2026-10-16
    expect(p.venceEl).toBe('2026-10-17');
    expect(p.vencido).toBe(false);
    const guardado = { ...p, items: p.items, creadoPor: null } as Parameters<typeof armarPresupuesto>[0];
    expect(armarPresupuesto(guardado, new Date('2026-10-18T02:59:00.000Z')).vencido).toBe(false); // 23:59 del 17 (UTC-3)
    expect(armarPresupuesto(guardado, new Date('2026-10-18T03:00:00.000Z')).vencido).toBe(true); // 00:00 del 18
    expect(armarPresupuesto({ ...guardado, estado: 'aceptado' }, new Date('2026-12-01T00:00:00.000Z')).vencido).toBe(false);
  });

  it('la fecha de creación es la de La Rioja aunque en UTC ya sea otro día', async () => {
    const { admin } = await equipo(new Date('2026-10-17T01:30:00.000Z')); // 22:30 del 16 en La Rioja
    const p = (await admin.post('/api/admin/presupuestos', valido({ validezDias: 7 }))).body.presupuesto;
    expect(p.venceEl).toBe('2026-10-23');
  });
});

describe('PATCH y DELETE', () => {
  it('reemplaza los ítems enteros y recalcula; el descuento solo recalcula con lo guardado; el estado cambia libremente', async () => {
    const { admin } = await equipo();
    const p = (await admin.post('/api/admin/presupuestos', valido({ descuento: 1000 }))).body.presupuesto;
    const url = `/api/admin/presupuestos/${String(p.id)}`;
    expect((await admin.patch(url, { items: [item({ precioUnitario: 40000 })] })).body.presupuesto).toMatchObject({ subtotal: 40000, total: 39000, descuento: 1000 });
    expect((await admin.patch(url, { descuento: 50000 })).body.presupuesto).toMatchObject({ subtotal: 40000, total: 0 });
    expect((await admin.patch(url, { descuento: 0, validezDias: 30 })).body.presupuesto).toMatchObject({ total: 40000, validezDias: 30, venceEl: '2026-11-15' });
    for (const estado of ['aceptado', 'rechazado', 'borrador', 'enviado']) {
      expect((await admin.patch(url, { estado })).body.presupuesto.estado).toBe(estado);
    }
    expect((await admin.patch(url, {})).status).toBe(400);
    expect((await admin.patch(url, { numero: 9 })).status).toBe(400);
    expect((await admin.patch(url, { items: [item({ cantidad: 0 })] })).body.error.fields['items.0.cantidad']).toBeDefined();
    expect((await admin.patch('/api/admin/presupuestos/11111111-1111-4111-8111-111111111111', { estado: 'enviado' })).status).toBe(404);
    expect((await admin.patch('/api/admin/presupuestos/11111111-1111-4111-8111-111111111111', { descuento: 5 })).status).toBe(404);
    expect((await admin.get('/api/admin/presupuestos/nope')).status).toBe(404);
  });

  it('borrar: 204; aceptado => 409 PRESUPUESTO_ACEPTADO; inexistente => 404', async () => {
    const { context, admin } = await equipo();
    const p = (await admin.post('/api/admin/presupuestos', valido())).body.presupuesto;
    const url = `/api/admin/presupuestos/${String(p.id)}`;
    await admin.patch(url, { estado: 'aceptado' });
    const r = await admin.delete(url);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('PRESUPUESTO_ACEPTADO');
    await admin.patch(url, { estado: 'rechazado' });
    expect((await admin.delete(url)).status).toBe(204);
    expect((await admin.delete(url)).status).toBe(404);
    expect((await context.db.sql.query('SELECT count(*)::int AS n FROM mgdetailing.presupuestos')).rows[0]?.n).toBe(0);
  });

  it('el empleado recibe 403 en todo (antes de validar) y sin sesión 401', async () => {
    const { context, admin, empleado } = await equipo();
    const p = (await admin.post('/api/admin/presupuestos', valido())).body.presupuesto;
    const url = `/api/admin/presupuestos/${String(p.id)}`;
    for (const r of [
      await empleado.get('/api/admin/presupuestos'),
      await empleado.post('/api/admin/presupuestos', valido()),
      await empleado.post('/api/admin/presupuestos', {}),
      await empleado.get(url),
      await empleado.get(`${url}/pdf`),
      await empleado.patch(url, { estado: 'aceptado' }),
      await empleado.delete(url),
      await empleado.get('/api/admin/presupuestos/nope/pdf'),
    ]) {
      expect(r.status).toBe(403);
      expect(JSON.stringify(r.body)).not.toMatch(/Juan/);
    }
    expect((await createClient(context.app).get(url)).status).toBe(401);
    expect((await createClient(context.app).get(`${url}/pdf`)).status).toBe(401);
  });
});
