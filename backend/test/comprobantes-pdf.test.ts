import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { armarPresupuesto, type PresupuestoGuardado } from '../src/domain/presupuestos.js';
import {
  LEYENDA_COMPROBANTE,
  LEYENDA_PRESUPUESTO,
  RUTA_LOGO,
  generarPdfComprobante,
  generarPdfPresupuesto,
  limpiar,
  nombreDeArchivo,
} from '../src/pdf/documentos.js';
import { type Client, type TestContext, closeAllContexts, createClient, createTestContext, loginAs } from './helpers.js';

afterEach(closeAllContexts);

const TALLER = {
  nombre: 'MgDetailing',
  telefono: '5493804781737',
  direccion: 'Calle Olta Pasaje N2, La Rioja',
  instagram: 'mgdetailing',
  cuit: '20-12345678-9',
  leyendaPdf: 'Gracias por confiar en nosotros.',
};

/** Las líneas de texto de un PDF sin comprimir (fuentes estándar: cada BT/ET trae hex en WinAnsi/latin1). */
function lineasDelPdf(pdf: Buffer): string[] {
  const crudo = pdf.toString('latin1');
  const lineas: string[] = [];
  for (const bloque of crudo.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    let linea = '';
    for (const trozo of (bloque[1] ?? '').matchAll(/<([0-9a-f]*)>/g)) linea += Buffer.from(trozo[1] ?? '', 'hex').toString('latin1');
    lineas.push(linea);
  }
  return lineas;
}
const textoDelPdf = (pdf: Buffer): string => lineasDelPdf(pdf).join('\n');
const paginas = (pdf: Buffer): number => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

function guardado(extra: Partial<PresupuestoGuardado> = {}): PresupuestoGuardado {
  return {
    id: '00000000-0000-4000-8000-000000000001', numero: 7, clienteNombre: 'María Núñez', clienteTelefono: '5493804123456', vehiculo: 'Ford Ka 2019',
    items: [{ descripcion: 'Pulido completo', cantidad: 1, precioUnitario: 25000 }], descuento: 0, total: 25000, validezDias: 7, estado: 'borrador',
    notas: null, turnoId: null, creadoPor: null, createdAt: '2026-10-16T15:00:00.000Z', updatedAt: '2026-10-16T15:00:00.000Z', ...extra,
  };
}
const presupuesto = (extra: Partial<PresupuestoGuardado> = {}) => armarPresupuesto(guardado(extra), new Date('2026-10-16T15:00:00.000Z'));

