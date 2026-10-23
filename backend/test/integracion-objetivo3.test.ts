import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Booking } from '../src/domain/booking.js';
import { formatResumen, runNormalizarTelefonos } from '../src/scripts/normalizar-telefonos-cli.js';
import { createPgliteDatabase } from './pglite.js';
import { closeAllContexts, createTestContext, loginAs, rawPost, validBooking } from './helpers.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await closeAllContexts();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/**
 * Verificación del objetivo 3 de punta a punta (contrato: reportes/2026-10-23_10_notas-busqueda-historial.md), a
 * nivel API: los turnos entran por POST /api/bookings (como los crea el formulario público), se buscan, se ve el
 * historial y un empleado les agrega una nota. La nota nunca sale por la API pública ni en el aviso.
 */

interface TurnoJson {
  id: string;
  nombre: string;
  telefonoWhatsapp: string | null;
  estado: string;
  notasInternas: string | null;
  turnosDelCliente: number | null;
}

const NOTA = 'NOTA-INTEGRACION: rayón en la puerta trasera.\nCobrado en efectivo.';

describe('objetivo 3 de punta a punta (app de test + PGlite)', () => {
  it('mismo cliente con el teléfono escrito distinto: conteo, historial, búsqueda y nota de un empleado', async () => {
    const avisos: { booking: Booking; servicio: string }[] = [];
    const notifyNewBooking = vi.fn((booking: Booking, servicio: string) => {
      avisos.push({ booking, servicio });
      return Promise.resolve();
    });
    const context = await createTestContext({ notifier: { notifyNewBooking } });
    const { client: admin } = await loginAs(context, 'admin');
    const { client: empleado } = await loginAs(context, 'empleado');

    const crear = async (overrides: Record<string, unknown>) => {
      const response = await rawPost(context.app, '/api/bookings').send(validBooking(overrides));
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      return response.body as { booking: Record<string, unknown> };
    };
    const listar = async (query: string) => {
      const response = await admin.get(`/api/admin/bookings?${query}`);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      return response.body as { bookings: TurnoJson[]; total: number };
    };

    // Dos turnos del mismo cliente, con el teléfono escrito de dos formas, y uno de otro cliente.
    const primero = await crear({ nombre: 'María José Peña', telefono: '0380 15-4123456', email: null });
    const segundo = await crear({ nombre: 'Maria Pena', telefono: '+54 9 380 412-3456', email: null });
    await crear({ nombre: 'Otro Cliente', telefono: '3804999999', email: null, vehiculoModelo: 'Fiat Uno' });
    const idPrimero = String(primero.booking.id);
    const idSegundo = String(segundo.booking.id);

    // turnosDelCliente = 2 en los dos (y 1 en el otro cliente).
    const todos = await listar('estado=pendiente');
    const porId = new Map(todos.bookings.map((b) => [b.id, b]));
    expect(porId.get(idPrimero)).toMatchObject({ telefonoWhatsapp: '5493804123456', turnosDelCliente: 2 });
    expect(porId.get(idSegundo)).toMatchObject({ telefonoWhatsapp: '5493804123456', turnosDelCliente: 2 });
    expect(todos.bookings.find((b) => b.nombre === 'Otro Cliente')?.turnosDelCliente).toBe(1);

    // ?cliente= devuelve los dos, más nuevos primero.
    const historial = await listar('cliente=5493804123456');
    expect(historial.bookings.map((b) => b.id)).toEqual([idSegundo, idPrimero]);
    expect(historial.total).toBe(2);

    // Parte del nombre sin acento encuentra al que tiene acento (la ñ se conserva: "pena" no es "peña").
    expect((await listar(`q=${encodeURIComponent('maria jos')}`)).bookings.map((b) => b.id)).toEqual([idPrimero]);
    expect((await listar(`q=${encodeURIComponent('PEÑA')}`)).bookings.map((b) => b.id)).toEqual([idPrimero]);
    // 4 dígitos del teléfono lo encuentran (los dos turnos del cliente, escritos distinto).
    expect((await listar('q=3456')).bookings.map((b) => b.id)).toEqual([idSegundo, idPrimero]);

    // El admin cancela el primero y un empleado le agrega una nota (se puede aunque esté cancelado).
    expect((await admin.patch(`/api/admin/bookings/${idPrimero}`, { estado: 'cancelado' })).status).toBe(200);
    const conNota = await empleado.patch(`/api/admin/bookings/${idPrimero}`, { notasInternas: `  ${NOTA}\r\n` });
    expect(conNota.status, JSON.stringify(conNota.body)).toBe(200);
    expect(conNota.body.booking).toMatchObject({ estado: 'cancelado', notasInternas: NOTA, turnosDelCliente: 2 });

    // La nota sale en el panel (listado, historial y búsqueda), con sus saltos de línea.
    expect((await listar('estado=cancelado')).bookings[0]?.notasInternas).toBe(NOTA);
    expect((await listar('cliente=5493804123456')).bookings.find((b) => b.id === idPrimero)?.notasInternas).toBe(NOTA);

    // El mismo cliente vuelve a pedir turno: la respuesta pública es la mínima y el aviso no lleva la nota.
    avisos.length = 0;
    const tercero = await crear({ nombre: 'María José Peña', telefono: '380 4123456', email: null });
    expect(Object.keys(tercero.booking).sort()).toEqual(['estado', 'fechaPreferida', 'franja', 'id', 'servicioId']);
    expect(JSON.stringify(tercero)).not.toMatch(/NOTA-INTEGRACION|notasInternas|turnosDelCliente|Cobrado/);
    await vi.waitFor(() => {
      expect(avisos).toHaveLength(1);
    });
    expect(avisos[0]?.booking.notasInternas).toBeNull();
    expect(JSON.stringify(avisos)).not.toMatch(/NOTA-INTEGRACION|Cobrado/);
    // Y ahora el cliente tiene 3 turnos (el nuevo cuenta para los anteriores también).
    const despues = await listar('cliente=5493804123456');
    expect(despues.total).toBe(3);
    expect(new Set(despues.bookings.map((b) => b.turnosDelCliente))).toEqual(new Set([3]));

    // Nada de la nota en el log.
    expect(context.logger.text).not.toContain('NOTA-INTEGRACION');
  });
});

