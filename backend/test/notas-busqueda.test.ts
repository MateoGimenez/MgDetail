import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Estado, NewBooking } from '../src/domain/booking.js';
import { PostgresBookingRepository, escapeLike } from '../src/repositories/postgres/bookings.js';
import {
  type Client,
  type TestContext,
  NOW,
  closeAllContexts,
  createClient,
  createTestContext,
  loginAs,
  rawPost,
  validBooking,
} from './helpers.js';

afterEach(closeAllContexts);

/**
 * Objetivo 3 (contrato: reportes/2026-10-23_10_notas-busqueda-historial.md): notas internas, búsqueda e historial
 * del cliente en GET/PATCH /api/admin/bookings y en la agenda.
 */

/** Los campos de un Turno según el contrato: ni uno más, ni uno menos. */
const CAMPOS_TURNO = [
  'comentario',
  'createdAt',
  'email',
  'estado',
  'fechaConfirmada',
  'fechaPreferida',
  'franja',
  'franjaConfirmada',
  'id',
  'nombre',
  'notasInternas',
  'servicioId',
  'telefono',
  'telefonoWhatsapp',
  'turnosDelCliente',
  'updatedAt',
  'vehiculoModelo',
  'vehiculoTipo',
];

interface TurnoJson {
  id: string;
  nombre: string;
  telefonoWhatsapp: string | null;
  estado: Estado;
  notasInternas: string | null;
  turnosDelCliente: number | null;
}

interface Ctx {
  context: TestContext;
  admin: Client;
  repo: PostgresBookingRepository;
  /** Crea un turno directo en la base (como lo haría POST /api/bookings), en orden de llegada. */
  turno: (overrides?: Partial<NewBooking> & { estado?: Estado }) => Promise<string>;
  /** GET /api/admin/bookings con esa query; espera 200. */
  listar: (query?: string, client?: Client) => Promise<{ bookings: TurnoJson[]; total: number }>;
}

