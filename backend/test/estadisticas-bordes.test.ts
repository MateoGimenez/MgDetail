import { afterEach, describe, expect, it } from 'vitest';
import { type TestContext, addUser, closeAllContexts, createTestContext, loginClient } from './helpers.js';

afterEach(closeAllContexts);

/* Bordes de fechas, números y entradas raras de las estadísticas (Objetivo 8). La zona del taller es UTC-3 (La Rioja). */

async function turno(
  context: TestContext,
  t: { fecha: string; monto?: number | null; estado?: string; trabajador?: string | null },
): Promise<void> {
  await context.db.sql.query(
    `INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja, estado, monto, trabajador_id)
     VALUES ('C', '12345678', 'auto', 'pulido', $1::date, 'manana', $2, $3, $4::uuid)`,
    [t.fecha, t.estado ?? 'completado', t.monto ?? null, t.trabajador ?? null],
  );
}

async function admin(now: Date) {
  const context = await createTestContext({ now });
  await addUser(context, { email: 'ana@t.test', rol: 'admin', nombre: 'Ana' });
  return { context, client: await loginClient(context, 'ana@t.test') };
}

describe('"hoy" es el de La Rioja, a cualquier hora', () => {
  it('23:59:59 en La Rioja (02:59:59 UTC del día siguiente) sigue siendo el mismo día; 00:00:00 ya es el siguiente', async () => {
    const tarde = await admin(new Date('2026-12-31T02:59:59.000Z')); // 30/12 23:59:59 en La Rioja
    await turno(tarde.context, { fecha: '2026-12-30', monto: 100 });
    await turno(tarde.context, { fecha: '2026-12-31', monto: 7 });
    const a = await tarde.client.get('/api/admin/estadisticas');
    expect(a.body.rango).toEqual({ desde: '2026-12-01', hasta: '2026-12-30' });
    expect(a.body.resumen.hoy).toEqual({ actual: { completados: 1, ingresos: 100 }, anterior: { completados: 0, ingresos: 0 } });
    await closeAllContexts();

    const medianoche = await admin(new Date('2026-12-31T03:00:00.000Z')); // 31/12 00:00:00 en La Rioja
    await turno(medianoche.context, { fecha: '2026-12-30', monto: 100 });
    await turno(medianoche.context, { fecha: '2026-12-31', monto: 7 });
    const b = await medianoche.client.get('/api/admin/estadisticas');
    expect(b.body.rango).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
    expect(b.body.resumen.hoy).toEqual({ actual: { completados: 1, ingresos: 7 }, anterior: { completados: 1, ingresos: 100 } });
    // fin de año: el año pasado hasta el mismo día
    expect(b.body.resumen.anio.actual).toEqual({ completados: 2, ingresos: 107 });
  });
});

describe('años bisiestos y rangos largos', () => {
  it('2028: hoy = 29/02; el mes pasado y el año pasado topan en el último día de febrero de 2027', async () => {
    const { context, client } = await admin(new Date('2028-02-29T15:00:00.000Z'));
    await turno(context, { fecha: '2028-02-29', monto: 1000 });
    await turno(context, { fecha: '2027-02-28', monto: 300 });
    await turno(context, { fecha: '2028-01-29', monto: 50 });
    await turno(context, { fecha: '2028-01-30', monto: 9999 }); // fuera del "mes pasado hasta el 29/01"
    const response = await client.get('/api/admin/estadisticas');
    expect(response.body.resumen.hoy.actual).toEqual({ completados: 1, ingresos: 1000 });
    expect(response.body.resumen.hoy.anterior).toEqual({ completados: 0, ingresos: 0 });
    expect(response.body.resumen.mes.anterior).toEqual({ completados: 1, ingresos: 50 });
    expect(response.body.resumen.anio.anterior.ingresos).toBe(300);
    expect(response.body.serie).toHaveLength(29);
    expect(response.body.serie.at(-1)).toEqual({ clave: '2028-02-29', completados: 1, ingresos: 1000 });
  });

  it('366 días exactos pasan (por mes) incluso con un 29/02 adentro; 367 es 400', async () => {
    const { context, client } = await admin(new Date('2028-06-15T15:00:00.000Z'));
    await turno(context, { fecha: '2028-02-29', monto: 5 });
    const ok = await client.get('/api/admin/estadisticas?desde=2028-01-01&hasta=2028-12-31'); // 366 días
    expect(ok.status).toBe(200);
    expect(ok.body.granularidad).toBe('mes');
    expect(ok.body.serie.map((p: { clave: string }) => p.clave)).toEqual(
      Array.from({ length: 12 }, (_, i) => `2028-${String(i + 1).padStart(2, '0')}`),
    );
    expect(ok.body.serie[1]).toEqual({ clave: '2028-02', completados: 1, ingresos: 5 });
    const largo = await client.get('/api/admin/estadisticas?desde=2028-01-01&hasta=2029-01-01'); // 367
    expect(largo.status).toBe(400);
    expect(largo.body.error.fields).toHaveProperty('hasta');
    // 2027 no es bisiesto: 365 días
    expect((await client.get('/api/admin/estadisticas?desde=2027-01-01&hasta=2027-12-31')).status).toBe(200);
    // cruzando fin de año
    const cruza = await client.get('/api/admin/estadisticas?desde=2027-12-30&hasta=2028-01-02');
    expect(cruza.body.serie.map((p: { clave: string }) => p.clave)).toEqual(['2027-12-30', '2027-12-31', '2028-01-01', '2028-01-02']);
  });

  it('62 días van por día y 63 por mes (cruzando años)', async () => {
    const { client } = await admin(new Date('2028-03-15T15:00:00.000Z'));
    const dia = await client.get('/api/admin/estadisticas?desde=2027-12-01&hasta=2028-01-31'); // 62
    expect(dia.body.granularidad).toBe('dia');
    expect(dia.body.serie).toHaveLength(62);
    const mes = await client.get('/api/admin/estadisticas?desde=2027-12-01&hasta=2028-02-01'); // 63
    expect(mes.body.granularidad).toBe('mes');
    expect(mes.body.serie.map((p: { clave: string }) => p.clave)).toEqual(['2027-12', '2028-01', '2028-02']);
  });
});