describe('PDF: contenido', () => {
  it('el logo está en backend/assets y el archivo es un PDF completo', async () => {
    expect(existsSync(RUTA_LOGO)).toBe(true);
    const pdf = await generarPdfPresupuesto(presupuesto(), TALLER);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf.toString('latin1')).toContain('/Subtype /Image');
  });

  it('presupuesto: taller, código, fechas, cliente, tabla, total, notas y leyendas, con acentos y ñ', async () => {
    const p = presupuesto({
      items: [{ descripcion: 'Pulido de óptica y cañerías', cantidad: 2.5, precioUnitario: 10001 }, { descripcion: 'Encerado', cantidad: 1, precioUnitario: 5000 }],
      descuento: 1000, total: 25003 + 5000 - 1000, notas: 'Año nuevo: ¿dejás el auto el lunes?\nSegunda línea',
    });
    const texto = textoDelPdf(await generarPdfPresupuesto(p, TALLER, { comprimir: false }));
    for (const esperado of [
      'MgDetailing', 'Calle Olta Pasaje N2, La Rioja', 'Tel. +54 9 380 478 1737', 'Instagram @mgdetailing', 'CUIT 20-12345678-9',
      'PRESUPUESTO', 'P-0007', 'Fecha: 16/10/2026', 'Válido hasta: 23/10/2026 (7 días)', 'María Núñez', 'Ford Ka 2019',
      'Pulido de óptica y cañerías', '2,5', '$ 10.001', '$ 25.003', 'Encerado', '$ 5.000', 'Subtotal', '$ 30.003', 'Descuento', '- $ 1.000', 'TOTAL', '$ 29.003',
      'Año nuevo: ¿dejás el auto el lunes?', 'Segunda línea', LEYENDA_PRESUPUESTO, 'Gracias por confiar en nosotros.',
    ]) {
      expect(texto, esperado).toContain(esperado);
    }
  });

  it('sin descuento no hay renglón de descuento; sin datos opcionales no salen sus etiquetas', async () => {
    const texto = textoDelPdf(
      await generarPdfPresupuesto(presupuesto({ vehiculo: null, clienteTelefono: null }), { nombre: 'Taller', telefono: null, direccion: null, instagram: null, cuit: null, leyendaPdf: null }, { comprimir: false }),
    );
    expect(texto).not.toMatch(/Descuento|Instagram|CUIT|Tel\.|VEHÍCULO|Notas/i);
    expect(texto).toContain(LEYENDA_PRESUPUESTO);
  });

  it('nombres y descripciones largos envuelven sin romper el layout (todo el texto sigue ahí)', async () => {
    const largo = 'Descripción larguísima de un servicio '.repeat(6).trim().slice(0, 120);
    const sinEspacios = 'Ñ'.repeat(80);
    const p = presupuesto({ clienteNombre: sinEspacios, items: [{ descripcion: largo, cantidad: 1, precioUnitario: 1 }, { descripcion: 'X'.repeat(120), cantidad: 1, precioUnitario: 2 }], vehiculo: 'V'.repeat(80) });
    const pdf = await generarPdfPresupuesto(p, TALLER, { comprimir: false });
    const junto = lineasDelPdf(pdf).join('').replace(/\s+/g, '');
    expect(junto).toContain(sinEspacios);
    expect(junto).toContain('X'.repeat(120));
    expect(junto).toContain('V'.repeat(80));
    expect(junto).toContain(largo.replace(/\s+/g, ''));
    expect(paginas(pdf)).toBe(1);
  });

  it('con 30 ítems pasa a más de una página, repite el encabezado de la tabla y numera las hojas', async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ descripcion: `Ítem número ${String(i + 1)} con una descripción bastante larga para ocupar espacio en la fila ${'y más texto '.repeat(3)}`, cantidad: 1, precioUnitario: 1000 }));
    const pdf = await generarPdfPresupuesto(presupuesto({ items, total: 30000 }), TALLER, { comprimir: false });
    const lineas = lineasDelPdf(pdf);
    expect(paginas(pdf)).toBeGreaterThan(1);
    expect(lineas.filter((l) => l === 'Descripción').length).toBe(paginas(pdf));
    expect(lineas.some((l) => l.startsWith('Ítem número 30'))).toBe(true);
    expect(lineas.some((l) => l.startsWith('Página 1 de '))).toBe(true);
    expect(lineas).toContain('$ 30.000');
    expect(lineas).toContain(LEYENDA_PRESUPUESTO);
  });

  it('el contenido que viene de personas se limpia: controles fuera, emoji a "?", sin romper el PDF', async () => {
    expect(limpiar('Hola \u0000mundo\u202e \u{1F600} ñ€')).toBe('Hola mundo ? ñ€');
    const texto = textoDelPdf(await generarPdfPresupuesto(presupuesto({ clienteNombre: 'Juan (con) \\ paréntesis ) ] <x>' }), TALLER, { comprimir: false }));
    expect(texto).toContain('Juan (con) \\ paréntesis ) ] <x>');
    const crudo = (await generarPdfPresupuesto(presupuesto(), TALLER, { comprimir: false })).toString('latin1');
    expect(crudo).not.toMatch(/\/JS|\/JavaScript|\/OpenAction|\/URI|\/Launch/);
  });

  it('nombres de archivo seguros', () => {
    expect(nombreDeArchivo('Presupuesto', 'P-0007')).toBe('Presupuesto-P-0007.pdf');
    expect(nombreDeArchivo('Comprobante', 'R-0001')).toBe('Comprobante-R-0001.pdf');
    expect(nombreDeArchivo('Presupuesto', 'P-"\r\n/..\\ñ')).toBe('Presupuesto-P-____..__.pdf');
  });

  it('comprobante: datos, forma de pago, monto, notas y leyendas', async () => {
    const texto = textoDelPdf(
      await generarPdfComprobante(
        { id: '1', numero: 1, codigo: 'R-0001', fechaEmision: '2026-10-16', formaPago: 'debito', monto: 60000, clienteNombre: 'Ñandú Pérez', servicioNombre: 'Pulido y encerado', vehiculo: 'Camioneta', notas: 'Pagó en el local' },
        TALLER,
        { comprimir: false },
      ),
    );
    for (const esperado of ['COMPROBANTE DE PAGO', 'R-0001', 'Fecha: 16/10/2026', 'Ñandú Pérez', 'Pulido y encerado', 'Camioneta', 'Tarjeta de débito', 'MONTO', '$ 60.000', 'Pagó en el local', LEYENDA_COMPROBANTE, 'Gracias por confiar en nosotros.', 'MgDetailing']) {
      expect(texto, esperado).toContain(esperado);
    }
  });
});

