import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMITS } from '../src/config.js';
import type { createClient} from './helpers.js';
import { ORIGIN, addUser, closeAllContexts, createTestContext, loginAs, loginClient } from './helpers.js';

afterEach(closeAllContexts);

/** Hallazgos de la revisión de los objetivos 9 y 10 (privacidad, límites y carreras). */

async function equipo() {
  const context = await createTestContext();
  const admin = await loginAs(context, 'admin', 'ana@t.test');
  const empleado = await loginAs(context, 'empleado', 'beto@t.test');
  const otro = await loginAs(context, 'empleado', 'carla@t.test');
  return { context, admin: admin.client, adminId: admin.id, empleado: empleado.client, empleadoId: empleado.id, otro: otro.client };
}

async function nuevoInsumo(admin: ReturnType<typeof createClient>, extra: Record<string, unknown> = {}) {
  const r = await admin.post('/api/admin/insumos', { nombre: 'Shampoo', unidad: 'litro', stockInicial: 50, ...extra });
  expect(r.status).toBe(201);
  return r.body.insumo.id as string;
}

describe('inventario: el empleado solo ve sus propios movimientos como persona', () => {
  it('persona y proveedor de los demás salen en null; el propio se mantiene; el admin ve todo', async () => {
    const { admin, adminId, empleado, empleadoId, otro } = await equipo();
    const id = await nuevoInsumo(admin);
    await admin.post(`/api/admin/insumos/${id}/movimientos`, { tipo: 'compra', cantidad: 2, costoTotal: 2000, proveedor: 'Distribuidora Norte' });
    await otro.post(`/api/admin/insumos/${id}/movimientos`, { tipo: 'uso', cantidad: 1 });
    await empleado.post(`/api/admin/insumos/${id}/movimientos`, { tipo: 'uso', cantidad: 1 });

    const mias = await empleado.get(`/api/admin/insumos/${id}/movimientos`);
    expect(mias.status).toBe(200);
    const lista = mias.body.movimientos as { tipo: string; persona: { id: string } | null; proveedor: string | null }[];
    expect(lista).toHaveLength(4); // stock inicial, compra, dos usos
    expect(lista.every((m) => m.proveedor === null)).toBe(true);
    expect(lista.filter((m) => m.persona !== null).map((m) => m.persona?.id)).toEqual([empleadoId]);
    expect(JSON.stringify(mias.body)).not.toMatch(/Distribuidora|carla@|ana@|beto@/);

    const todo = await admin.get(`/api/admin/insumos/${id}/movimientos`);
    const personas = new Set((todo.body.movimientos as { persona: { id: string } | null }[]).map((m) => m.persona?.id));
    expect(personas.size).toBe(3);
    expect(personas.has(adminId)).toBe(true);
    expect(JSON.stringify(todo.body)).toContain('Distribuidora Norte');
  });

  it('un perfil sin nombre se muestra como "Sin nombre", nunca con su email', async () => {
    const { context, admin } = await equipo();
    const sinNombre = await addUser(context, { email: 'secreto@t.test', rol: 'admin' });
    const cliente = await loginClient(context, 'secreto@t.test');
    const id = await nuevoInsumo(cliente);
    const g = await cliente.post('/api/admin/gastos', { fecha: '2026-10-16', categoria: 'otros', descripcion: 'Algo', monto: 100 });
    expect(g.body.gasto.creadoPor).toEqual({ id: sinNombre, nombre: 'Sin nombre' });
    const p = await cliente.post('/api/admin/presupuestos', { clienteNombre: 'Juan', items: [{ descripcion: 'a', cantidad: 1, precioUnitario: 10 }] });
    expect(p.body.presupuesto.creadoPor).toEqual({ id: sinNombre, nombre: 'Sin nombre' });
    const m = await admin.get(`/api/admin/insumos/${id}/movimientos`);
    expect(JSON.stringify(m.body)).not.toContain('secreto@t.test');
  });
});

describe('inventario: compra con costo por unidad fuera de rango', () => {
  it('400 con fields.costoTotal (no 500) y no cambia nada', async () => {
    const { context, admin } = await equipo();
    const id = await nuevoInsumo(admin, { stockInicial: 1 });
    const r = await admin.post(`/api/admin/insumos/${id}/movimientos`, { tipo: 'compra', cantidad: 0.01, costoTotal: 5_000_000 });
    expect(r.status).toBe(400);
    expect(r.body.error.fields.costoTotal).toBe('El costo por unidad es demasiado alto: revisá la cantidad o el total.');
    const gastos = await context.db.sql.query('SELECT count(*)::int AS n FROM mgdetailing.gastos');
    expect(gastos.rows[0]?.n).toBe(0);
    // en el borde exacto (99.999.999 por unidad) sí entra
    const ok = await admin.post(`/api/admin/insumos/${id}/movimientos`, { tipo: 'compra', cantidad: 1, costoTotal: 99_999_999 });
    expect(ok.status).toBe(201);
    expect(ok.body.insumo.costoUnitario).toBe(99_999_999);
    // 0,01 u por 999.999,99... el límite también vale con decimales
    const justo = await admin.post(`/api/admin/insumos/${id}/movimientos`, { tipo: 'compra', cantidad: 0.5, costoTotal: 99_999_999 });
    expect(justo.status).toBe(400);
  });
});

