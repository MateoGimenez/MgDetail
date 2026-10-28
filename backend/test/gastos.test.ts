import { afterEach, describe, expect, it } from 'vitest';
import { registrarGastoDeInventario } from '../src/services/gastos.js';
import { type TestContext, addUser, closeAllContexts, createClient, createTestContext, loginAs, loginClient } from './helpers.js';

afterEach(closeAllContexts);

/** Hoy en los tests: 2026-10-16 (viernes), 12:00 en La Rioja. */

const CLAVES_GASTO = ['categoria', 'creadoPor', 'createdAt', 'descripcion', 'fecha', 'id', 'monto', 'origen', 'proveedor', 'updatedAt'];

async function equipo(options: Parameters<typeof createTestContext>[0] = {}) {
  const context = await createTestContext(options);
  const admin = await loginAs(context, 'admin', 'ana@t.test');
  const empleado = await loginAs(context, 'empleado', 'beto@t.test');
  return { context, admin: admin.client, adminId: admin.id, empleado: empleado.client };
}

interface Semilla {
  fecha: string;
  categoria?: string;
  descripcion?: string;
  monto?: number;
  proveedor?: string | null;
  origen?: string;
}

async function gasto(context: TestContext, g: Semilla): Promise<string> {
  const { rows } = await context.db.sql.query(
    `INSERT INTO mgdetailing.gastos (fecha, categoria, descripcion, monto, proveedor, origen)
     VALUES ($1::date, $2, $3, $4, $5, $6) RETURNING id::text AS id`,
    [g.fecha, g.categoria ?? 'otros', g.descripcion ?? 'Gasto', g.monto ?? 1000, g.proveedor ?? null, g.origen ?? 'manual'],
  );
  return String(rows[0]?.id);
}

const valido = (extra: Record<string, unknown> = {}) => ({
  fecha: '2026-10-14',
  categoria: 'insumos',
  descripcion: 'Cera en pasta',
  monto: 12500,
  ...extra,
});

describe('permisos: el empleado nunca recibe gastos', () => {
  it('403 en todo (también con body inválido o ids que no existen) y 401 sin sesión', async () => {
    const { context, empleado } = await equipo();
    const id = await gasto(context, { fecha: '2026-10-10' });
    const respuestas = [
      await empleado.get('/api/admin/gastos'),
      await empleado.post('/api/admin/gastos', valido()),
      await empleado.post('/api/admin/gastos', {}),
      await empleado.patch(`/api/admin/gastos/${id}`, { monto: 5 }),
      await empleado.patch('/api/admin/gastos/no-existe', {}),
      await empleado.delete(`/api/admin/gastos/${id}`),
    ];
    for (const r of respuestas) {
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('FORBIDDEN');
      expect(JSON.stringify(r.body)).not.toMatch(/1000|Gasto/);
    }
    // nada cambió
    expect((await context.db.sql.query('SELECT count(*)::int AS n FROM mgdetailing.gastos')).rows[0]?.n).toBe(1);

    const anonimo = createClient(context.app);
    expect((await anonimo.get('/api/admin/gastos')).status).toBe(401);
    expect((await anonimo.post('/api/admin/gastos', valido())).status).toBe(401);
  });

  it('admin y superadmin pueden', async () => {
    const context = await createTestContext();
    for (const rol of ['admin', 'superadmin'] as const) {
      const { client } = await loginAs(context, rol);
      expect((await client.get('/api/admin/gastos')).status, rol).toBe(200);
      expect((await client.post('/api/admin/gastos', valido())).status, rol).toBe(201);
    }
  });
});