describe('normalizar-telefonos sobre turnos creados por la API con telefono_whatsapp en null', () => {
  it('los completa (idempotente), el resumen es correcto y la salida no tiene datos personales', async () => {
    const context = await createTestContext();
    const { client: admin } = await loginAs(context, 'admin');
    for (const [nombre, telefono] of [
      ['Lucía Viejo', '0380 15-4123456'],
      ['Lucía Otra', '+54 9 380 412-3456'],
      ['Extranjero', '+1 415 555 2671'],
      ['Sin Formato', '1234-5678'],
    ] as const) {
      const response = await rawPost(context.app, '/api/bookings').send(validBooking({ nombre, telefono, email: null }));
      expect(response.status).toBe(201);
    }
    // Como estaban antes de la migración: sin el teléfono normalizado guardado.
    await context.db.sql.query('UPDATE mgdetailing.bookings SET telefono_whatsapp = NULL');
    const antes = (await admin.get('/api/admin/bookings?limit=50')).body as { bookings: TurnoJson[] };
    expect(antes.bookings.map((b) => b.turnosDelCliente)).toEqual([null, null, null, null]);
    expect((await admin.get('/api/admin/bookings?cliente=5493804123456')).body.total).toBe(0);

    const salida: string[] = [];
    expect(await runNormalizarTelefonos(context.db.appSql, (text) => salida.push(text))).toBe(0);
    expect(salida).toEqual([formatResumen({ actualizados: 3, sinTelefono: 1 })]);
    expect(salida).toEqual(['3 turnos actualizados, 1 sin teléfono interpretable']);

    // Segunda pasada: no hay nada que completar.
    expect(await runNormalizarTelefonos(context.db.appSql, (text) => salida.push(text))).toBe(0);
    expect(salida[1]).toBe('0 turnos actualizados, 1 sin teléfono interpretable');

    const texto = salida.join('\n');
    for (const dato of ['Lucía', 'Extranjero', 'Sin Formato', '4123456', '549380', '14155552671', '5678']) {
      expect(texto, dato).not.toContain(dato);
    }

    // Ahora el historial los ve.
    const despues = (await admin.get('/api/admin/bookings?limit=50')).body as { bookings: TurnoJson[] };
    const conteo = Object.fromEntries(despues.bookings.map((b) => [b.nombre, b.turnosDelCliente]));
    expect(conteo).toEqual({ 'Lucía Viejo': 2, 'Lucía Otra': 2, Extranjero: 1, 'Sin Formato': null });
    expect((await admin.get('/api/admin/bookings?cliente=5493804123456')).body.total).toBe(2);
  });
});

