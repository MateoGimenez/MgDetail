import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectorDeHistorial } from '../admin/foco';
import { puedeCambiarEstado, puedeEditarNotas } from '../admin/permisos';
import { consultaDe, interpretarBusqueda } from '../lib/busqueda';
import { validarNota } from '../lib/notas';
import { conLoMasNuevo, selloDeCliente } from '../lib/turnos';
import { actualizarTurno, listarTurnos } from './admin';
import { ApiError } from './client';
import { MENSAJE_BUSQUEDA, NOTA_MAXIMO } from './contract';

/* Contrato: reportes/2026-10-23_10_notas-busqueda-historial.md */

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

const turno = {
  id: 'a1',
  nombre: 'Lucía',
  telefono: '380 412-3456',
  telefonoWhatsapp: '5493804123456',
  email: null,
  vehiculoTipo: 'auto',
  vehiculoModelo: 'Gol Trend',
  servicioId: 'pulido',
  fechaPreferida: '2026-10-22',
  franja: 'manana',
  fechaConfirmada: null,
  franjaConfirmada: null,
  comentario: null,
  estado: 'confirmado',
  createdAt: '2026-10-16T15:00:00.000Z',
  updatedAt: '2026-10-22T15:00:00.000Z',
  notasInternas: 'Rayón en la puerta trasera.\nPidió que lo llamen antes.',
  turnosDelCliente: 3,
};

function simular(respuesta: () => Response) {
  const llamadas: { metodo: string; ruta: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      llamadas.push({
        metodo: init?.method ?? 'GET',
        ruta: typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      return Promise.resolve(respuesta());
    }),
  );
  return llamadas;
}

const fallo = async (promesa: Promise<unknown>) => (await promesa.catch((e: unknown) => e)) as ApiError;
const pagina = { limit: 20, offset: 0 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Turno con nota y cantidad de turnos del cliente (validación estricta)', () => {
  it('acepta la nota con saltos de línea y el conteo', async () => {
    simular(() => json(200, { bookings: [turno], total: 1 }));
    expect(await listarTurnos(pagina)).toEqual({ turnos: [turno], total: 1 });
  });

  it('sin los campos nuevos se rechaza', async () => {
    const sin = (campo: string) => Object.fromEntries(Object.entries(turno).filter(([clave]) => clave !== campo));
    const sinNota = sin('notasInternas');
    const sinConteo = sin('turnosDelCliente');
    for (const viejo of [sinNota, sinConteo]) {
      simular(() => json(200, { bookings: [viejo], total: 1 }));
      expect((await fallo(listarTurnos(pagina))).code).toBe('INVALID_RESPONSE');
    }
  });

  it('turnosDelCliente: entero ≥ 1; sin telefonoWhatsapp, siempre null', async () => {
    const malos = [
      { ...turno, turnosDelCliente: 0 },
      { ...turno, turnosDelCliente: 1.5 },
      { ...turno, turnosDelCliente: '3' },
      { ...turno, telefonoWhatsapp: null },
      { ...turno, notasInternas: 7 },
    ];
    for (const malo of malos) {
      simular(() => json(200, { booking: malo }));
      expect((await fallo(actualizarTurno('a1', { estado: 'completado' }))).code).toBe('INVALID_RESPONSE');
    }
    simular(() => json(200, { booking: { ...turno, telefonoWhatsapp: null, turnosDelCliente: null, notasInternas: null } }));
    expect((await actualizarTurno('a1', { notasInternas: null })).turnosDelCliente).toBeNull();
    // Turno viejo todavía sin normalizar: tiene teléfono pero no se contó.
    simular(() => json(200, { booking: { ...turno, turnosDelCliente: null } }));
    expect((await actualizarTurno('a1', { estado: 'completado' })).turnosDelCliente).toBeNull();
  });
});