describe('POST /api/admin/gastos', () => {
  it('201 con la forma exacta del contrato; el proveedor es opcional; guarda quién lo cargó', async () => {
    const { admin, adminId } = await equipo();
    const r = await admin.post('/api/admin/gastos', valido({ proveedor: 'Distribuidora Norte' }));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(Object.keys(r.body)).toEqual(['gasto']);
    expect(Object.keys(r.body.gasto).sort()).toEqual(CLAVES_GASTO);
    expect(r.body.gasto).toMatchObject({
      fecha: '2026-10-14',
      categoria: 'insumos',
      descripcion: 'Cera en pasta',
      monto: 12500,
      proveedor: 'Distribuidora Norte',
      origen: 'manual',
      creadoPor: { id: adminId, nombre: 'Sin nombre' },
    });
    expect(Number.isNaN(Date.parse(r.body.gasto.createdAt))).toBe(false);
    expect(Object.keys(r.body.gasto.creadoPor).sort()).toEqual(['id', 'nombre']);

    const sin = await admin.post('/api/admin/gastos', valido({ proveedor: null }));
    expect(sin.body.gasto.proveedor).toBeNull();
    const omitido = await admin.post('/api/admin/gastos', valido());
    expect(omitido.body.gasto.proveedor).toBeNull();
  });

  it('recorta espacios, deja vacío el proveedor en blanco y quita controles bidireccionales', async () => {
    const { admin } = await equipo();
    const r = await admin.post('/api/admin/gastos', valido({ descripcion: '  Cera \u202E en pasta  ', proveedor: '   ' }));
    expect(r.status).toBe(201);
    expect(r.body.gasto.descripcion).toBe('Cera  en pasta');
    expect(r.body.gasto.proveedor).toBeNull();
  });

  it('límites válidos: monto 1 y 99.999.999, descripción de 120, proveedor de 80, fecha de hoy y fecha vieja', async () => {
    const { admin } = await equipo();
    expect((await admin.post('/api/admin/gastos', valido({ monto: 1 }))).status).toBe(201);
    expect((await admin.post('/api/admin/gastos', valido({ monto: 99_999_999 }))).status).toBe(201);
    expect((await admin.post('/api/admin/gastos', valido({ descripcion: 'x'.repeat(120) }))).status).toBe(201);
    expect((await admin.post('/api/admin/gastos', valido({ proveedor: 'p'.repeat(80) }))).status).toBe(201);
    expect((await admin.post('/api/admin/gastos', valido({ fecha: '2026-10-16' }))).status).toBe(201);
    expect((await admin.post('/api/admin/gastos', valido({ fecha: '2024-02-29' }))).status).toBe(201);
    // emoji: cuenta como un carácter, igual que en la base
    expect((await admin.post('/api/admin/gastos', valido({ descripcion: '🧽'.repeat(120) }))).status).toBe(201);
  });

  it('400 con fields en cada campo inválido', async () => {
    const { admin } = await equipo();
    const casos: [string, Record<string, unknown>, string][] = [
      ['fecha', valido({ fecha: '2026-10-17' }), 'fecha'], // futura
      ['fecha', valido({ fecha: '2026-02-30' }), 'fecha'],
      ['fecha', valido({ fecha: '16/10/2026' }), 'fecha'],
      ['fecha', valido({ fecha: 20261014 }), 'fecha'],
      ['categoria', valido({ categoria: 'comida' }), 'categoria'],
      ['categoria', valido({ categoria: 'INSUMOS' }), 'categoria'],
      ['descripcion', valido({ descripcion: '' }), 'descripcion'],
      ['descripcion', valido({ descripcion: '   ' }), 'descripcion'],
      ['descripcion', valido({ descripcion: 'x'.repeat(121) }), 'descripcion'],
      ['descripcion', valido({ descripcion: 'línea 1\nlínea 2' }), 'descripcion'],
      ['descripcion', valido({ descripcion: null }), 'descripcion'],
      ['monto', valido({ monto: 0 }), 'monto'],
      ['monto', valido({ monto: -5 }), 'monto'],
      ['monto', valido({ monto: 12.5 }), 'monto'],
      ['monto', valido({ monto: '1000' }), 'monto'],
      ['monto', valido({ monto: 100_000_000 }), 'monto'],
      ['proveedor', valido({ proveedor: 'p'.repeat(81) }), 'proveedor'],
      ['proveedor', valido({ proveedor: 'a\tb' }), 'proveedor'],
      ['proveedor', valido({ proveedor: 5 }), 'proveedor'],
      ['campo extra', valido({ origen: 'inventario' }), 'origen'],
      ['campo extra', valido({ creadoPor: 'x' }), 'creadoPor'],
    ];
    for (const [nombre, body, campo] of casos) {
      const r = await admin.post('/api/admin/gastos', body);
      expect(r.status, `${nombre} ${JSON.stringify(body)}`).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(r.body.error.fields), nombre).toEqual([campo]);
    }
    const vacio = await admin.post('/api/admin/gastos', {});
    expect(Object.keys(vacio.body.error.fields).sort()).toEqual(['categoria', 'descripcion', 'fecha', 'monto']);
  });

  it('la fecha futura se mide en La Rioja: a las 22:30 de La Rioja (01:30 UTC de mañana) hoy sigue siendo hoy', async () => {
    const { admin } = await equipo({ now: new Date('2026-10-17T01:30:00.000Z') }); // 16/10 22:30 en La Rioja
    expect((await admin.post('/api/admin/gastos', valido({ fecha: '2026-10-16' }))).status).toBe(201);
    const manana = await admin.post('/api/admin/gastos', valido({ fecha: '2026-10-17' }));
    expect(manana.status).toBe(400);
    expect(manana.body.error.fields.fecha).toMatch(/futura/);
  });
});

