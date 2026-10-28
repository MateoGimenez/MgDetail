import { afterEach, describe, expect, it } from 'vitest';
import type { CupoDia } from '../src/domain/disponibilidad.js';
import {
  calcularProgreso,
  contarDiasDeAtencion,
  estadoDeMeta,
  limitesDelMes,
  mesesPermitidos,
  mezclarMeta,
  sumarMeses,
} from '../src/domain/metas.js';
import { type TestContext, closeAllContexts, createClient, createTestContext, loginAs } from './helpers.js';

afterEach(closeAllContexts);

/** Hoy en los tests: 2026-10-16 (viernes), 12:00 en La Rioja. */

async function equipo(options: Parameters<typeof createTestContext>[0] = {}) {
  const context = await createTestContext(options);
  const admin = await loginAs(context, 'admin', 'ana@t.test');
  const empleado = await loginAs(context, 'empleado', 'beto@t.test');
  return { context, admin: admin.client, empleado: empleado.client };
}

async function completado(context: TestContext, fecha: string, monto: number | null): Promise<void> {
  await context.db.sql.query(
    `INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja, estado, monto)
     VALUES ('Cliente', '12345678', 'auto', 'pulido', $1::date, 'manana', 'completado', $2)`,
    [fecha, monto],
  );
}