describe('migración notas_telefono_cliente: función de búsqueda e índice', () => {
  it('texto_busqueda: IMMUTABLE, search_path vacío, EXECUTE solo para mgdetailing_app', async () => {
    const db = await createPgliteDatabase();
    cleanups.push(db.close);
    const { rows } = await db.pg.query<{ volatil: string; config: string[] | null }>(
      `SELECT p.provolatile AS volatil, p.proconfig AS config
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'mgdetailing' AND p.proname = 'texto_busqueda'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.volatil).toBe('i');
    expect(rows[0]?.config).toEqual(['search_path=""']);
    for (const rol of ['anon', 'authenticated', 'service_role', 'public', 'mgdetailing_app']) {
      const permiso = await db.pg.query<{ ok: boolean }>(
        "SELECT has_function_privilege($1, 'mgdetailing.texto_busqueda(text)', 'EXECUTE') AS ok",
        [rol],
      );
      expect(permiso.rows[0]?.ok, rol).toBe(rol === 'mgdetailing_app');
    }
  });

  it('texto_busqueda: todas las vocales acentuadas y la ü, en mayúscula y minúscula; la ñ se conserva', async () => {
    const db = await createPgliteDatabase();
    cleanups.push(db.close);
    const casos: Record<string, string> = {
      'ÁÀÂÄÃ áàâäã': 'aaaaa aaaaa',
      'ÉÈÊË éèêë': 'eeee eeee',
      'ÍÌÎÏ íìîï': 'iiii iiii',
      'ÓÒÔÖÕ óòôöõ': 'ooooo ooooo',
      'ÚÙÛÜ úùûü': 'uuuu uuuu',
      'Ç ç Ñ ñ': 'c c ñ ñ',
      'GÜEMES Pingüino': 'guemes pinguino',
      '100% _x\\y': '100% _x\\y',
      '🚗 Peña': '🚗 peña',
    };
    for (const [entrada, salida] of Object.entries(casos)) {
      const { rows } = await db.pg.query<{ t: string }>('SELECT mgdetailing.texto_busqueda($1) AS t', [entrada]);
      expect(rows[0]?.t, entrada).toBe(salida);
    }
    const nulo = await db.pg.query<{ t: string | null }>('SELECT mgdetailing.texto_busqueda(NULL) AS t');
    expect(nulo.rows[0]?.t).toBeNull();
  });

  it('el índice parcial lo usan la subconsulta de turnosDelCliente y el filtro ?cliente= (como los escribe el repositorio)', async () => {
    const db = await createPgliteDatabase();
    cleanups.push(db.close);
    await db.pg.exec(`INSERT INTO mgdetailing.bookings (nombre, telefono, telefono_whatsapp, vehiculo_tipo, servicio_id, fecha_preferida, franja)
                      SELECT 'N' || g, '3804' || lpad(g::text, 6, '0'), CASE WHEN g % 10 = 0 THEN NULL ELSE '549380' || lpad(g::text, 7, '0') END,
                             'auto', 'pulido', '2026-10-20', 'manana'
                      FROM generate_series(1, 2000) AS g`);
    await db.pg.exec('ANALYZE mgdetailing.bookings');
    const texto = (filas: { 'QUERY PLAN': string }[]) => filas.map((r) => r['QUERY PLAN']).join('\n');

    // Subconsulta correlacionada de turnosDelCliente (con el CASE, igual que en el SELECT del repositorio).
    const conteo = await db.pg.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT CASE WHEN b.telefono_whatsapp IS NULL THEN NULL
                       ELSE (SELECT count(*)::int FROM mgdetailing.bookings c WHERE c.telefono_whatsapp = b.telefono_whatsapp)
                  END
       FROM mgdetailing.bookings b ORDER BY b.seq DESC LIMIT 20`,
    );
    expect(texto(conteo.rows)).toContain('bookings_telefono_whatsapp_idx');

    // ?cliente=: el parámetro llega con valor (node-postgres manda consultas sin nombre: plan a medida).
    const cliente = await db.pg.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT b.id FROM mgdetailing.bookings b
       WHERE (NULL::text IS NULL OR b.estado = NULL::text)
         AND ('5493800000123'::text IS NULL OR b.telefono_whatsapp = '5493800000123'::text)
       ORDER BY b.seq DESC LIMIT 20`,
    );
    expect(texto(cliente.rows)).toContain('bookings_telefono_whatsapp_idx');
  });
});

describe('nota interna: higiene del texto como en el resto de los campos libres', () => {
  it('los controles bidireccionales se quitan (como en el comentario); solo eso => null', async () => {
    const context = await createTestContext();
    const { client: admin } = await loginAs(context, 'admin');
    const creado = await rawPost(context.app, '/api/bookings').send(validBooking());
    const id = String(creado.body.booking.id);

    const conBidi = await admin.patch(`/api/admin/bookings/${id}`, { notasInternas: 'cobrado \u202Eodarboc\u202C\nok\u200F' });
    expect(conBidi.status, JSON.stringify(conBidi.body)).toBe(200);
    expect(conBidi.body.booking.notasInternas).toBe('cobrado odarboc\nok');

    const soloBidi = await admin.patch(`/api/admin/bookings/${id}`, { notasInternas: ' \u2066\u2069 ' });
    expect(soloBidi.body.booking.notasInternas).toBeNull();
  });
});