describe('PATCH y DELETE /api/admin/gastos/:id', () => {
  it('cambia solo los campos enviados; proveedor null lo borra; updatedAt se mueve', async () => {
    const { context, admin } = await equipo();
    const creado = await admin.post('/api/admin/gastos', valido({ proveedor: 'Norte' }));
    const id = creado.body.gasto.id as string;
    context.clock.current = new Date('2026-10-16T15:30:00.000Z');

    const r = await admin.patch(`/api/admin/gastos/${id}`, { monto: 15000, categoria: 'herramientas' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.gasto).toMatchObject({ id, monto: 15000, categoria: 'herramientas', descripcion: 'Cera en pasta', proveedor: 'Norte', fecha: '2026-10-14' });
    expect(r.body.gasto.updatedAt).toBe('2026-10-16T15:30:00.000Z');
    expect(Number.isNaN(Date.parse(r.body.gasto.createdAt))).toBe(false);

    const sinProveedor = await admin.patch(`/api/admin/gastos/${id}`, { proveedor: null });
    expect(sinProveedor.body.gasto.proveedor).toBeNull();
    const fecha = await admin.patch(`/api/admin/gastos/${id}`, { fecha: '2026-10-01', descripcion: 'Nueva' });
    expect(fecha.body.gasto).toMatchObject({ fecha: '2026-10-01', descripcion: 'Nueva', monto: 15000 });
  });

  it('400: cuerpo vacío, campos inválidos, fecha futura y campos de más; 404 si no existe', async () => {
    const { context, admin } = await equipo();
    const id = await gasto(context, { fecha: '2026-10-10' });
    const vacio = await admin.patch(`/api/admin/gastos/${id}`, {});
    expect(vacio.status).toBe(400);
    expect(vacio.body.error.message).toMatch(/al menos un cambio/);
    expect((await admin.patch(`/api/admin/gastos/${id}`, { monto: 0 })).body.error.fields).toHaveProperty('monto');
    expect((await admin.patch(`/api/admin/gastos/${id}`, { fecha: '2026-10-17' })).body.error.fields).toHaveProperty('fecha');
    expect((await admin.patch(`/api/admin/gastos/${id}`, { origen: 'inventario' })).body.error.fields).toHaveProperty('origen');
    expect((await admin.patch(`/api/admin/gastos/${id}`, { descripcion: '' })).body.error.fields).toHaveProperty('descripcion');

    const inexistente = '11111111-1111-4111-8111-111111111111';
    for (const otro of [inexistente, 'no-es-un-uuid', '1']) {
      const r = await admin.patch(`/api/admin/gastos/${otro}`, { monto: 5 });
      expect(r.status, otro).toBe(404);
      expect(r.body.error.code).toBe('NOT_FOUND');
    }
    expect((await admin.delete(`/api/admin/gastos/${inexistente}`)).status).toBe(404);
    expect((await admin.delete('/api/admin/gastos/no-es-un-uuid')).status).toBe(404);
  });

  it('DELETE responde 204 y el gasto desaparece de la lista y de la suma', async () => {
    const { context, admin } = await equipo();
    const id = await gasto(context, { fecha: '2026-10-10', monto: 700 });
    await gasto(context, { fecha: '2026-10-11', monto: 300 });
    const borrar = await admin.delete(`/api/admin/gastos/${id}`);
    expect(borrar.status).toBe(204);
    expect(borrar.text).toBe('');
    const lista = await admin.get('/api/admin/gastos');
    expect(lista.body).toMatchObject({ total: 1, suma: 300 });
    expect((await admin.delete(`/api/admin/gastos/${id}`)).status).toBe(404);
  });

  it('un gasto de inventario no se edita ni se borra: 409 GASTO_DE_INVENTARIO y queda intacto', async () => {
    const { context, admin } = await equipo();
    const id = await gasto(context, { fecha: '2026-10-10', monto: 6000, origen: 'inventario', categoria: 'insumos' });
    const patch = await admin.patch(`/api/admin/gastos/${id}`, { monto: 1 });
    expect(patch.status).toBe(409);
    expect(patch.body.error).toEqual({
      code: 'GASTO_DE_INVENTARIO',
      message: 'Este gasto viene de una compra de inventario: corregilo desde Inventario.',
    });
    const borrar = await admin.delete(`/api/admin/gastos/${id}`);
    expect(borrar.status).toBe(409);
    expect(borrar.body.error.code).toBe('GASTO_DE_INVENTARIO');
    const lista = await admin.get('/api/admin/gastos');
    expect(lista.body.gastos[0]).toMatchObject({ id, monto: 6000, origen: 'inventario' });
  });
});

describe('GET /api/admin/gastos', () => {
  it('por omisión, el mes actual; con total y suma de todo el filtro; más nuevos primero', async () => {
    const { context, admin } = await equipo();
    await gasto(context, { fecha: '2026-10-01', monto: 100, descripcion: 'primero' });
    await gasto(context, { fecha: '2026-10-16', monto: 200, descripcion: 'hoy' });
    await gasto(context, { fecha: '2026-10-09', monto: 400, descripcion: 'medio' });
    await gasto(context, { fecha: '2026-09-30', monto: 8000, descripcion: 'mes pasado' });
    const r = await admin.get('/api/admin/gastos');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['gastos', 'suma', 'total']);
    expect(r.body.gastos.map((g: { descripcion: string }) => g.descripcion)).toEqual(['hoy', 'medio', 'primero']);
    expect(r.body.total).toBe(3);
    expect(r.body.suma).toBe(700);
    for (const g of r.body.gastos) expect(Object.keys(g).sort()).toEqual(CLAVES_GASTO);
  });

  it('el mes por omisión termina el 29/02 en un año bisiesto y empieza el 1 del mes (servidor en UTC)', async () => {
    const { context, admin } = await equipo({ now: new Date('2028-02-29T02:00:00.000Z') }); // 28/02 23:00 en La Rioja
    await gasto(context, { fecha: '2028-02-01', descripcion: 'inicio' });
    await gasto(context, { fecha: '2028-02-29', descripcion: 'bisiesto' });
    await gasto(context, { fecha: '2028-01-31', descripcion: 'enero' });
    await gasto(context, { fecha: '2028-03-01', descripcion: 'marzo' });
    const r = await admin.get('/api/admin/gastos');
    expect(r.body.gastos.map((g: { descripcion: string }) => g.descripcion)).toEqual(['bisiesto', 'inicio']);
    // fin de año: diciembre llega hasta el 31
    context.clock.current = new Date('2026-12-31T15:00:00.000Z');
    await gasto(context, { fecha: '2026-12-31', descripcion: 'nochevieja' });
    expect((await admin.get('/api/admin/gastos')).body.gastos.map((g: { descripcion: string }) => g.descripcion)).toEqual(['nochevieja']);
  });

  it('desde y hasta son inclusivos; con uno solo, el otro extremo queda abierto', async () => {
    const { context, admin } = await equipo();
    for (const fecha of ['2026-08-31', '2026-09-01', '2026-09-30', '2026-10-01']) await gasto(context, { fecha, descripcion: fecha });
    const nombres = async (query: string) =>
      ((await admin.get(`/api/admin/gastos?${query}`)).body.gastos as { descripcion: string }[]).map((g) => g.descripcion);
    expect(await nombres('desde=2026-09-01&hasta=2026-09-30')).toEqual(['2026-09-30', '2026-09-01']);
    expect(await nombres('desde=2026-09-30')).toEqual(['2026-10-01', '2026-09-30']);
    expect(await nombres('hasta=2026-09-01')).toEqual(['2026-09-01', '2026-08-31']);
    expect(await nombres('desde=2026-09-01&hasta=2026-09-01')).toEqual(['2026-09-01']);
  });

  it('filtra por categoría y la suma cubre todo el filtro aunque la página sea chica', async () => {
    const { context, admin } = await equipo();
    for (let i = 1; i <= 5; i++) await gasto(context, { fecha: `2026-10-0${String(i)}`, categoria: 'insumos', monto: 1000 * i, descripcion: `i${String(i)}` });
    await gasto(context, { fecha: '2026-10-06', categoria: 'alquiler', monto: 90000 });
    const pagina1 = await admin.get('/api/admin/gastos?categoria=insumos&limit=2');
    expect(pagina1.body.gastos.map((g: { descripcion: string }) => g.descripcion)).toEqual(['i5', 'i4']);
    expect(pagina1.body.total).toBe(5);
    expect(pagina1.body.suma).toBe(15000);
    const pagina3 = await admin.get('/api/admin/gastos?categoria=insumos&limit=2&offset=4');
    expect(pagina3.body.gastos.map((g: { descripcion: string }) => g.descripcion)).toEqual(['i1']);
    expect(pagina3.body.total).toBe(5);
    const mas = await admin.get('/api/admin/gastos?categoria=insumos&offset=100');
    expect(mas.body).toMatchObject({ gastos: [], total: 5, suma: 15000 });
    const todos = await admin.get('/api/admin/gastos');
    expect(todos.body).toMatchObject({ total: 6, suma: 105000 });
  });

  it('q busca en descripción y proveedor sin distinguir mayúsculas ni acentos', async () => {
    const { context, admin } = await equipo();
    await gasto(context, { fecha: '2026-10-05', descripcion: 'Compra de paños de microfibra', proveedor: null });
    await gasto(context, { fecha: '2026-10-06', descripcion: 'Combustible', proveedor: 'Estación Ñandú' });
    await gasto(context, { fecha: '2026-10-07', descripcion: 'Otra cosa', proveedor: 'Sin relación' });
    const ids = async (q: string) =>
      ((await admin.get(`/api/admin/gastos?q=${encodeURIComponent(q)}`)).body.gastos as { descripcion: string }[]).map((g) => g.descripcion);
    expect(await ids('MicroFibra')).toEqual(['Compra de paños de microfibra']);
    expect(await ids('PAÑOS')).toEqual(['Compra de paños de microfibra']);
    expect(await ids('estacion')).toEqual(['Combustible']);
    expect(await ids('ESTACIÓN ñandú')).toEqual(['Combustible']);
    expect(await ids('micro')).toEqual(['Compra de paños de microfibra']);
    expect(await ids('zzz')).toEqual([]);
    // la búsqueda respeta los demás filtros
    const filtrado = await admin.get('/api/admin/gastos?q=co&desde=2026-10-06');
    expect(filtrado.body.gastos.map((g: { descripcion: string }) => g.descripcion)).toEqual(['Otra cosa', 'Combustible']);
  });

  it('los comodines de LIKE se buscan como texto y una inyección de SQL no hace nada', async () => {
    const { context, admin } = await equipo();
    await gasto(context, { fecha: '2026-10-05', descripcion: 'Descuento del 100% en cera' });
    await gasto(context, { fecha: '2026-10-06', descripcion: 'Filtro_aire' });
    await gasto(context, { fecha: '2026-10-07', descripcion: 'Filtro aire' });
    await gasto(context, { fecha: '2026-10-08', descripcion: 'Ruta C:\\temp' });
    const descripciones = async (q: string) =>
      ((await admin.get(`/api/admin/gastos?q=${encodeURIComponent(q)}`)).body.gastos as { descripcion: string }[]).map((g) => g.descripcion);
    expect(await descripciones('100%')).toEqual(['Descuento del 100% en cera']);
    expect(await descripciones('o_a')).toEqual(['Filtro_aire']); // "_" no es "cualquier carácter"
    expect(await descripciones('%%')).toEqual([]);
    expect(await descripciones('C:\\')).toEqual(['Ruta C:\\temp']);
    expect(await descripciones("'; DROP TABLE mgdetailing.gastos; --")).toEqual([]);
    expect((await admin.get('/api/admin/gastos')).body.total).toBe(4);
  });

  it('parámetros inválidos: 400 con el campo; vacíos cuentan como no enviados; desconocidos se ignoran', async () => {
    const { admin } = await equipo();
    const campos = async (query: string) => Object.keys((await admin.get(`/api/admin/gastos?${query}`)).body.error?.fields ?? {});
    expect(await campos('desde=2026-02-30')).toEqual(['desde']);
    expect(await campos('hasta=hoy')).toEqual(['hasta']);
    expect(await campos('categoria=comida')).toEqual(['categoria']);
    expect(await campos('q=a')).toEqual(['q']);
    expect(await campos(`q=${'x'.repeat(81)}`)).toEqual(['q']);
    expect(await campos('limit=0')).toEqual(['limit']);
    expect(await campos('limit=101')).toEqual(['limit']);
    expect(await campos('limit=abc')).toEqual(['limit']);
    expect(await campos('offset=-1')).toEqual(['offset']);
    expect(await campos('desde=2026-10-10&hasta=2026-10-09')).toEqual(['hasta']);
    for (const ok of ['limit=100', 'limit=1', 'desde=&hasta=&categoria=&q=&limit=&offset=', 'otro=1']) {
      expect((await admin.get(`/api/admin/gastos?${ok}`)).status, ok).toBe(200);
    }
  });

  it('si la persona que lo cargó se borra, el gasto queda sin autor', async () => {
    const { context, admin } = await equipo();
    const ana = await addUser(context, { email: 'carla@t.test', rol: 'admin', nombre: 'Carla' });
    const carla = await loginClient(context, 'carla@t.test');
    const creado = await carla.post('/api/admin/gastos', valido());
    expect(creado.body.gasto.creadoPor).toEqual({ id: ana, nombre: 'Carla' });
    await context.db.sql.query('DELETE FROM auth.users WHERE id = $1::uuid', [ana]);
    const lista = await admin.get('/api/admin/gastos');
    expect(lista.body.gastos[0]).toMatchObject({ descripcion: 'Cera en pasta', creadoPor: null });
  });
});

