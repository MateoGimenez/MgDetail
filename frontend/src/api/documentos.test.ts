import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { buscarComprobante, emitirComprobante } from './comprobantes';
import { descargarPdf } from './pdf';
import {
  actualizarPresupuesto,
  crearPresupuesto,
  eliminarPresupuesto,
  listarPresupuestos,
  rutaPdfPresupuesto,
} from './presupuestos';
import { SesionPerdidaError } from './sesion';
import { guardarTaller, obtenerTaller } from './taller';

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

const presupuesto = {
  id: 'p1',
  numero: 7,
  codigo: 'P-0007',
  clienteNombre: 'Juan Pérez',
  clienteTelefono: '5493804781737',
  vehiculo: 'Corsa 2012',
  items: [{ descripcion: 'Pulido', cantidad: 1, precioUnitario: 60000 }],
  descuento: 0,
  subtotal: 60000,
  total: 60000,
  validezDias: 7,
  venceEl: '2026-11-03',
  estado: 'borrador',
  vencido: false,
  notas: null,
  turnoId: null,
  creadoPor: { id: 'u1', nombre: 'Mateo' },
  createdAt: '2026-10-27T15:00:00.000Z',
  updatedAt: '2026-10-27T15:00:00.000Z',
};
const comprobante = {
  id: 'c1',
  numero: 1,
  codigo: 'R-0001',
  fechaEmision: '2026-10-27',
  formaPago: 'efectivo',
  monto: 60000,
  clienteNombre: 'Juan Pérez',
  servicioNombre: 'Pulido',
  vehiculo: 'Corsa 2012',
  notas: null,
};
const taller = {
  nombre: 'MgDetailing',
  telefono: '5493804781737',
  direccion: 'Calle Olta Pasaje N2, La Rioja',
  instagram: null,
  cuit: null,
  leyendaPdf: null,
};