async function setup(): Promise<Ctx> {
  const context = await createTestContext();
  const { client: admin } = await loginAs(context, 'admin');
  const repo = new PostgresBookingRepository(context.db.sql);
  const turno = async ({ estado, ...overrides }: Partial<NewBooking> & { estado?: Estado } = {}) => {
    const data: NewBooking = {
      nombre: 'Cliente',
      telefono: '3804123456',
      email: null,
      vehiculoTipo: 'auto',
      vehiculoModelo: null,
      servicioId: 'pulido',
      fechaPreferida: '2026-10-20',
      franja: 'manana',
      comentario: null,
      ...overrides,
    };
    const { id } = await repo.create(data, NOW);
    if (estado !== undefined) await repo.updateEstado(id, estado, NOW);
    return id;
  };
  const listar = async (query = '', client: Client = admin) => {
    const response = await client.get(`/api/admin/bookings${query === '' ? '' : `?${query}`}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body as { bookings: TurnoJson[]; total: number };
  };
  return { context, admin, repo, turno, listar };
}

const q = (text: string): string => `q=${encodeURIComponent(text)}`;
const nombres = (result: { bookings: TurnoJson[] }): string[] => result.bookings.map((b) => b.nombre);

describe('GET /api/admin/bookings?q= (búsqueda)', () => {
  it('por nombre: parcial, sin importar mayúsculas ni acentos', async () => {
    const { turno, listar } = await setup();
    await turno({ nombre: 'María Gómez' });
    await turno({ nombre: 'JOSÉ ÁLVAREZ' });
    await turno({ nombre: 'Pedro Peña' });

    expect(nombres(await listar(q('maría')))).toEqual(['María Gómez']);
    expect(nombres(await listar(q('MARIA')))).toEqual(['María Gómez']);
    expect(nombres(await listar(q('gomez')))).toEqual(['María Gómez']);
    expect(nombres(await listar(q('José álv')))).toEqual(['JOSÉ ÁLVAREZ']);
    expect(nombres(await listar(q('jose alvarez')))).toEqual(['JOSÉ ÁLVAREZ']);
    expect(nombres(await listar(q('PEÑA')))).toEqual(['Pedro Peña']);
    expect(nombres(await listar(q('  pedro  ')))).toEqual(['Pedro Peña']); // trim
    expect(await listar(q('Rodríguez'))).toEqual({ bookings: [], total: 0 });
  });

  it('por email y por modelo de vehículo', async () => {
    const { turno, listar } = await setup();
    await turno({ nombre: 'Con mail', email: 'Ana.Perez@Ejemplo.com' });
    await turno({ nombre: 'Con modelo', vehiculoModelo: 'Toyota Corolla 2020' });
    await turno({ nombre: 'Sin nada' });

    expect(nombres(await listar(q('ana.perez@ejemplo')))).toEqual(['Con mail']);
    expect(nombres(await listar(q('EJEMPLO.COM')))).toEqual(['Con mail']);
    expect(nombres(await listar(q('corolla')))).toEqual(['Con modelo']);
    expect(nombres(await listar(q('TOYOTA COR')))).toEqual(['Con modelo']);
  });

  it('por dígitos del teléfono, escritos en cualquier formato (desde 4 dígitos)', async () => {
    const { turno, listar } = await setup();
    await turno({ nombre: 'Celular', telefono: '0380 15-4123456' });
    await turno({ nombre: 'Otro', telefono: '+54 9 11 5555-1234' });
    await turno({ nombre: 'Raro', telefono: '1234-5678' }); // sin telefonoWhatsapp: se busca por lo escrito

    // Los dígitos de lo que escribió el cliente.
    expect(nombres(await listar(q('4123456')))).toEqual(['Celular']);
    expect(nombres(await listar(q('412-3456')))).toEqual(['Celular']);
    expect(nombres(await listar(q('0380 15')))).toEqual(['Celular']);
    // Los dígitos del normalizado (5493804123456), aunque el cliente lo haya escrito con 0 y 15.
    expect(nombres(await listar(q('+54 9 380 412 3456')))).toEqual(['Celular']);
    expect(nombres(await listar(q('(380) 412')))).toEqual(['Celular']);
    expect(nombres(await listar(q('5555-1234')))).toEqual(['Otro']);
    expect(nombres(await listar(q('1234-5678')))).toEqual(['Raro']);
    // Menos de 4 dígitos: no se busca por teléfono (si no, "38" encontraría a casi todos).
    expect(await listar(q('380'))).toEqual({ bookings: [], total: 0 });
  });

  it('los comodines %, _ y \\ se buscan como texto', async () => {
    const { turno, listar } = await setup();
    await turno({ nombre: '100% Detailing' });
    await turno({ nombre: '1000 Detailing' });
    await turno({ nombre: 'Gol_GTI' });
    await turno({ nombre: 'GolXGTI' });
    await turno({ nombre: 'Barra\\Invertida' });
    await turno({ nombre: 'BarraInvertida' });

    expect(nombres(await listar(q('0% D')))).toEqual(['100% Detailing']);
    expect(await listar(q('%%'))).toEqual({ bookings: [], total: 0 }); // sin escapar, encontraría todo
    expect(await listar(q('%_%'))).toEqual({ bookings: [], total: 0 });
    expect(nombres(await listar(q('l_G')))).toEqual(['Gol_GTI']);
    expect(await listar(q('__'))).toEqual({ bookings: [], total: 0 });
    expect(nombres(await listar(q('a\\I')))).toEqual(['Barra\\Invertida']);
    expect(nombres(await listar(q('\\%')))).toEqual([]);
    expect(nombres(await listar(q("O'Brien")))).toEqual([]); // comillas: van como parámetro
  });

  it('escapeLike escapa \\, % y _ (y nada más)', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    expect(escapeLike('normal áé')).toBe('normal áé');
  });

  it('q: 2 a 80 caracteres después del trim (si no, 400 con fields.q); vacío = sin filtro', async () => {
    const { admin, turno, listar } = await setup();
    await turno({ nombre: 'Cliente' });

    for (const query of [q('a'), q(' a '), q('x'.repeat(81)), 'q=a&q=b']) {
      const response = await admin.get(`/api/admin/bookings?${query}`);
      expect(response.status, query).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(response.body.error.fields as object), query).toEqual(['q']);
    }
    expect((await listar(q('x'.repeat(80)))).total).toBe(0);
    expect((await listar(q('ab'))).total).toBe(0);
    expect((await listar('q=')).total).toBe(1);
    expect((await listar(q('   '))).total).toBe(1);
    // 2 caracteres "visibles" aunque uno sea un emoji (cuenta como 1, como char_length).
    expect((await listar(q('🚗a'))).total).toBe(0);
  });

  it('se combina con estado y paginación; total cuenta lo filtrado; más nuevos primero', async () => {
    const { turno, listar } = await setup();
    await turno({ nombre: 'Juan Uno', estado: 'confirmado' });
    await turno({ nombre: 'Juan Dos' });
    await turno({ nombre: 'Juan Tres', estado: 'confirmado' });
    await turno({ nombre: 'Pedro', estado: 'confirmado' });

    expect(await listar(q('juan')).then(nombres)).toEqual(['Juan Tres', 'Juan Dos', 'Juan Uno']);
    const confirmados = await listar(`${q('juan')}&estado=confirmado`);
    expect(nombres(confirmados)).toEqual(['Juan Tres', 'Juan Uno']);
    expect(confirmados.total).toBe(2);
    const pagina = await listar(`${q('juan')}&limit=1&offset=1`);
    expect(nombres(pagina)).toEqual(['Juan Dos']);
    expect(pagina.total).toBe(3);
  });

  it('la pueden usar todos los roles; sin sesión 401', async () => {
    const { context, turno, listar } = await setup();
    await turno({ nombre: 'Buscado' });
    for (const rol of ['superadmin', 'empleado'] as const) {
      const { client } = await loginAs(context, rol);
      expect(nombres(await listar(q('buscado'), client)), rol).toEqual(['Buscado']);
    }
    const anonimo = await createClient(context.app).get('/api/admin/bookings?q=buscado');
    expect(anonimo.status).toBe(401);
  });
});

describe('historial del cliente: ?cliente= y turnosDelCliente', () => {
  it('teléfonos escritos distinto que normalizan igual son el mismo cliente', async () => {
    const { turno, listar } = await setup();
    await turno({ nombre: 'A', telefono: '0380 15-4123456', estado: 'completado' });
    await turno({ nombre: 'B', telefono: '+54 9 380 412-3456', estado: 'cancelado' });
    await turno({ nombre: 'Otro cliente', telefono: '3804999999' });
    await turno({ nombre: 'C', telefono: '380 4123456' });
    await turno({ nombre: 'Sin teléfono válido', telefono: '1234-5678' });

    const todos = await listar();
    const porNombre = new Map(todos.bookings.map((b) => [b.nombre, b]));
    // Cuenta todos los estados, incluido el propio turno.
    expect(porNombre.get('A')).toMatchObject({ telefonoWhatsapp: '5493804123456', turnosDelCliente: 3 });
    expect(porNombre.get('B')).toMatchObject({ telefonoWhatsapp: '5493804123456', turnosDelCliente: 3 });
    expect(porNombre.get('C')).toMatchObject({ telefonoWhatsapp: '5493804123456', turnosDelCliente: 3 });
    expect(porNombre.get('Otro cliente')).toMatchObject({ telefonoWhatsapp: '5493804999999', turnosDelCliente: 1 });
    expect(porNombre.get('Sin teléfono válido')).toMatchObject({ telefonoWhatsapp: null, turnosDelCliente: null });

    const historial = await listar('cliente=5493804123456');
    expect(nombres(historial)).toEqual(['C', 'B', 'A']);
    expect(historial.total).toBe(3);
    expect(nombres(await listar('cliente=5493804123456&estado=cancelado'))).toEqual(['B']);
    expect(nombres(await listar('cliente=5493804123456&limit=1'))).toEqual(['C']);
    expect(await listar('cliente=5491100000000')).toEqual({ bookings: [], total: 0 });
  });

  it('cliente inválido => 400 con fields.cliente; vacío = sin filtro', async () => {
    const { admin, turno, listar } = await setup();
    await turno();
    for (const cliente of ['abc', '1234567', '1234567890123456', '+5493804123456', '549 380', '%25', 'cliente=1&cliente=2']) {
      const query = cliente.startsWith('cliente=') ? cliente : `cliente=${encodeURIComponent(cliente)}`;
      const response = await admin.get(`/api/admin/bookings?${query}`);
      expect(response.status, cliente).toBe(400);
      expect(Object.keys(response.body.error.fields as object), cliente).toEqual(['cliente']);
    }
    expect((await listar('cliente=')).total).toBe(1);
  });

  it('el primer turno da 1, y turnosDelCliente sale también en POST interno, PATCH y agenda', async () => {
    const { admin, repo, turno } = await setup();
    const primero = await repo.create(
      { ...(validBooking() as unknown as NewBooking), telefono: '3804111111', comentario: null },
      NOW,
    );
    expect(primero.turnosDelCliente).toBe(1); // el INSERT cuenta la fila nueva
    const id = await turno({ telefono: '0380 15 4111111', fechaPreferida: '2026-10-21' });

    const patched = await admin.patch(`/api/admin/bookings/${id}`, { notasInternas: 'hola' });
    expect(patched.body.booking.turnosDelCliente).toBe(2);
    const agenda = await admin.get('/api/admin/agenda?desde=2026-10-19&hasta=2026-10-25');
    expect((agenda.body.turnos as TurnoJson[]).map((t) => t.turnosDelCliente)).toEqual([2, 2]);
  });

  it('un turno viejo sin normalizar: telefonoWhatsapp se calcula al leer, turnosDelCliente null hasta normalizar', async () => {
    const { context, turno, listar } = await setup();
    await turno({ nombre: 'Nuevo', telefono: '3804123456' });
    await context.db.sql.query(
      `INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja)
       VALUES ('Viejo', '0380 15-4123456', 'auto', 'pulido', '2026-10-01', 'tarde')`,
    );
    const antes = new Map((await listar()).bookings.map((b) => [b.nombre, b]));
    expect(antes.get('Viejo')).toMatchObject({ telefonoWhatsapp: '5493804123456', turnosDelCliente: null });
    expect(antes.get('Nuevo')).toMatchObject({ turnosDelCliente: 1 });
    expect(nombres(await listar('cliente=5493804123456'))).toEqual(['Nuevo']);
  });
});

describe('PATCH /api/admin/bookings/:id { notasInternas }', () => {
  it('guarda la nota con saltos de línea y tabulaciones; la devuelve en PATCH, listado y agenda', async () => {
    const { admin, turno, listar } = await setup();
    const id = await turno();
    const nota = 'Rayón en la puerta trasera.\nPidió que lo llamen antes.\tCobrado.';

    const response = await admin.patch(`/api/admin/bookings/${id}`, { notasInternas: nota });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(Object.keys(response.body as object)).toEqual(['booking']);
    expect(Object.keys(response.body.booking as object).sort()).toEqual(CAMPOS_TURNO);
    expect(response.body.booking).toMatchObject({ id, notasInternas: nota, estado: 'pendiente' });

    const lista = await listar();
    expect(Object.keys(lista.bookings[0] ?? {}).sort()).toEqual(CAMPOS_TURNO);
    expect(lista.bookings[0]?.notasInternas).toBe(nota);
    const agenda = await admin.get('/api/admin/agenda?desde=2026-10-19&hasta=2026-10-25');
    expect(Object.keys(agenda.body.turnos[0] as object).sort()).toEqual(CAMPOS_TURNO);
    expect(agenda.body.turnos[0].notasInternas).toBe(nota);
  });

  it('vacía, solo espacios o null => null; se recortan los extremos; \\r\\n cuenta como salto de línea', async () => {
    const { admin, turno } = await setup();
    const id = await turno();
    const patch = (notasInternas: unknown) => admin.patch(`/api/admin/bookings/${id}`, { notasInternas });

    for (const vacia of ['', '   ', '\n\t \n', null]) {
      await patch('algo');
      const response = await patch(vacia);
      expect(response.status, JSON.stringify(vacia)).toBe(200);
      expect(response.body.booking.notasInternas, JSON.stringify(vacia)).toBeNull();
    }
    expect((await patch('  con espacios  ')).body.booking.notasInternas).toBe('con espacios');
    expect((await patch('línea 1\r\nlínea 2')).body.booking.notasInternas).toBe('línea 1\nlínea 2');
  });

  it('hasta 1000 caracteres (contados como char_length: un emoji es 1); 1001 => 400', async () => {
    const { admin, turno } = await setup();
    const id = await turno();
    const patch = (notasInternas: unknown) => admin.patch(`/api/admin/bookings/${id}`, { notasInternas });

    expect((await patch('x'.repeat(1000))).status).toBe(200);
    expect((await patch('🚗'.repeat(1000))).status).toBe(200);
    for (const invalida of ['x'.repeat(1001), 5, true, ['nota'], { texto: 'nota' }]) {
      const response = await patch(invalida);
      expect(response.status, JSON.stringify(invalida).slice(0, 30)).toBe(400);
      expect(Object.keys(response.body.error.fields as object)).toEqual(['notasInternas']);
    }
  });

  it('rechaza caracteres de control (salvo salto de línea y tabulación) sin guardar nada', async () => {
    const { admin, turno, listar } = await setup();
    const id = await turno();
    await admin.patch(`/api/admin/bookings/${id}`, { notasInternas: 'original' });

    for (const control of ['\u0000', '\u0007', '\b', '\u000B', '\f', '\r', 'a\u001Bb', '\u007F', '\u0085', '\u009F']) {
      const response = await admin.patch(`/api/admin/bookings/${id}`, { notasInternas: `nota ${control} mala` });
      expect(response.status, JSON.stringify(control)).toBe(400);
      expect(response.body.error.fields.notasInternas).toMatch(/caracteres de control/);
    }
    expect((await listar()).bookings[0]?.notasInternas).toBe('original');
  });

  it('el empleado puede escribirla, también en turnos cancelados o completados', async () => {
    const { context, turno } = await setup();
    const { client: empleado } = await loginAs(context, 'empleado');
    for (const estado of ['pendiente', 'confirmado', 'cancelado', 'completado'] as const) {
      const id = await turno({ estado });
      const response = await empleado.patch(`/api/admin/bookings/${id}`, { notasInternas: `nota ${estado}` });
      expect(response.status, estado).toBe(200);
      expect(response.body.booking).toMatchObject({ estado, notasInternas: `nota ${estado}` });
    }
  });

  it('junto con el estado: una sola escritura; si el estado no está permitido, tampoco se guarda la nota', async () => {
    const { context, admin, turno, listar } = await setup();
    const { client: empleado } = await loginAs(context, 'empleado');
    const id = await turno();

    const prohibido = await empleado.patch(`/api/admin/bookings/${id}`, { estado: 'confirmado', notasInternas: 'no' });
    expect(prohibido.status).toBe(403);
    expect((await listar()).bookings[0]?.notasInternas).toBeNull();

    const completado = await empleado.patch(`/api/admin/bookings/${id}`, { estado: 'completado', notasInternas: 'listo' });
    expect(completado.status).toBe(200);
    expect(completado.body.booking).toMatchObject({ estado: 'completado', notasInternas: 'listo' });

    const reabierto = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'pendiente', notasInternas: null });
    expect(reabierto.body.booking).toMatchObject({ estado: 'pendiente', notasInternas: null });

    // Solo el estado: la nota no se toca.
    await admin.patch(`/api/admin/bookings/${id}`, { notasInternas: 'queda' });
    const soloEstado = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'confirmado' });
    expect(soloEstado.body.booking).toMatchObject({ estado: 'confirmado', notasInternas: 'queda' });
  });

  it('junto con la fecha confirmada: se guardan juntas; en un turno cerrado => 400 y no se guarda la nota', async () => {
    const { admin, turno, listar } = await setup();
    const abierto = await turno({ nombre: 'Abierto' });
    const cerrado = await turno({ nombre: 'Cerrado', estado: 'completado' });

    const movido = await admin.patch(`/api/admin/bookings/${abierto}`, {
      fechaConfirmada: '2026-10-25',
      franjaConfirmada: 'tarde',
      notasInternas: 'lo trae el hijo',
    });
    expect(movido.status, JSON.stringify(movido.body)).toBe(200);
    expect(movido.body.booking).toMatchObject({ fechaConfirmada: '2026-10-25', notasInternas: 'lo trae el hijo' });
    // Reprogramar sin nota no la borra.
    const vuelta = await admin.patch(`/api/admin/bookings/${abierto}`, { fechaConfirmada: null, franjaConfirmada: null });
    expect(vuelta.body.booking).toMatchObject({ fechaConfirmada: null, notasInternas: 'lo trae el hijo' });

    const rechazado = await admin.patch(`/api/admin/bookings/${cerrado}`, {
      fechaConfirmada: '2026-10-25',
      franjaConfirmada: 'tarde',
      notasInternas: 'no se guarda',
    });
    expect(rechazado.status).toBe(400);
    const lista = await listar();
    expect(lista.bookings.find((b) => b.nombre === 'Cerrado')?.notasInternas).toBeNull();
  });

  it('turno inexistente => 404; body vacío sigue siendo 400; campo extra => 400', async () => {
    const { admin, turno } = await setup();
    const id = await turno();
    expect((await admin.patch(`/api/admin/bookings/${randomUUID()}`, { notasInternas: 'x' })).status).toBe(404);
    expect((await admin.patch('/api/admin/bookings/no-es-uuid', { notasInternas: 'x' })).status).toBe(404);
    const vacio = await admin.patch(`/api/admin/bookings/${id}`, {});
    expect(vacio.status).toBe(400);
    expect(Object.keys(vacio.body.error.fields as object)).toEqual(['estado']);
    const extra = await admin.patch(`/api/admin/bookings/${id}`, { notasInternas: 'x', notas: 'y' });
    expect(Object.keys(extra.body.error.fields as object)).toEqual(['notas']);
  });

  it('la nota no se escribe en el log', async () => {
    const { context, admin, turno } = await setup();
    const id = await turno();
    await admin.patch(`/api/admin/bookings/${id}`, { notasInternas: 'NOTA-SECRETA-LOG' });
    await admin.patch(`/api/admin/bookings/${id}`, {
      fechaConfirmada: '2026-10-25',
      franjaConfirmada: 'tarde',
      notasInternas: 'NOTA-SECRETA-LOG-2',
    });
    expect(context.logger.text).not.toContain('NOTA-SECRETA');
  });
});

describe('API pública', () => {
  it('POST /api/bookings no acepta notasInternas y nunca devuelve la nota ni el historial', async () => {
    const { context, listar } = await setup();
    const conNota = await rawPost(context.app, '/api/bookings').send(validBooking({ notasInternas: 'colada' }));
    expect(conNota.status).toBe(400);
    expect(Object.keys(conNota.body.error.fields as object)).toEqual(['notasInternas']);
    expect((await listar()).total).toBe(0);

    // Un cliente que ya vino (y tiene nota) vuelve a pedir turno: la respuesta pública sigue siendo la mínima.
    const primero = await rawPost(context.app, '/api/bookings').send(validBooking());
    const { client: admin } = await loginAs(context, 'superadmin');
    await admin.patch(`/api/admin/bookings/${String(primero.body.booking.id)}`, { notasInternas: 'NOTA-PRIVADA' });
    const segundo = await rawPost(context.app, '/api/bookings').send(validBooking());
    expect(segundo.status).toBe(201);
    expect(Object.keys(segundo.body.booking as object).sort()).toEqual([
      'estado',
      'fechaPreferida',
      'franja',
      'id',
      'servicioId',
    ]);
    expect(JSON.stringify(segundo.body)).not.toMatch(/NOTA-PRIVADA|notasInternas|turnosDelCliente/);
  });
});