describe('registrarGastoDeInventario (para el inventario, dentro de su transacción)', () => {
  it('crea un gasto de insumos con origen inventario y lo devuelve', async () => {
    const { context, admin, adminId } = await equipo();
    const creado = await context.db.appSql.transaction((tx) =>
      registrarGastoDeInventario(tx, { fecha: '2026-10-16', descripcion: 'Compra: Cera en pasta (5 unidad)', monto: 12500, proveedor: 'Norte', creadoPor: adminId }),
    );
    expect(creado).toMatchObject({ categoria: 'insumos', origen: 'inventario', monto: 12500, proveedor: 'Norte', creadoPor: { id: adminId } });
    const lista = await admin.get('/api/admin/gastos');
    expect(lista.body.gastos[0]).toMatchObject({ id: creado.id, origen: 'inventario', categoria: 'insumos' });
    // y desde Gastos no se toca
    expect((await admin.delete(`/api/admin/gastos/${creado.id}`)).status).toBe(409);
  });

  it('si la transacción de quien llama falla, el gasto también se revierte; datos fuera de rango los rechaza la base', async () => {
    const { context } = await equipo();
    const cuenta = async () => (await context.db.sql.query('SELECT count(*)::int AS n FROM mgdetailing.gastos')).rows[0]?.n;
    await expect(
      context.db.appSql.transaction(async (tx) => {
        await registrarGastoDeInventario(tx, { fecha: '2026-10-16', descripcion: 'Compra', monto: 100 });
        throw new Error('falló el movimiento de stock');
      }),
    ).rejects.toThrow(/falló el movimiento/);
    expect(await cuenta()).toBe(0);
    await expect(
      context.db.appSql.transaction((tx) => registrarGastoDeInventario(tx, { fecha: '2026-10-16', descripcion: 'Compra', monto: 0 })),
    ).rejects.toThrow();
    await expect(
      context.db.appSql.transaction((tx) => registrarGastoDeInventario(tx, { fecha: '2026-10-16', descripcion: 'x'.repeat(121), monto: 5 })),
    ).rejects.toThrow();
    expect(await cuenta()).toBe(0);
  });
});