describe('presupuestos: total consistente con cambios simultáneos', () => {
  it('items y descuento a la vez: el total siempre es subtotal - descuento', async () => {
    const { admin } = await equipo();
    const creado = await admin.post('/api/admin/presupuestos', { clienteNombre: 'Juan', items: [{ descripcion: 'a', cantidad: 1, precioUnitario: 1000 }] });
    const id = creado.body.presupuesto.id as string;
    for (let ronda = 1; ronda <= 6; ronda++) {
      const precio = 1000 * (ronda + 1);
      const descuento = 100 * ronda;
      await Promise.all([
        admin.patch(`/api/admin/presupuestos/${id}`, { items: [{ descripcion: 'b', cantidad: 1, precioUnitario: precio }] }),
        admin.patch(`/api/admin/presupuestos/${id}`, { descuento }),
      ]);
      const p = (await admin.get(`/api/admin/presupuestos/${id}`)).body.presupuesto;
      expect(p.total, `ronda ${String(ronda)}`).toBe(Math.max(0, p.subtotal - p.descuento));
    }
  });

  it('404 si no existe y 400 si el subtotal se pasa del tope (sin dejar cambios)', async () => {
    const { admin } = await equipo();
    expect((await admin.patch('/api/admin/presupuestos/00000000-0000-4000-8000-000000000000', { descuento: 5 })).status).toBe(404);
    const creado = await admin.post('/api/admin/presupuestos', { clienteNombre: 'Juan', items: [{ descripcion: 'a', cantidad: 1, precioUnitario: 1000 }] });
    const id = creado.body.presupuesto.id as string;
    const enorme = await admin.patch(`/api/admin/presupuestos/${id}`, { items: [{ descripcion: 'a', cantidad: 999, precioUnitario: 99_999_999 }] });
    expect(enorme.status).toBe(400);
    expect((await admin.get(`/api/admin/presupuestos/${id}`)).body.presupuesto.total).toBe(1000);
  });
});

describe('límite del body: 24 kb solo para presupuestos', () => {
  const item = (i: number) => ({ descripcion: Array.from(`Ítem ${String(i)} ${'🚗'.repeat(120)}`).slice(0, 120).join(''), cantidad: 1, precioUnitario: 1000 });

  it('un presupuesto de 30 ítems de 120 caracteres con tildes y emojis entra', async () => {
    const { admin } = await equipo();
    const items = Array.from({ length: 30 }, (_, i) => item(i));
    const cuerpo = { clienteNombre: 'Juan', items, notas: 'ñ'.repeat(500) };
    expect(Buffer.byteLength(JSON.stringify(cuerpo))).toBeGreaterThan(10 * 1024);
    const r = await admin.post('/api/admin/presupuestos', cuerpo);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const p = await admin.patch(`/api/admin/presupuestos/${String(r.body.presupuesto.id)}`, { items });
    expect(p.status).toBe(200);
  });

  it('uno enorme da 413 y el resto de la API sigue en 10 kb', async () => {
    const { admin } = await equipo();
    const enorme = await admin.post('/api/admin/presupuestos', { clienteNombre: 'Juan', items: [item(1)], notas: 'x'.repeat(25 * 1024) });
    expect(enorme.status).toBe(413);
    const otra = await admin.post('/api/admin/gastos', { fecha: '2026-10-16', categoria: 'otros', descripcion: 'x'.repeat(11 * 1024), monto: 5 });
    expect(otra.status).toBe(413);
  });
});