async function equipo() {
  const context = await createTestContext();
  const admin = await loginAs(context, 'admin', 'ana@t.test');
  const empleado = await loginAs(context, 'empleado', 'beto@t.test');
  return { context, admin: admin.client, empleado: empleado.client };
}

async function turno(context: TestContext, extra: { estado?: string; modelo?: string | null; nombre?: string } = {}): Promise<string> {
  const { rows } = await context.db.sql.query(
    `INSERT INTO mgdetailing.bookings (nombre, telefono, vehiculo_tipo, vehiculo_modelo, servicio_id, fecha_preferida, franja, estado)
     VALUES ($1, '12345678', 'camioneta', $2, 'pulido', '2026-10-16', 'manana', $3) RETURNING id::text AS id`,
    [extra.nombre ?? 'Juan Pérez', extra.modelo === undefined ? 'Toyota Hilux 2021' : extra.modelo, extra.estado ?? 'confirmado'],
  );
  return String(rows[0]?.id);
}

async function completado(context: TestContext, admin: Client, monto = 60000, extra: { modelo?: string | null } = {}): Promise<string> {
  const id = await turno(context, extra);
  const r = await admin.patch(`/api/admin/bookings/${id}`, { estado: 'completado', monto });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return id;
}

const CLAVES = ['clienteNombre', 'codigo', 'fechaEmision', 'formaPago', 'id', 'monto', 'notas', 'numero', 'servicioNombre', 'vehiculo'];