describe('dominio: días de atención, progreso y estado', () => {
  const dia = (fecha: string, abierto: boolean): CupoDia => ({
    fecha,
    abierto,
    cupoManana: abierto ? 2 : 0,
    cupoTarde: abierto ? 2 : 0,
    ocupadosManana: 0,
    ocupadosTarde: 0,
  });

  it('contarDiasDeAtencion: solo cuentan los días abiertos y hoy cuenta como transcurrido', () => {
    const dias = [dia('2026-10-01', true), dia('2026-10-02', false), dia('2026-10-03', true), dia('2026-10-04', true)];
    expect(contarDiasDeAtencion(dias, '2026-10-03')).toEqual({ totales: 3, transcurridos: 2, restantes: 1 });
    expect(contarDiasDeAtencion(dias, '2026-09-30')).toEqual({ totales: 3, transcurridos: 0, restantes: 3 });
    expect(contarDiasDeAtencion(dias, '2026-11-01')).toEqual({ totales: 3, transcurridos: 3, restantes: 0 });
    expect(contarDiasDeAtencion([], '2026-10-03')).toEqual({ totales: 0, transcurridos: 0, restantes: 0 });
  });

  it('el ejemplo del contrato: 1.096.000 de 1.500.000 con 20 de 25 días', () => {
    const progreso = calcularProgreso(
      { ingresosObjetivo: 1_500_000, trabajosObjetivo: 40 },
      { ingresos: 1_096_000, trabajos: 32 },
      { totales: 25, transcurridos: 20, restantes: 5 },
    );
    expect(progreso).toEqual({
      ingresos: 1_096_000,
      trabajos: 32,
      porcentajeIngresos: 0.7307,
      porcentajeTrabajos: 0.8,
      diasDeAtencionTranscurridos: 20,
      diasDeAtencionRestantes: 5,
      diasDeAtencionTotales: 25,
      proyeccionIngresos: 1_370_000,
      necesarioPorDia: 80_800,
      estado: 'en-ritmo',
    });
  });

  it('estados: adelantado, en-ritmo, atrasado (con los bordes exactos de 110 % y 90 %) y cumplida', () => {
    const dias = { totales: 20, transcurridos: 10, restantes: 10 };
    const meta = { ingresosObjetivo: 1000, trabajosObjetivo: null };
    // esperado = 500
    expect(estadoDeMeta(meta, { ingresos: 550, trabajos: 0 }, dias)).toBe('adelantado');
    expect(estadoDeMeta(meta, { ingresos: 549, trabajos: 0 }, dias)).toBe('en-ritmo');
    expect(estadoDeMeta(meta, { ingresos: 450, trabajos: 0 }, dias)).toBe('en-ritmo');
    expect(estadoDeMeta(meta, { ingresos: 449, trabajos: 0 }, dias)).toBe('atrasado');
    expect(estadoDeMeta(meta, { ingresos: 0, trabajos: 0 }, dias)).toBe('atrasado');
    expect(estadoDeMeta(meta, { ingresos: 1000, trabajos: 0 }, dias)).toBe('cumplida');
    expect(estadoDeMeta(meta, { ingresos: 5000, trabajos: 0 }, dias)).toBe('cumplida');
    expect(estadoDeMeta(null, { ingresos: 5000, trabajos: 0 }, dias)).toBe('sin-meta');
  });

  it('con dos objetivos se mira el más atrasado y "cumplida" exige los dos', () => {
    const dias = { totales: 20, transcurridos: 10, restantes: 10 };
    const meta = { ingresosObjetivo: 1000, trabajosObjetivo: 10 };
    expect(estadoDeMeta(meta, { ingresos: 1000, trabajos: 9 }, dias)).toBe('adelantado');
    expect(estadoDeMeta(meta, { ingresos: 1000, trabajos: 10 }, dias)).toBe('cumplida');
    expect(estadoDeMeta(meta, { ingresos: 600, trabajos: 1 }, dias)).toBe('atrasado');
    // meta solo de trabajos
    expect(estadoDeMeta({ ingresosObjetivo: null, trabajosObjetivo: 10 }, { ingresos: 0, trabajos: 5 }, dias)).toBe('en-ritmo');
  });

  it('sin días transcurridos o sin días de atención: en-ritmo, sin proyección; sin restantes: necesarioPorDia null', () => {
    const meta = { ingresosObjetivo: 1000, trabajosObjetivo: null };
    const inicio = calcularProgreso(meta, { ingresos: 0, trabajos: 0 }, { totales: 20, transcurridos: 0, restantes: 20 });
    expect(inicio).toMatchObject({ estado: 'en-ritmo', proyeccionIngresos: null, necesarioPorDia: 50, porcentajeTrabajos: null });
    const sinDias = calcularProgreso(meta, { ingresos: 0, trabajos: 0 }, { totales: 0, transcurridos: 0, restantes: 0 });
    expect(sinDias).toMatchObject({ estado: 'en-ritmo', proyeccionIngresos: null, necesarioPorDia: null });
    const final = calcularProgreso(meta, { ingresos: 400, trabajos: 0 }, { totales: 20, transcurridos: 20, restantes: 0 });
    expect(final).toMatchObject({ estado: 'atrasado', necesarioPorDia: null, proyeccionIngresos: 400 });
    // cumplida: no falta nada, aunque no queden días
    expect(calcularProgreso(meta, { ingresos: 1200, trabajos: 0 }, { totales: 20, transcurridos: 20, restantes: 0 })).toMatchObject({
      estado: 'cumplida',
      necesarioPorDia: 0,
      porcentajeIngresos: 1.2,
    });
  });

  it('sin meta: porcentajes, proyección y necesario por día en null, pero con lo logrado y los días', () => {
    expect(calcularProgreso(null, { ingresos: 500, trabajos: 3 }, { totales: 25, transcurridos: 10, restantes: 15 })).toEqual({
      ingresos: 500,
      trabajos: 3,
      porcentajeIngresos: null,
      porcentajeTrabajos: null,
      diasDeAtencionTranscurridos: 10,
      diasDeAtencionRestantes: 15,
      diasDeAtencionTotales: 25,
      proyeccionIngresos: null,
      necesarioPorDia: null,
      estado: 'sin-meta',
    });
  });

  it('meses: límites (29/02), desplazamientos y ventana permitida', () => {
    expect(limitesDelMes('2028-02')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(limitesDelMes('2027-02')).toEqual({ desde: '2027-02-01', hasta: '2027-02-28' });
    expect(limitesDelMes('2026-12')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
    expect(sumarMeses('2026-12', 1)).toBe('2027-01');
    expect(sumarMeses('2026-10', -12)).toBe('2025-10');
    expect(mesesPermitidos('2026-10-16')).toEqual({ primero: '2025-10', ultimo: '2027-10' });
    expect(mesesPermitidos('2026-01-31')).toEqual({ primero: '2025-01', ultimo: '2027-01' });
  });

  it('mezclarMeta: undefined conserva, null vacía', () => {
    const actual = { ingresosObjetivo: 100, trabajosObjetivo: 5 };
    expect(mezclarMeta(actual, {})).toEqual(actual);
    expect(mezclarMeta(actual, { trabajosObjetivo: null })).toEqual({ ingresosObjetivo: 100, trabajosObjetivo: null });
    expect(mezclarMeta(null, { ingresosObjetivo: 9 })).toEqual({ ingresosObjetivo: 9, trabajosObjetivo: null });
  });
});

describe('permisos de metas', () => {
  it('el empleado recibe 403 en todo (antes de validar) y sin sesión 401', async () => {
    const { empleado, context } = await equipo();
    for (const r of [
      await empleado.get('/api/admin/metas/actual'),
      await empleado.get('/api/admin/metas'),
      await empleado.put('/api/admin/metas/2026-10', { ingresosObjetivo: 5 }),
      await empleado.put('/api/admin/metas/basura', {}),
      await empleado.delete('/api/admin/metas/2026-10'),
    ]) {
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('FORBIDDEN');
    }
    expect((await createClient(context.app).get('/api/admin/metas/actual')).status).toBe(401);
  });
});

describe('PUT /api/admin/metas/:mes', () => {
  it('crea, mezcla con lo guardado y devuelve la forma del contrato', async () => {
    const { admin } = await equipo();
    const crea = await admin.put('/api/admin/metas/2026-10', { ingresosObjetivo: 1_500_000, trabajosObjetivo: 40 });
    expect(crea.status, JSON.stringify(crea.body)).toBe(200);
    expect(crea.body).toEqual({ meta: { mes: '2026-10', ingresosObjetivo: 1_500_000, trabajosObjetivo: 40 } });
    // solo cambia ingresos: trabajos se conserva
    const parcial = await admin.put('/api/admin/metas/2026-10', { ingresosObjetivo: 2_000_000 });
    expect(parcial.body.meta).toEqual({ mes: '2026-10', ingresosObjetivo: 2_000_000, trabajosObjetivo: 40 });
    // vaciar uno
    const sinTrabajos = await admin.put('/api/admin/metas/2026-10', { trabajosObjetivo: null });
    expect(sinTrabajos.body.meta).toEqual({ mes: '2026-10', ingresosObjetivo: 2_000_000, trabajosObjetivo: null });
    // vaciar el último que queda: 400 y no cambia nada
    const vacia = await admin.put('/api/admin/metas/2026-10', { ingresosObjetivo: null });
    expect(vacia.status).toBe(400);
    expect(Object.keys(vacia.body.error.fields).sort()).toEqual(['ingresosObjetivo', 'trabajosObjetivo']);
    expect((await admin.get('/api/admin/metas?anio=2026')).body.metas[0]).toMatchObject({ ingresosObjetivo: 2_000_000 });
  });

  it('400: sin ningún objetivo, valores fuera de rango, tipos, campos de más y mes inválido', async () => {
    const { admin } = await equipo();
    const campos = async (url: string, body: unknown) => {
      const r = await admin.put(url, body);
      expect(r.status, `${url} ${JSON.stringify(body)}`).toBe(400);
      return Object.keys(r.body.error.fields).sort();
    };
    expect(await campos('/api/admin/metas/2026-10', {})).toEqual(['ingresosObjetivo', 'trabajosObjetivo']);
    expect(await campos('/api/admin/metas/2026-10', { ingresosObjetivo: null, trabajosObjetivo: null })).toEqual(['ingresosObjetivo', 'trabajosObjetivo']);
    expect(await campos('/api/admin/metas/2026-10', { ingresosObjetivo: 0 })).toEqual(['ingresosObjetivo']);
    expect(await campos('/api/admin/metas/2026-10', { ingresosObjetivo: 1_000_000_000 })).toEqual(['ingresosObjetivo']);
    expect(await campos('/api/admin/metas/2026-10', { ingresosObjetivo: 10.5 })).toEqual(['ingresosObjetivo']);
    expect(await campos('/api/admin/metas/2026-10', { ingresosObjetivo: '100' })).toEqual(['ingresosObjetivo']);
    expect(await campos('/api/admin/metas/2026-10', { trabajosObjetivo: 0 })).toEqual(['trabajosObjetivo']);
    expect(await campos('/api/admin/metas/2026-10', { trabajosObjetivo: 10_000 })).toEqual(['trabajosObjetivo']);
    expect(await campos('/api/admin/metas/2026-10', { ingresosObjetivo: 5, otro: 1 })).toEqual(['otro']);
    for (const mes of ['2026-13', '2026-00', '2026-1', '2026-10-01', 'octubre', '26-10']) {
      expect(await campos(`/api/admin/metas/${mes}`, { ingresosObjetivo: 5 }), mes).toEqual(['mes']);
    }
  });

  it('límites de 12 meses atrás y 12 adelante (inclusive) y no más', async () => {
    const { admin } = await equipo();
    const ok = { ingresosObjetivo: 1000 };
    expect((await admin.put('/api/admin/metas/2025-10', ok)).status).toBe(200);
    expect((await admin.put('/api/admin/metas/2027-10', ok)).status).toBe(200);
    const atras = await admin.put('/api/admin/metas/2025-09', ok);
    expect(atras.status).toBe(400);
    expect(Object.keys(atras.body.error.fields)).toEqual(['mes']);
    expect((await admin.put('/api/admin/metas/2027-11', ok)).status).toBe(400);
    expect((await admin.put('/api/admin/metas/2000-01', ok)).status).toBe(400);
  });

  it('el borde del año se mide con la fecha de La Rioja (servidor en UTC)', async () => {
    // 31/12/2026 22:00 en La Rioja = 01/01/2027 01:00 UTC: el mes actual sigue siendo 2026-12
    const { admin } = await equipo({ now: new Date('2027-01-01T01:00:00.000Z') });
    expect((await admin.put('/api/admin/metas/2025-12', { ingresosObjetivo: 1 })).status).toBe(200);
    expect((await admin.put('/api/admin/metas/2025-11', { ingresosObjetivo: 1 })).status).toBe(400);
    expect((await admin.get('/api/admin/metas/actual')).body.mes).toBe('2026-12');
  });
});

describe('DELETE /api/admin/metas/:mes y GET /api/admin/metas', () => {
  it('borra (204), 404 si no había y 400 con un mes mal escrito', async () => {
    const { admin } = await equipo();
    await admin.put('/api/admin/metas/2026-10', { ingresosObjetivo: 1000 });
    expect((await admin.delete('/api/admin/metas/2026-10')).status).toBe(204);
    const otra = await admin.delete('/api/admin/metas/2026-10');
    expect(otra.status).toBe(404);
    expect((await admin.delete('/api/admin/metas/xx')).status).toBe(400);
    expect((await admin.get('/api/admin/metas/actual')).body.meta).toBeNull();
  });

  it('lista solo los meses con meta del año, por mes, con lo logrado y si se cumplió', async () => {
    const { context, admin } = await equipo();
    await admin.put('/api/admin/metas/2026-09', { ingresosObjetivo: 100_000, trabajosObjetivo: 2 });
    await admin.put('/api/admin/metas/2026-03', { ingresosObjetivo: 50_000 });
    await admin.put('/api/admin/metas/2025-12', { trabajosObjetivo: 1 });
    await completado(context, '2026-09-10', 70_000);
    await completado(context, '2026-09-30', 40_000);
    await completado(context, '2026-03-31', 10_000);
    await completado(context, '2026-04-01', 99_000); // otro mes
    const r = await admin.get('/api/admin/metas?anio=2026');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body)).toEqual(['metas']);
    expect(r.body.metas).toEqual([
      { mes: '2026-03', ingresosObjetivo: 50_000, trabajosObjetivo: null, ingresos: 10_000, trabajos: 1, cumplida: false },
      { mes: '2026-09', ingresosObjetivo: 100_000, trabajosObjetivo: 2, ingresos: 110_000, trabajos: 2, cumplida: true },
    ]);
    // sin año: el actual; un año sin metas: lista vacía; año inválido: 400
    expect((await admin.get('/api/admin/metas')).body.metas).toHaveLength(2);
    expect((await admin.get('/api/admin/metas?anio=2025')).body.metas).toEqual([
      { mes: '2025-12', ingresosObjetivo: null, trabajosObjetivo: 1, ingresos: 0, trabajos: 0, cumplida: false },
    ]);
    expect((await admin.get('/api/admin/metas?anio=2030')).body.metas).toEqual([]);
    const mal = await admin.get('/api/admin/metas?anio=26');
    expect(mal.status).toBe(400);
    expect(Object.keys(mal.body.error.fields)).toEqual(['anio']);
  });
});