describe('GET /api/admin/bookings con q y cliente', () => {
  it('manda q recortado junto con estado y la página', async () => {
    const llamadas = simular(() => json(200, { bookings: [], total: 0 }));
    await listarTurnos({ estado: 'pendiente', q: '  juan pérez ', limit: 20, offset: 40 });
    const url = new URL(llamadas[0]?.ruta ?? '', 'http://x');
    expect(url.pathname).toBe('/api/admin/bookings');
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '20', offset: '40', estado: 'pendiente', q: 'juan pérez' });
  });

  it('los comodines y símbolos viajan codificados, tal cual', async () => {
    const llamadas = simular(() => json(200, { bookings: [], total: 0 }));
    await listarTurnos({ q: '50% & _a+b', ...pagina });
    expect(new URL(llamadas[0]?.ruta ?? '', 'http://x').searchParams.get('q')).toBe('50% & _a+b');
    expect(llamadas[0]?.ruta).toContain('q=50%25+%26+_a%2Bb');
  });

  it('historial: cliente exacto, sin estado', async () => {
    const llamadas = simular(() => json(200, { bookings: [turno], total: 25 }));
    expect((await listarTurnos({ cliente: '5493804123456', limit: 20, offset: 20 })).total).toBe(25);
    expect(llamadas[0]?.ruta).toBe('/api/admin/bookings?limit=20&offset=20&cliente=5493804123456');
  });

  it('un q fuera de 2..80 o un cliente mal formado no llegan al backend', async () => {
    const llamadas = simular(() => json(200, { bookings: [], total: 0 }));
    for (const q of ['', ' a ', 'x'.repeat(81)]) {
      const error = await fallo(listarTurnos({ q, ...pagina }));
      expect(error.status).toBe(400);
      expect(error.fields?.q).toBe(MENSAJE_BUSQUEDA);
    }
    for (const cliente of ['1234567', '1234567890123456', '+5493804123456', '380 412 3456']) {
      expect((await fallo(listarTurnos({ cliente, ...pagina }))).fields?.cliente).toBeDefined();
    }
    expect(llamadas).toHaveLength(0);
    await listarTurnos({ q: 'ab', ...pagina });
    await listarTurnos({ q: 'x'.repeat(80), ...pagina });
    expect(llamadas).toHaveLength(2);
  });

  it('un 400 del backend trae fields.q', async () => {
    simular(() => json(400, { error: { code: 'VALIDATION_ERROR', message: 'Revisá la búsqueda.', fields: { q: 'Muy corta.' } } }));
    expect((await fallo(listarTurnos({ q: 'ab', ...pagina }))).fields).toEqual({ q: 'Muy corta.' });
  });
});

describe('PATCH /api/admin/bookings/:id con notasInternas', () => {
  it('sola, borrada (null) o junto con el estado y la fecha', async () => {
    const llamadas = simular(() => json(200, { booking: turno }));
    await actualizarTurno('a1', { notasInternas: 'Cobrado.' });
    await actualizarTurno('a1', { notasInternas: null });
    await actualizarTurno('a1', { estado: 'completado', notasInternas: 'Listo.' });
    await actualizarTurno('a1', { fechaConfirmada: '2026-10-30', franjaConfirmada: 'tarde', notasInternas: 'Movido.' });
    expect(llamadas.map((l) => [l.metodo, l.body])).toEqual([
      ['PATCH', { notasInternas: 'Cobrado.' }],
      ['PATCH', { notasInternas: null }],
      ['PATCH', { estado: 'completado', notasInternas: 'Listo.' }],
      ['PATCH', { fechaConfirmada: '2026-10-30', franjaConfirmada: 'tarde', notasInternas: 'Movido.' }],
    ]);
  });

  it('un 400 vuelve con fields.notasInternas', async () => {
    simular(() =>
      json(400, { error: { code: 'VALIDATION_ERROR', message: 'Revisá la nota.', fields: { notasInternas: 'Muy larga.' } } }),
    );
    expect((await fallo(actualizarTurno('a1', { notasInternas: 'x' }))).fields?.notasInternas).toBe('Muy larga.');
  });
});