describe('comprobantes', () => {
  it('201 la primera vez con la foto del momento; 200 con el mismo después (idempotente, no emite otro)', async () => {
    const { context, admin } = await equipo();
    const id = await completado(context, admin);
    const url = `/api/admin/bookings/${id}/comprobante`;
    expect((await admin.get(url)).status).toBe(404);
    const r1 = await admin.post(url, { formaPago: 'transferencia', notas: 'Alias mg.detailing' });
    expect(r1.status).toBe(201);
    expect(Object.keys(r1.body.comprobante).sort()).toEqual(CLAVES);
    expect(r1.body.comprobante).toMatchObject({
      numero: 1, codigo: 'R-0001', fechaEmision: '2026-10-16', formaPago: 'transferencia', monto: 60000, clienteNombre: 'Juan Pérez',
      servicioNombre: 'Pulido', vehiculo: 'Toyota Hilux 2021', notas: 'Alias mg.detailing',
    });
    const r2 = await admin.post(url, { formaPago: 'efectivo', notas: 'otra' });
    expect(r2.status).toBe(200);
    expect(r2.body.comprobante).toEqual(r1.body.comprobante);
    expect((await admin.get(url)).body.comprobante).toEqual(r1.body.comprobante);
    expect((await context.db.sql.query('SELECT count(*)::int AS n FROM mgdetailing.comprobantes')).rows[0]?.n).toBe(1);
  });

  it('es una foto: si después se corrige el turno, el comprobante no cambia; un turno con comprobante no se borra', async () => {
    const { context, admin } = await equipo();
    const id = await completado(context, admin, 60000);
    const c = (await admin.post(`/api/admin/bookings/${id}/comprobante`, { formaPago: 'efectivo' })).body.comprobante;
    await admin.patch(`/api/admin/bookings/${id}`, { monto: 1 });
    await context.db.sql.query("UPDATE mgdetailing.bookings SET nombre = 'Otro Nombre'");
    expect((await admin.get(`/api/admin/bookings/${id}/comprobante`)).body.comprobante).toEqual(c);
    const borrar = await admin.delete(`/api/admin/bookings/${id}`);
    expect(borrar.status).toBe(409);
    expect(borrar.body.error.code).toBe('TURNO_CON_COMPROBANTE');
  });

  it('sin modelo, el vehículo es el tipo; la numeración sigue (R-0002)', async () => {
    const { context, admin } = await equipo();
    const a = await completado(context, admin, 100);
    const b = await completado(context, admin, 200, { modelo: null });
    await admin.post(`/api/admin/bookings/${a}/comprobante`, { formaPago: 'otro' });
    const r = await admin.post(`/api/admin/bookings/${b}/comprobante`, { formaPago: 'credito' });
    expect(r.body.comprobante).toMatchObject({ codigo: 'R-0002', vehiculo: 'Camioneta', formaPago: 'credito', notas: null });
  });

  it('400 "Primero cargá el cobro del trabajo." si no está completado o no tiene monto', async () => {
    const { context, admin, empleado } = await equipo();
    const pendiente = await turno(context);
    const r1 = await admin.post(`/api/admin/bookings/${pendiente}/comprobante`, { formaPago: 'efectivo' });
    expect(r1.status).toBe(400);
    expect(r1.body.error.message).toBe('Primero cargá el cobro del trabajo.');
    const sinMonto = await turno(context);
    await empleado.patch(`/api/admin/bookings/${sinMonto}`, { estado: 'completado' });
    const r2 = await admin.post(`/api/admin/bookings/${sinMonto}/comprobante`, { formaPago: 'efectivo' });
    expect(r2.status).toBe(400);
    expect(r2.body.error.message).toBe('Primero cargá el cobro del trabajo.');
    expect((await context.db.sql.query('SELECT count(*)::int AS n FROM mgdetailing.comprobantes')).rows[0]?.n).toBe(0);
  });

  it('400 con fields por forma de pago y notas; 404 para turnos que no existen', async () => {
    const { context, admin } = await equipo();
    const id = await completado(context, admin);
    const url = `/api/admin/bookings/${id}/comprobante`;
    expect((await admin.post(url, { formaPago: 'bitcoin' })).body.error.fields.formaPago).toBeDefined();
    expect((await admin.post(url, {})).body.error.fields.formaPago).toBeDefined();
    expect((await admin.post(url, { formaPago: 'efectivo', notas: 'n'.repeat(201) })).body.error.fields.notas).toBeDefined();
    expect((await admin.post(url, { formaPago: 'efectivo', monto: 1 })).body.error.fields.monto).toBeDefined();
    expect((await admin.post('/api/admin/bookings/11111111-1111-4111-8111-111111111111/comprobante', { formaPago: 'efectivo' })).status).toBe(404);
    expect((await admin.post('/api/admin/bookings/nope/comprobante', { formaPago: 'efectivo' })).status).toBe(404);
    expect((await admin.get('/api/admin/bookings/nope/comprobante')).status).toBe(404);
  });

  it('el empleado recibe 403 en todo (antes de validar) y sin sesión 401', async () => {
    const { context, admin, empleado } = await equipo();
    const id = await completado(context, admin);
    const c = (await admin.post(`/api/admin/bookings/${id}/comprobante`, { formaPago: 'efectivo' })).body.comprobante;
    for (const r of [
      await empleado.post(`/api/admin/bookings/${id}/comprobante`, { formaPago: 'efectivo' }),
      await empleado.post(`/api/admin/bookings/${id}/comprobante`, {}),
      await empleado.get(`/api/admin/bookings/${id}/comprobante`),
      await empleado.get(`/api/admin/comprobantes/${String(c.id)}/pdf`),
    ]) {
      expect(r.status).toBe(403);
      expect(JSON.stringify(r.body)).not.toMatch(/60000|Juan/);
    }
    expect((await createClient(context.app).get(`/api/admin/comprobantes/${String(c.id)}/pdf`)).status).toBe(401);
  });
});