function simular(respuesta: (n: number) => Response) {
  const llamadas: { metodo: string; ruta: string; tipo: string | null; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      llamadas.push({
        metodo: init?.method ?? 'GET',
        ruta: typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url,
        tipo: headers.get('Content-Type'),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      return Promise.resolve(respuesta(llamadas.length));
    }),
  );
  return llamadas;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api/taller', () => {
  it('lee y guarda los seis campos', async () => {
    const llamadas = simular(() => json(200, { taller }));
    expect(await obtenerTaller()).toEqual(taller);
    expect(await guardarTaller({ ...taller, instagram: 'mgdetailing' })).toEqual(taller);
    expect(llamadas[0]).toMatchObject({ metodo: 'GET', ruta: '/api/admin/taller' });
    expect(llamadas[1]).toMatchObject({
      metodo: 'PUT',
      tipo: 'application/json',
      body: { ...taller, instagram: 'mgdetailing' },
    });
  });

  it('rechaza campos de más o de menos y devuelve los errores por campo', async () => {
    simular(() => json(200, { taller: { ...taller, extra: 1 } }));
    await expect(obtenerTaller()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    simular(() => json(200, { taller: { nombre: 'x' } }));
    await expect(obtenerTaller()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    simular(() => json(400, { error: { code: 'VALIDATION_ERROR', message: 'Revisá los datos.', fields: { cuit: 'CUIT inválido.' } } }));
    await expect(guardarTaller(taller)).rejects.toMatchObject({ status: 400, fields: { cuit: 'CUIT inválido.' } });
  });
});

describe('api/presupuestos', () => {
  it('lista con estado y búsqueda', async () => {
    const llamadas = simular(() => json(200, { presupuestos: [presupuesto], total: 1 }));
    const r = await listarPresupuestos({ estado: 'enviado', q: 'corsa', limit: 20, offset: 0 });
    expect(r.presupuestos[0]?.codigo).toBe('P-0007');
    expect(llamadas[0]?.ruta).toBe('/api/admin/presupuestos?limit=20&offset=0&estado=enviado&q=corsa');
  });

  it('rechaza un estado desconocido, una fecha mal escrita o campos de más', async () => {
    simular(() => json(200, { presupuestos: [{ ...presupuesto, estado: 'cerrado' }], total: 1 }));
    await expect(listarPresupuestos({ limit: 20, offset: 0 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    simular(() => json(200, { presupuestos: [{ ...presupuesto, venceEl: '3/11' }], total: 1 }));
    await expect(listarPresupuestos({ limit: 20, offset: 0 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    simular(() => json(200, { presupuestos: [{ ...presupuesto, otro: 1 }], total: 1 }));
    await expect(listarPresupuestos({ limit: 20, offset: 0 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('crea, edita (PATCH) y borra (DELETE)', async () => {
    const llamadas = simular((n) => (n === 3 ? new Response(null, { status: 204 }) : json(n === 1 ? 201 : 200, { presupuesto })));
    await crearPresupuesto({
      clienteNombre: 'Juan Pérez',
      items: [{ descripcion: 'Pulido', cantidad: 1, precioUnitario: 60000 }],
      descuento: 0,
      validezDias: 7,
    });
    await actualizarPresupuesto('p1', { estado: 'aceptado' });
    await eliminarPresupuesto('p1');
    expect(llamadas.map((l) => [l.metodo, l.ruta, l.tipo])).toEqual([
      ['POST', '/api/admin/presupuestos', 'application/json'],
      ['PATCH', '/api/admin/presupuestos/p1', 'application/json'],
      ['DELETE', '/api/admin/presupuestos/p1', 'application/json'],
    ]);
    expect(llamadas[1]?.body).toEqual({ estado: 'aceptado' });
  });

  it('borrar uno aceptado vuelve como 409 PRESUPUESTO_ACEPTADO', async () => {
    simular(() => json(409, { error: { code: 'PRESUPUESTO_ACEPTADO', message: 'Está aceptado.' } }));
    const falla = await eliminarPresupuesto('p1').catch((e: unknown) => e);
    expect(falla).toBeInstanceOf(ApiError);
    expect(falla).toMatchObject({ status: 409, code: 'PRESUPUESTO_ACEPTADO' });
  });

  it('errores por campo de los ítems', async () => {
    simular(() =>
      json(400, { error: { code: 'VALIDATION_ERROR', message: 'Revisá.', fields: { 'items.0.cantidad': 'Tiene que ser mayor a 0.' } } }),
    );
    const falla = await crearPresupuesto({ clienteNombre: 'x', items: [] }).catch((e: unknown) => e);
    expect(falla).toMatchObject({ fields: { 'items.0.cantidad': 'Tiene que ser mayor a 0.' } });
  });
});

describe('api/comprobantes', () => {
  it('emite con la forma de pago (201) y reabre el que ya existía (200)', async () => {
    const llamadas = simular(() => json(200, { comprobante }));
    const c = await emitirComprobante('t1', { formaPago: 'efectivo', notas: 'Seña incluida' });
    expect(c.codigo).toBe('R-0001');
    expect(llamadas[0]).toMatchObject({
      metodo: 'POST',
      ruta: '/api/admin/bookings/t1/comprobante',
      tipo: 'application/json',
      body: { formaPago: 'efectivo', notas: 'Seña incluida' },
    });
  });

  it('buscar devuelve null si todavía no hay (404) y propaga otros errores', async () => {
    simular(() => json(404, { error: { code: 'NOT_FOUND', message: 'No hay comprobante.' } }));
    expect(await buscarComprobante('t1')).toBeNull();
    simular(() => json(500, { error: { code: 'INTERNAL', message: 'Falló.' } }));
    await expect(buscarComprobante('t1')).rejects.toMatchObject({ status: 500 });
    simular(() => json(200, { comprobante }));
    expect((await buscarComprobante('t1'))?.formaPago).toBe('efectivo');
  });

  it('sin cobro cargado: 400 con el mensaje del backend', async () => {
    simular(() => json(400, { error: { code: 'VALIDATION_ERROR', message: 'Primero cargá el cobro del trabajo.' } }));
    await expect(emitirComprobante('t1', { formaPago: 'otro' })).rejects.toMatchObject({
      status: 400,
      message: 'Primero cargá el cobro del trabajo.',
    });
  });

  it('rechaza una forma de pago desconocida en la respuesta', async () => {
    simular(() => json(200, { comprobante: { ...comprobante, formaPago: 'cheque' } }));
    await expect(buscarComprobante('t1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('api/pdf', () => {
  const pdf = () => new Response('%PDF-1.4 ...', { status: 200, headers: { 'Content-Type': 'application/pdf' } });

  it('baja el PDF como Blob con las cookies de la sesión', async () => {
    const llamadas = simular(() => pdf());
    const blob = await descargarPdf(rutaPdfPresupuesto('p1'));
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
    expect(llamadas[0]).toMatchObject({ metodo: 'GET', ruta: '/api/admin/presupuestos/p1/pdf' });
  });

  it('un 401 refresca la sesión una vez y reintenta', async () => {
    const llamadas = simular((n) => {
      if (n === 1) return json(401, { error: { code: 'SESSION_EXPIRED', message: 'Venció.' } });
      if (n === 2) return json(200, {});
      return pdf();
    });
    const blob = await descargarPdf('/admin/comprobantes/c1/pdf');
    expect(blob.size).toBeGreaterThan(0);
    expect(llamadas.map((l) => l.ruta)).toEqual([
      '/api/admin/comprobantes/c1/pdf',
      '/api/auth/refresh',
      '/api/admin/comprobantes/c1/pdf',
    ]);
  });

  it('si el refresco falla, la sesión se pierde', async () => {
    simular((n) =>
      n === 1 ? json(401, { error: { code: 'SESSION_EXPIRED', message: 'Venció.' } }) : json(401, { error: { code: 'SESSION_EXPIRED', message: 'Venció.' } }),
    );
    await expect(descargarPdf('/admin/presupuestos/p1/pdf')).rejects.toBeInstanceOf(SesionPerdidaError);
  });

  it('un error del backend deja su mensaje; 403 no pierde la sesión', async () => {
    simular(() => json(403, { error: { code: 'FORBIDDEN', message: 'Tu rol no puede hacer esto.' } }));
    const falla = await descargarPdf('/admin/presupuestos/p1/pdf').catch((e: unknown) => e);
    expect(falla).toBeInstanceOf(ApiError);
    expect(falla).not.toBeInstanceOf(SesionPerdidaError);
    expect(falla).toMatchObject({ status: 403, message: 'Tu rol no puede hacer esto.' });
  });

  it('un 404 o un 500 sin cuerpo JSON tienen mensaje propio', async () => {
    simular(() => new Response('<html>', { status: 404 }));
    await expect(descargarPdf('/x')).rejects.toMatchObject({ status: 404, message: 'Ya no encontramos ese documento.' });
    simular(() => new Response('', { status: 502 }));
    await expect(descargarPdf('/x')).rejects.toMatchObject({ status: 502 });
  });

  it('rechaza lo que no es un PDF y un PDF vacío', async () => {
    simular(() => new Response('hola', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    await expect(descargarPdf('/x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    simular(() => new Response('', { status: 200, headers: { 'Content-Type': 'application/pdf' } }));
    await expect(descargarPdf('/x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('una falla de red tiene mensaje en español', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fail'))));
    await expect(descargarPdf('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