describe('GET /api/admin/metas/actual', () => {
  it('sin meta: estado sin-meta, lo logrado del mes y los días de atención', async () => {
    const { context, admin } = await equipo();
    await completado(context, '2026-10-05', 30_000);
    const r = await admin.get('/api/admin/metas/actual');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['mes', 'meta', 'progreso']);
    expect(r.body.mes).toBe('2026-10');
    expect(r.body.meta).toBeNull();
    expect(Object.keys(r.body.progreso).sort()).toEqual([
      'diasDeAtencionRestantes',
      'diasDeAtencionTotales',
      'diasDeAtencionTranscurridos',
      'estado',
      'ingresos',
      'necesarioPorDia',
      'porcentajeIngresos',
      'porcentajeTrabajos',
      'proyeccionIngresos',
      'trabajos',
    ]);
    expect(r.body.progreso).toMatchObject({
      estado: 'sin-meta',
      ingresos: 30_000,
      trabajos: 1,
      porcentajeIngresos: null,
      porcentajeTrabajos: null,
      proyeccionIngresos: null,
      necesarioPorDia: null,
      diasDeAtencionTotales: 31,
      diasDeAtencionTranscurridos: 16,
      diasDeAtencionRestantes: 15,
    });
  });

  it('adelantado, en ritmo, atrasado y cumplida con una meta de 3.100.000 (esperado a hoy: 1.600.000)', async () => {
    const casos: [number, string][] = [
      [1_800_000, 'adelantado'],
      [1_600_000, 'en-ritmo'],
      [1_000_000, 'atrasado'],
      [3_100_000, 'cumplida'],
    ];
    for (const [ingresos, estado] of casos) {
      const { context, admin } = await equipo();
      await admin.put('/api/admin/metas/2026-10', { ingresosObjetivo: 3_100_000 });
      await completado(context, '2026-10-10', ingresos);
      const r = await admin.get('/api/admin/metas/actual');
      expect(r.body.meta).toEqual({ ingresosObjetivo: 3_100_000, trabajosObjetivo: null });
      expect(r.body.progreso.estado, String(ingresos)).toBe(estado);
      expect(r.body.progreso.porcentajeTrabajos).toBeNull();
      await closeAllContexts();
    }
  });

  it('los ingresos y trabajos son los del mes (por fecha de agenda), sin cancelados ni otros meses', async () => {
    const { context, admin } = await equipo();
    await admin.put('/api/admin/metas/2026-10', { ingresosObjetivo: 100_000, trabajosObjetivo: 3 });
    await completado(context, '2026-10-01', 10_000);
    await completado(context, '2026-10-31', 5_000); // futuro dentro del mes: igual cuenta como del mes
    await completado(context, '2026-11-01', 7_000);
    await completado(context, '2026-09-30', 7_000);
    await completado(context, '2026-10-02', null); // sin monto: cuenta como trabajo, no suma plata
    await context.db.sql.query(
      `INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja, estado)
       VALUES ('X', '12345678', 'auto', 'pulido', '2026-10-03', 'manana', 'cancelado')`,
    );
    const { progreso } = (await admin.get('/api/admin/metas/actual')).body;
    expect(progreso).toMatchObject({ ingresos: 15_000, trabajos: 3, porcentajeIngresos: 0.15, porcentajeTrabajos: 1 });
    expect(progreso.estado).toBe('atrasado');
  });

  it('días de atención con el horario de fábrica: domingos y feriados cerrados no cuentan; un día especial abierto sí', async () => {
    const { context, admin } = await equipo({ disponibilidad: 'fabrica' });
    await context.db.sql.query("DELETE FROM mgdetailing.dias_especiales WHERE fecha BETWEEN '2026-10-01' AND '2026-10-31'");
    await context.db.sql.query(
      `INSERT INTO mgdetailing.dias_especiales (fecha, abierto, cupo_manana, cupo_tarde, motivo) VALUES
         ('2026-10-12', false, null, null, 'Feriado'),
         ('2026-10-18', true, 1, 1, 'Domingo de trabajo')`,
    );
    // octubre 2026: 31 días, domingos 4, 11, 18 y 25. Abierto: 31 - 3 domingos cerrados - el feriado 12 = 27.
    // Hasta el viernes 16: 16 días - domingos 4 y 11 - feriado 12 = 13 transcurridos.
    const r = await admin.get('/api/admin/metas/actual');
    expect(r.body.progreso).toMatchObject({
      diasDeAtencionTotales: 27,
      diasDeAtencionTranscurridos: 13,
      diasDeAtencionRestantes: 14,
    });
    // el domingo 18 abierto cuenta: sin él serían 26
    await context.db.sql.query("DELETE FROM mgdetailing.dias_especiales WHERE fecha = '2026-10-18'");
    expect((await admin.get('/api/admin/metas/actual')).body.progreso.diasDeAtencionTotales).toBe(26);
  });

  it('el mes de la meta es el de La Rioja: el 01/11 a las 00:30 en La Rioja (03:30 UTC) ya es noviembre; antes, octubre', async () => {
    const antes = await equipo({ now: new Date('2026-11-01T02:30:00.000Z') }); // 31/10 23:30 en La Rioja
    expect((await antes.admin.get('/api/admin/metas/actual')).body.mes).toBe('2026-10');
    await closeAllContexts();
    const despues = await equipo({ now: new Date('2026-11-01T03:30:00.000Z') });
    expect((await despues.admin.get('/api/admin/metas/actual')).body.mes).toBe('2026-11');
  });

  it('ventana de la base: la tabla rechaza un mes que no es el día 1 y una meta vacía', async () => {
    const { context } = await equipo();
    await expect(
      context.db.sql.query("INSERT INTO mgdetailing.metas_mensuales (mes, ingresos_objetivo) VALUES ('2026-10-02', 5)"),
    ).rejects.toThrow(/metas_mensuales_mes_dia_uno/);
    await expect(context.db.sql.query("INSERT INTO mgdetailing.metas_mensuales (mes) VALUES ('2026-10-01')")).rejects.toThrow(
      /metas_mensuales_alguna_meta/,
    );
    await expect(
      context.db.sql.query("INSERT INTO mgdetailing.metas_mensuales (mes, trabajos_objetivo) VALUES ('2026-10-01', 10000)"),
    ).rejects.toThrow(/metas_mensuales_trabajos_rango/);
  });
});