describe('PDF por la API', () => {
  it('presupuesto: application/pdf, nombre seguro, sin caché, nosniff, empieza con %PDF y termina con %%EOF', async () => {
    const { admin } = await equipo();
    const p = (await admin.post('/api/admin/presupuestos', { clienteNombre: 'María Núñez', items: [{ descripcion: 'Pulido', cantidad: 1, precioUnitario: 25000 }] })).body.presupuesto;
    const r = await admin.get(`/api/admin/presupuestos/${String(p.id)}/pdf`).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on('data', (d: Buffer) => partes.push(d));
      res.on('end', () => {
        cb(null, Buffer.concat(partes));
      });
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toBe('inline; filename="Presupuesto-P-0001.pdf"');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    const cuerpo = r.body as Buffer;
    expect(cuerpo.subarray(0, 4).toString()).toBe('%PDF');
    expect(cuerpo.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
    expect(Number(r.headers['content-length'])).toBe(cuerpo.length);
  });

  it('comprobante: mismas cabeceras con Comprobante-R-0001.pdf; 404 si no existe', async () => {
    const { context, admin } = await equipo();
    const id = await completado(context, admin);
    const c = (await admin.post(`/api/admin/bookings/${id}/comprobante`, { formaPago: 'efectivo' })).body.comprobante;
    const r = await admin.get(`/api/admin/comprobantes/${String(c.id)}/pdf`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toBe('inline; filename="Comprobante-R-0001.pdf"');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect((await admin.get('/api/admin/comprobantes/11111111-1111-4111-8111-111111111111/pdf')).status).toBe(404);
    expect((await admin.get('/api/admin/comprobantes/nope/pdf')).status).toBe(404);
    expect((await admin.get('/api/admin/presupuestos/11111111-1111-4111-8111-111111111111/pdf')).status).toBe(404);
  });

  it('usa los datos del taller guardados (PUT /api/admin/taller)', async () => {
    const { context, admin } = await equipo();
    await admin.put('/api/admin/taller', { nombre: 'Taller Ñandú', direccion: 'Av. Perón 123' });
    const id = await completado(context, admin);
    await admin.post(`/api/admin/bookings/${id}/comprobante`, { formaPago: 'efectivo' });
    const { rows } = await context.db.sql.query('SELECT id::text AS id FROM mgdetailing.comprobantes');
    const taller = (await admin.get('/api/admin/taller')).body.taller;
    const c = (await admin.get(`/api/admin/bookings/${id}/comprobante`)).body.comprobante;
    expect(String(rows[0]?.id)).toBe(c.id);
    const texto = textoDelPdf(await generarPdfComprobante(c, taller, { comprimir: false }));
    expect(texto).toContain('Taller Ñandú');
    expect(texto).toContain('Av. Perón 123');
  });
});