describe('reglas del panel', () => {
  it('búsqueda: vacía, corta (sin pedir), lista (recortada) y larga', () => {
    expect(interpretarBusqueda('   ')).toEqual({ tipo: 'vacia' });
    expect(interpretarBusqueda(' j ')).toEqual({ tipo: 'corta' });
    expect(interpretarBusqueda(' ju ')).toEqual({ tipo: 'lista', q: 'ju' });
    expect(interpretarBusqueda('x'.repeat(81))).toEqual({ tipo: 'larga' });
    expect(consultaDe(interpretarBusqueda('j'))).toBeUndefined();
    expect(consultaDe(interpretarBusqueda(' 0380 15 '))).toBe('0380 15');
  });

  it('nota: recorta, vacía → null, hasta 1000, con saltos y tabulaciones pero sin otros controles', () => {
    expect(validarNota('  \n ')).toEqual({ valor: null });
    expect(validarNota('  Cobrado.\n\tSeña $5000  ')).toEqual({ valor: 'Cobrado.\n\tSeña $5000' });
    expect(validarNota('x'.repeat(NOTA_MAXIMO))).toEqual({ valor: 'x'.repeat(NOTA_MAXIMO) });
    expect(validarNota('x'.repeat(NOTA_MAXIMO + 1))).toHaveProperty('error');
    expect(validarNota('hola\u0000chau')).toHaveProperty('error');
    expect(validarNota('hola‮chau')).toHaveProperty('error');
  });

  it('sello del cliente', () => {
    expect(selloDeCliente(null)).toBeNull();
    expect(selloDeCliente(1)).toEqual({ texto: 'Primer turno', conHistorial: false });
    expect(selloDeCliente(2)).toEqual({ texto: 'Cliente frecuente · 2 turnos', conHistorial: true });
  });

  it('la nota la edita cualquier rol, aunque el empleado solo complete', () => {
    expect(puedeEditarNotas('superadmin')).toBe(true);
    expect(puedeEditarNotas('admin')).toBe(true);
    expect(puedeEditarNotas('empleado')).toBe(true);
    expect(puedeCambiarEstado('empleado', 'cancelado')).toBe(false);
  });

  it('el foco vuelve al botón "Ver historial" del turno de origen', () => {
    expect(selectorDeHistorial('a1')).toBe('[data-historial="a1"]');
    expect(selectorDeHistorial('a"b')).toBe('[data-historial="a\\"b"]');
  });
});

/* Verificación del objetivo 3: diferencias encontradas en la revisión cruzada con el backend. */
describe('verificación: largo de la búsqueda como el backend (code points)', () => {
  it('un emoji cuenta 1: solo no alcanza, con otra letra sí; 80 emojis sí, 81 no', () => {
    expect(interpretarBusqueda('🚗')).toEqual({ tipo: 'corta' });
    expect(interpretarBusqueda(' 🚗a ')).toEqual({ tipo: 'lista', q: '🚗a' });
    expect(interpretarBusqueda('🚗'.repeat(80))).toEqual({ tipo: 'lista', q: '🚗'.repeat(80) });
    expect(interpretarBusqueda('🚗'.repeat(81))).toEqual({ tipo: 'larga' });
  });

  it('listarTurnos no manda un q de un solo emoji (el backend lo rechazaría con fields.q)', async () => {
    const llamadas = simular(() => json(200, { bookings: [], total: 0 }));
    expect((await fallo(listarTurnos({ ...pagina, q: '🚗' }))).fields?.q).toBe(MENSAJE_BUSQUEDA);
    expect(llamadas).toHaveLength(0);
    await listarTurnos({ ...pagina, q: '🚗a' });
    expect(llamadas[0]?.ruta).toContain(`q=${encodeURIComponent('🚗a')}`);
  });
});

describe('verificación: una recarga vieja no pisa lo que se acaba de guardar', () => {
  it('gana el updatedAt más nuevo, sea el guardado o el del backend', () => {
    const viejo = { ...turno, notasInternas: null, updatedAt: '2026-10-22T15:00:00.000Z' };
    const guardado = { ...turno, notasInternas: 'Cobrado.', updatedAt: '2026-10-22T15:00:05.000Z' };
    const otro = { ...turno, id: 'b2' };
    const guardados = new Map([[guardado.id, guardado]]);
    // La lista salió antes del PATCH y llegó después: queda la nota guardada.
    expect(conLoMasNuevo([viejo, otro], guardados)).toEqual([guardado, otro]);
    // Si el backend tiene algo más nuevo (lo cambió otra persona), gana el backend.
    const masNuevo = { ...turno, notasInternas: 'Otra nota.', updatedAt: '2026-10-22T15:01:00.000Z' };
    expect(conLoMasNuevo([masNuevo], guardados)).toEqual([masNuevo]);
    expect(conLoMasNuevo([guardado], guardados)).toEqual([guardado]);
  });
});