describe('números grandes y un solo turno', () => {
  it('ingresos de varios turnos con el monto máximo no pierden precisión', async () => {
    const { context, client } = await admin(new Date('2026-10-16T15:00:00.000Z'));
    for (let i = 0; i < 30; i += 1) await turno(context, { fecha: '2026-10-16', monto: 99_999_999 });
    const response = await client.get('/api/admin/estadisticas');
    expect(response.body.periodo.ingresos).toBe(2_999_999_970);
    expect(response.body.periodo.ticketPromedio).toBe(99_999_999);
    expect(response.body.resumen.mes.actual.ingresos).toBe(2_999_999_970);
    expect(response.body.porServicio[0].ingresos).toBe(2_999_999_970);
  });

  it('un solo turno: ticket igual al monto; sin monto, ticket null y cancelación 0', async () => {
    const uno = await admin(new Date('2026-10-16T15:00:00.000Z'));
    await turno(uno.context, { fecha: '2026-10-16', monto: 12345 });
    const a = await uno.client.get('/api/admin/estadisticas');
    expect(a.body.periodo).toMatchObject({ completados: 1, ticketPromedio: 12345, tasaCancelacion: 0, completadosSinMonto: 0 });
    await closeAllContexts();
    const sin = await admin(new Date('2026-10-16T15:00:00.000Z'));
    await turno(sin.context, { fecha: '2026-10-16' });
    const b = await sin.client.get('/api/admin/estadisticas');
    expect(b.body.periodo).toMatchObject({ ingresos: 0, ticketPromedio: null, completadosSinMonto: 1 });
  });
});

describe('entradas raras en los parámetros', () => {
  it('parámetros repetidos, inyecciones, fechas imposibles y vacíos', async () => {
    const { client } = await admin(new Date('2026-10-16T15:00:00.000Z'));
    for (const consulta of [
      'desde=2026-10-01&desde=2026-10-02',
      "desde=2026-10-01';DROP TABLE mgdetailing.bookings;--",
      'desde=2026-02-30&hasta=2026-03-01',
      'desde=2026-13-01',
      'hasta=ayer',
    ]) {
      const response = await client.get(`/api/admin/estadisticas?${consulta}`);
      expect(response.status, consulta).toBe(400);
      const mias = await client.get(`/api/admin/estadisticas/mias?${consulta}`);
      expect(mias.status, consulta).toBe(400);
    }
    // vacíos = valores por omisión
    const vacios = await client.get('/api/admin/estadisticas?desde=&hasta=');
    expect(vacios.status).toBe(200);
    expect(vacios.body.rango).toEqual({ desde: '2026-10-01', hasta: '2026-10-16' });
    // solo "desde": hasta = hoy; solo "hasta": desde = primer día del mes de "hasta"
    expect((await client.get('/api/admin/estadisticas?hasta=2026-08-20')).body.rango).toEqual({ desde: '2026-08-01', hasta: '2026-08-20' });
  });
});