describe('PDF: límite propio por IP', () => {
  it('después de N PDF seguidos responde 429 RATE_LIMITED; el resto de la API no se ve afectado', async () => {
    const context = await createTestContext({
      config: { rateLimits: { ...DEFAULT_RATE_LIMITS, api: { windowMs: 60_000, limit: 10_000 }, loginFailures: { windowMs: 60_000, limit: 10_000 }, pdf: { windowMs: 60_000, limit: 2 } } },
    });
    const admin = (await loginAs(context, 'admin', 'ana@t.test')).client;
    const empleado = (await loginAs(context, 'empleado', 'beto@t.test')).client;
    const p = await admin.post('/api/admin/presupuestos', { clienteNombre: 'Juan', items: [{ descripcion: 'a', cantidad: 1, precioUnitario: 1000 }] });
    const ruta = `/api/admin/presupuestos/${String(p.body.presupuesto.id)}/pdf`;
    // el empleado recibe 403 y no gasta cupo
    expect((await empleado.get(ruta)).status).toBe(403);
    expect((await admin.get(ruta)).status).toBe(200);
    expect((await admin.get(ruta)).status).toBe(200);
    const bloqueado = await admin.get(ruta);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error.code).toBe('RATE_LIMITED');
    expect((await admin.get('/api/admin/presupuestos')).status).toBe(200);
  });
});

describe('CORS: PUT permitido', () => {
  it('el preflight de PUT lista PUT en Access-Control-Allow-Methods', async () => {
    const { context } = await equipo();
    const r = await request(context.app)
      .options('/api/admin/taller')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'PUT');
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-methods']).toContain('PUT');
  });
});

/* Los MISMOS casos en backend/test/revision-objetivos-9-10.test.ts y frontend/src/lib/presupuestos.test.ts (valores
 * calculados aparte con BigInt): si un lado cambia su redondeo, el otro test sigue exigiendo lo de siempre. */
const CASOS_IMPORTE: [number, number, number][] = [[1,25000,25000],[0.5,25,13],[2.5,333,833],[1.15,100,115],[2.35,100,235],[0.01,149,1],[0.01,150,2],[0.03,50,2],[999,99999999,99899999001],[0.33,99999999,33000000],[1.5,1001,1502],[0.5,1,1],[0.07,10,1],[12.34,5678,70067],[0.1,5,1],[0.29,50,15],[3,0,0],[0.01,1,0],[0.99,99999999,98999999]];
const ITEMS_30 = Array.from({ length: 30 }, (_, i) => ({ cantidad: Math.round((1 + (i % 7) * 0.35) * 100) / 100, precioUnitario: 1234 + i * 777 }));

describe('cuentas idénticas al frontend (mismos casos de borde)', () => {
  it('importe por ítem: .5 hacia arriba, decimales de la cantidad y precios grandes', async () => {
    const { importeDeItem } = await import('../src/domain/presupuestos.js');
    for (const [cantidad, precioUnitario, esperado] of CASOS_IMPORTE) {
      expect(importeDeItem({ descripcion: 'a', cantidad, precioUnitario }), `${String(cantidad)} x ${String(precioUnitario)}`).toBe(esperado);
    }
  });
  it('30 ítems, descuento igual, menor y mayor al subtotal (también por la API)', async () => {
    const { calcularSubtotal, calcularTotal } = await import('../src/domain/presupuestos.js');
    const items = ITEMS_30.map((i, n) => ({ descripcion: `Ítem ${String(n)}`, ...i }));
    const subtotal = calcularSubtotal(items);
    expect(subtotal).toBe(758464);
    expect(calcularTotal(subtotal, 58464)).toBe(700000);
    expect(calcularTotal(subtotal, 1_000_000)).toBe(0);
    const { admin } = await equipo();
    for (const [descuento, total] of [[58464, 700000], [758464, 0], [1_000_000, 0]] as const) {
      const r = await admin.post('/api/admin/presupuestos', { clienteNombre: 'Juan', items, descuento });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.presupuesto).toMatchObject({ subtotal: 758464, total });
    }
  });
});

describe('cantidades con ruido de coma flotante', () => {
  it('presupuesto: 1.7000000000000002 se guarda como 1.7 (antes daba 500 por el CHECK de la base)', async () => {
    const { admin } = await equipo();
    const r = await admin.post('/api/admin/presupuestos', { clienteNombre: 'Juan', items: [{ descripcion: 'a', cantidad: 1.7000000000000002, precioUnitario: 1000 }] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.presupuesto.items[0].cantidad).toBe(1.7);
    expect(r.body.presupuesto.total).toBe(1700);
  });
  it('inventario: un uso de 0.30000000000000004 descuenta 0.3', async () => {
    const { admin } = await equipo();
    const id = await nuevoInsumo(admin, { stockInicial: 1 });
    const r = await admin.post(`/api/admin/insumos/${id}/movimientos`, { tipo: 'uso', cantidad: 0.1 + 0.2 });
    expect(r.status).toBe(201);
    expect(r.body.movimiento.cantidad).toBe(-0.3);
    expect(r.body.insumo.stock).toBe(0.7);
  });
});