describe('tabla gastos (segunda defensa)', () => {
  it('los CHECK de la base rechazan categoría, origen, monto y largos inválidos; el rol de la app no puede cambiar el id ni el origen', async () => {
    const { context } = await equipo();
    const insertar = (_columnas: string, v: unknown[]) =>
      context.db.sql.query(
        "INSERT INTO mgdetailing.gastos (fecha, categoria, descripcion, monto, origen, proveedor) VALUES ($1::date, $2, $3, $4, coalesce($5, 'manual'), $6)",
        [v[0], v[1], v[2], v[3], v[4] ?? null, v[5] ?? null],
      );
    await expect(insertar('fecha, categoria, descripcion, monto', ['2026-10-01', 'comida', 'x', 5])).rejects.toThrow(/gastos_categoria_valida/);
    await expect(insertar('fecha, categoria, descripcion, monto, origen', ['2026-10-01', 'otros', 'x', 5, 'api'])).rejects.toThrow(/gastos_origen_valido/);
    await expect(insertar('fecha, categoria, descripcion, monto', ['2026-10-01', 'otros', 'x', 0])).rejects.toThrow(/gastos_monto_rango/);
    await expect(insertar('fecha, categoria, descripcion, monto', ['2026-10-01', 'otros', 'x', 100_000_000])).rejects.toThrow(/gastos_monto_rango/);
    await expect(insertar('fecha, categoria, descripcion, monto', ['2026-10-01', 'otros', '', 5])).rejects.toThrow(/gastos_descripcion_largo/);
    await expect(insertar('fecha, categoria, descripcion, monto', ['2026-10-01', 'otros', 'x'.repeat(121), 5])).rejects.toThrow(/gastos_descripcion_largo/);
    await expect(insertar('', ['2026-10-01', 'otros', 'x', 5, null, 'p'.repeat(81)])).rejects.toThrow(/gastos_proveedor_largo/);
    // el rol de la app no puede reescribir el id ni el origen de un gasto existente
    const id = await gasto(context, { fecha: '2026-10-01' });
    await expect(context.db.appSql.query("UPDATE mgdetailing.gastos SET origen = 'inventario' WHERE id = $1::uuid", [id])).rejects.toThrow(/permission denied/);
    await expect(context.db.appSql.query('UPDATE mgdetailing.gastos SET id = gen_random_uuid() WHERE id = $1::uuid', [id])).rejects.toThrow(/permission denied/);
  });
});
