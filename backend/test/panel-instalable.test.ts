import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { BACKEND_ROOT } from '../src/config.js';

/**
 * Los archivos de la app instalable del panel (frontend/public/admin y los íconos de marca) revisados como código de
 * producción: el service worker se ejecuta en un contexto aislado con un `self` falso, y el manifest y la página
 * "Sin conexión" se comprueban contra los archivos reales.
 */
const PUBLIC = path.resolve(BACKEND_ROOT, '..', 'frontend', 'public');
const leer = (...partes: string[]) => readFileSync(path.join(PUBLIC, ...partes), 'utf8');

const ORIGEN = 'https://mgdetailing.test';

type Manejador = (evento: Record<string, unknown>) => void;

interface Entorno {
  manejadores: Map<string, Manejador>;
  showNotification: ReturnType<typeof vi.fn>;
  setAppBadge: ReturnType<typeof vi.fn>;
  clearAppBadge: ReturnType<typeof vi.fn>;
  openWindow: ReturnType<typeof vi.fn>;
  matchAll: ReturnType<typeof vi.fn>;
  cacheAdd: ReturnType<typeof vi.fn>;
  cachePut: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
  fetch: ReturnType<typeof vi.fn>;
}

/** Carga sw.js con un `self`, `caches` y `fetch` falsos. */
function cargarServiceWorker(opciones: { ventanas?: { url: string; focus: () => Promise<void> }[] } = {}): Entorno {
  const manejadores = new Map<string, Manejador>();
  const showNotification = vi.fn(() => Promise.resolve());
  const setAppBadge = vi.fn(() => Promise.resolve());
  const clearAppBadge = vi.fn(() => Promise.resolve());
  const openWindow = vi.fn(() => Promise.resolve(null));
  const matchAll = vi.fn(() => Promise.resolve(opciones.ventanas ?? []));
  const cacheAdd = vi.fn(() => Promise.resolve());
  const cachePut = vi.fn(() => Promise.resolve());
  const match = vi.fn((ruta: string) => Promise.resolve(new Response(`cache:${ruta}`)));
  const fetchFalso = vi.fn(() => Promise.reject(new TypeError('sin red')));

  const self = {
    location: { origin: ORIGEN },
    navigator: { setAppBadge, clearAppBadge },
    registration: { showNotification },
    clients: { matchAll, openWindow, claim: vi.fn(() => Promise.resolve()) },
    skipWaiting: vi.fn(() => Promise.resolve()),
    addEventListener: (tipo: string, manejador: Manejador) => manejadores.set(tipo, manejador),
  };
  const caches = {
    open: vi.fn(() => Promise.resolve({ add: cacheAdd, put: cachePut })),
    keys: vi.fn(() => Promise.resolve([])),
    delete: vi.fn(() => Promise.resolve(true)),
    match,
  };
  const contexto = vm.createContext({ self, caches, fetch: fetchFalso, Response, URL, Date, Promise, TypeError });
  vm.runInContext(readFileSync(path.join(PUBLIC, 'admin', 'sw.js'), 'utf8'), contexto, { filename: 'sw.js' });
  return { manejadores, showNotification, setAppBadge, clearAppBadge, openWindow, matchAll, cacheAdd, cachePut, match, fetch: fetchFalso };
}

/** Dispara un evento y devuelve lo que se le pasó a waitUntil / respondWith. */
async function disparar(entorno: Entorno, tipo: string, evento: Record<string, unknown>) {
  const manejador = entorno.manejadores.get(tipo);
  if (!manejador) throw new Error(`sin manejador de ${tipo}`);
  const esperas: unknown[] = [];
  const respuestas: unknown[] = [];
  manejador({
    ...evento,
    waitUntil: (p: unknown) => esperas.push(p),
    respondWith: (p: unknown) => respuestas.push(p),
  });
  await Promise.all(esperas);
  return { respuestas };
}

const pushCon = (data: unknown) => ({ data });
const datosJson = (valor: unknown) => ({ json: () => valor });

describe('service worker del panel: push', () => {
  it('muestra el aviso con lo que manda el servidor y pone el globito con los pendientes', async () => {
    const sw = cargarServiceWorker();
    await disparar(
      sw,
      'push',
      pushCon(datosJson({ titulo: 'Turno nuevo', cuerpo: 'Lavado Premium · jue 29/10 · Mañana', pendientes: 3, url: '/admin' })),
    );
    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    const [titulo, opciones] = sw.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(titulo).toBe('Turno nuevo');
    expect(opciones).toMatchObject({ body: 'Lavado Premium · jue 29/10 · Mañana', icon: '/marca/app-192.png', data: { url: '/admin' } });
    expect(String(opciones.tag)).toMatch(/^turno-/);
    // Sin sonido forzado ni vibración propia.
    expect(opciones).not.toHaveProperty('silent');
    expect(opciones).not.toHaveProperty('vibrate');
    expect(sw.setAppBadge).toHaveBeenCalledWith(3);
  });

  it('dos avisos seguidos no se pisan: cada uno lleva su propio tag', async () => {
    const sw = cargarServiceWorker();
    await disparar(sw, 'push', pushCon(datosJson({ titulo: 'a' })));
    await new Promise((resolver) => setTimeout(resolver, 5));
    await disparar(sw, 'push', pushCon(datosJson({ titulo: 'b' })));
    const tags = sw.showNotification.mock.calls.map(([, opciones]) => (opciones as { tag: string }).tag);
    expect(new Set(tags).size).toBe(2);
  });

  it.each([
    ['sin cuerpo (data null)', null],
    ['JSON inválido', { json: () => { throw new SyntaxError('no es JSON'); } }],
    ['un texto suelto', datosJson('hola')],
    ['null', datosJson(null)],
    ['un arreglo', datosJson([1, 2])],
    ['un número', datosJson(7)],
    ['campos con tipos equivocados', datosJson({ titulo: 5, cuerpo: { a: 1 }, pendientes: 'tres', url: 9 })],
    ['vacío', datosJson({})],
  ])('payload tolerante, %s: muestra el aviso genérico y no explota', async (_nombre, data) => {
    const sw = cargarServiceWorker();
    await disparar(sw, 'push', pushCon(data));
    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    const [titulo, opciones] = sw.showNotification.mock.calls[0] as unknown as [string, { body: string; data: { url: string } }];
    expect(titulo).toBe('Turno nuevo');
    expect(opciones.body).toBe('');
    expect(opciones.data.url).toBe('/admin');
    expect(sw.setAppBadge).not.toHaveBeenCalled();
    expect(sw.clearAppBadge).not.toHaveBeenCalled();
  });

  it('el globito: 0 lo limpia; negativos, decimales y textos se ignoran; si el sistema lo rechaza no pasa nada', async () => {
    const sw = cargarServiceWorker();
    await disparar(sw, 'push', pushCon(datosJson({ pendientes: 0 })));
    expect(sw.clearAppBadge).toHaveBeenCalledTimes(1);
    for (const raro of [-1, 1.5, '3', 10_000, null]) await disparar(sw, 'push', pushCon(datosJson({ pendientes: raro })));
    expect(sw.setAppBadge).not.toHaveBeenCalled();
    expect(sw.clearAppBadge).toHaveBeenCalledTimes(1);

    sw.setAppBadge.mockRejectedValueOnce(new Error('no permitido'));
    await disparar(sw, 'push', pushCon(datosJson({ pendientes: 2 })));
    expect(sw.showNotification).toHaveBeenCalledTimes(7);
  });

  it('recorta títulos y cuerpos larguísimos y nunca deja pasar una URL fuera del panel', async () => {
    const sw = cargarServiceWorker();
    await disparar(sw, 'push', pushCon(datosJson({ titulo: 'T'.repeat(500), cuerpo: 'C'.repeat(5000) })));
    const [titulo, opciones] = sw.showNotification.mock.calls[0] as unknown as [string, { body: string }];
    expect(titulo).toHaveLength(80);
    expect(opciones.body).toHaveLength(200);

    for (const url of ['https://evil.example/admin', '//evil.example/admin', 'javascript:alert(1)', '/otra', '/administrador', '/']) {
      sw.showNotification.mockClear();
      await disparar(sw, 'push', pushCon(datosJson({ url })));
      const [, o] = sw.showNotification.mock.calls[0] as unknown as [string, { data: { url: string } }];
      expect(o.data.url, url).toBe('/admin');
    }
    sw.showNotification.mockClear();
    await disparar(sw, 'push', pushCon(datosJson({ url: '/admin?vista=agenda' })));
    expect((sw.showNotification.mock.calls[0] as unknown as [string, { data: { url: string } }])[1].data.url).toBe('/admin?vista=agenda');
  });
});

describe('service worker del panel: notificationclick', () => {
  const clic = (url: unknown) => {
    const cerrar = vi.fn();
    return { evento: { notification: { close: cerrar, data: url === undefined ? undefined : { url } } }, cerrar };
  };

  it('enfoca la ventana del panel que ya está abierta, sin abrir otra', async () => {
    const focus = vi.fn(() => Promise.resolve());
    const sw = cargarServiceWorker({
      ventanas: [
        { url: `${ORIGEN}/`, focus: vi.fn(() => Promise.resolve()) },
        { url: `${ORIGEN}/admin/turnos`, focus },
      ],
    });
    const { evento, cerrar } = clic('/admin');
    await disparar(sw, 'notificationclick', evento);
    expect(cerrar).toHaveBeenCalled();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('si no hay ventana del panel abre /admin (la web pública abierta no cuenta)', async () => {
    const sw = cargarServiceWorker({ ventanas: [{ url: `${ORIGEN}/servicios`, focus: vi.fn(() => Promise.resolve()) }] });
    await disparar(sw, 'notificationclick', clic('/admin').evento);
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGEN}/admin`);
  });

  it('respeta una ruta del panel con parámetros y nunca abre otro origen u otra ruta', async () => {
    const sw = cargarServiceWorker();
    await disparar(sw, 'notificationclick', clic('/admin?vista=agenda').evento);
    expect(sw.openWindow).toHaveBeenLastCalledWith(`${ORIGEN}/admin?vista=agenda`);

    for (const raro of [
      'https://evil.example/admin',
      '//evil.example/admin',
      '/admin/../secreto',
      '/otra-cosa',
      'javascript:alert(1)',
      42,
      undefined,
    ]) {
      sw.openWindow.mockClear();
      const { evento } = clic(raro);
      await disparar(sw, 'notificationclick', evento);
      expect(sw.openWindow, String(raro)).toHaveBeenCalledWith(`${ORIGEN}/admin`);
    }
  });
});

describe('service worker del panel: fetch, instalación y caché', () => {
  const pedido = (ruta: string, extra: Record<string, unknown> = {}) => ({
    request: { url: ruta.startsWith('http') ? ruta : `${ORIGEN}${ruta}`, mode: 'navigate', method: 'GET', ...extra },
  });

  it('con la red caída, una navegación a /admin* muestra la página "Sin conexión"', async () => {
    const sw = cargarServiceWorker();
    for (const ruta of ['/admin', '/admin/', '/admin/turnos', '/admin?vista=hoy']) {
      sw.match.mockClear();
      const { respuestas } = await disparar(sw, 'fetch', pedido(ruta));
      expect(respuestas, ruta).toHaveLength(1);
      const respuesta = (await respuestas[0]) as Response;
      expect(await respuesta.text(), ruta).toBe('cache:/admin/sin-conexion.html');
    }
  });

  it('con red, la navegación pasa tal cual y no se guarda nada', async () => {
    const sw = cargarServiceWorker();
    sw.fetch.mockResolvedValueOnce(new Response('panel'));
    const { respuestas } = await disparar(sw, 'fetch', pedido('/admin'));
    expect(await ((await respuestas[0]) as Response).text()).toBe('panel');
    expect(sw.cachePut).not.toHaveBeenCalled();
  });

  it('NO toca /api, ni JS/CSS/imágenes de la app, ni la web pública, ni otros orígenes, ni lo que no es GET', async () => {
    const sw = cargarServiceWorker();
    const ignorados = [
      pedido('/api/admin/bookings', { mode: 'cors' }),
      pedido('/api/admin/bookings'), // aunque fuera una navegación
      pedido('/assets/index-abc123.js', { mode: 'no-cors' }),
      pedido('/assets/index-abc123.css', { mode: 'no-cors' }),
      pedido('/fotos/taller.jpg', { mode: 'no-cors' }),
      pedido('/admin/otra.js', { mode: 'no-cors' }),
      pedido('/'), // la web pública
      pedido('/servicios/pulido'),
      pedido('/administrador'), // parecida a /admin pero no es del panel
      pedido('https://otro.example/admin'),
      pedido('/admin/sin-conexion.css', { mode: 'no-cors', method: 'POST' }),
    ];
    for (const evento of ignorados) {
      const { respuestas } = await disparar(sw, 'fetch', evento);
      expect(respuestas, evento.request.url).toHaveLength(0);
    }
  });

  it('la página "Sin conexión" también carga su estilo y su logo sin red, y con red siempre pide lo último', async () => {
    const sw = cargarServiceWorker();
    for (const ruta of ['/admin/sin-conexion.css', '/marca/logo-fondo-oscuro.png']) {
      const { respuestas } = await disparar(sw, 'fetch', pedido(ruta, { mode: 'no-cors' }));
      expect(respuestas, ruta).toHaveLength(1);
      expect(await ((await respuestas[0]) as Response).text(), ruta).toBe(`cache:${ruta}`);
    }
    sw.fetch.mockResolvedValueOnce(new Response('nuevo'));
    const { respuestas } = await disparar(sw, 'fetch', pedido('/admin/sin-conexion.css', { mode: 'no-cors' }));
    expect(await ((await respuestas[0]) as Response).text()).toBe('nuevo');
  });

  it('instalación: precarga solo la página sin conexión, su estilo y el logo; nunca guarda con put/addAll', async () => {
    const sw = cargarServiceWorker();
    await disparar(sw, 'install', {});
    expect(sw.cacheAdd.mock.calls.map(([ruta]) => ruta).sort()).toEqual([
      '/admin/sin-conexion.css',
      '/admin/sin-conexion.html',
      '/marca/logo-fondo-oscuro.png',
    ]);
    // Sin comentarios: el encabezado menciona /api justamente para decir que no se toca.
    const codigo = leer('admin', 'sw.js')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(codigo).not.toMatch(/cache\.put|\.addAll|\.put\(/);
    expect(codigo).not.toMatch(/\/api/);
    expect(codigo).not.toMatch(/importScripts|eval\(|new Function/);
  });
});

/** Ancho y alto de un PNG (cabecera IHDR). */
function medidasPng(archivo: string): { ancho: number; alto: number } {
  const bytes = readFileSync(archivo);
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { ancho: bytes.readUInt32BE(16), alto: bytes.readUInt32BE(20) };
}

describe('manifest del panel', () => {
  const manifest = JSON.parse(leer('admin', 'manifest.webmanifest')) as {
    id: string;
    name: string;
    short_name: string;
    display: string;
    start_url: string;
    scope: string;
    theme_color: string;
    background_color: string;
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
    shortcuts: { name: string; url: string; icons?: { src: string; sizes: string }[] }[];
  };

  it('es una app independiente del panel: nombre, standalone, inicio dentro del alcance', () => {
    expect(manifest.name).toBe('MgDetailing · Panel');
    expect(manifest.short_name).toBe('MG Panel');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/admin');
    expect(manifest.scope).toBe('/admin');
    expect(manifest.id).toBe('/admin');
    expect(manifest.theme_color).toBe('#14171a');
    expect(manifest.background_color).toBe('#14171a');
    const dentro = (ruta: string) => ruta === manifest.scope || ruta.startsWith(`${manifest.scope}/`) || ruta.startsWith(`${manifest.scope}?`);
    expect(dentro(manifest.start_url)).toBe(true);
    for (const atajo of manifest.shortcuts) expect(dentro(atajo.url), atajo.url).toBe(true);
  });

  it('los íconos existen, son PNG y miden lo que declaran (192, 512 y maskable 512)', () => {
    const declarados = manifest.icons.map((icono) => `${icono.sizes}:${icono.purpose ?? 'any'}`).sort();
    expect(declarados).toEqual(['192x192:any', '512x512:any', '512x512:maskable']);
    for (const icono of [...manifest.icons, ...manifest.shortcuts.flatMap((atajo) => atajo.icons ?? [])]) {
      const archivo = path.join(PUBLIC, icono.src);
      expect(existsSync(archivo), icono.src).toBe(true);
      const [ancho, alto] = icono.sizes.split('x').map(Number);
      expect(medidasPng(archivo), icono.src).toEqual({ ancho, alto });
    }
    for (const icono of manifest.icons) expect(icono.type).toBe('image/png');
  });

  it('los accesos directos abren vistas que el panel entiende con ?vista=', () => {
    const fuente = readFileSync(path.resolve(PUBLIC, '..', 'src', 'lib', 'hoy.ts'), 'utf8');
    const vistas = /export const VISTAS = \[([^\]]+)\]/.exec(fuente)?.[1]?.match(/'([a-z]+)'/g)?.map((v) => v.replaceAll("'", ''));
    expect(vistas).toContain('hoy');
    const pedidas = manifest.shortcuts.map((atajo) => new URL(atajo.url, ORIGEN).searchParams.get('vista'));
    expect(pedidas).toEqual(['hoy', 'agenda']);
    for (const vista of pedidas) expect(vistas).toContain(vista);
  });
});

describe('página "Sin conexión"', () => {
  const html = leer('admin', 'sin-conexion.html');
  const css = leer('admin', 'sin-conexion.css');

  it('no necesita nada inline: la CSP del panel (style-src y script-src solo propios) no la rompe', () => {
    expect(html).not.toMatch(/<style|<script|\sstyle\s*=|\son[a-z]+\s*=|javascript:/i);
    expect(css).not.toMatch(/@import|url\(\s*['"]?(?:https?:)?\/\//i);
    expect(css).not.toMatch(/url\(\s*['"]?data:/i); // un data: choca con img-src solo si no se declara; se evita igual
  });

  it('todo lo que usa es del propio sitio y existe en public/', () => {
    const referencias = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(referencias.length).toBeGreaterThan(0);
    for (const ref of referencias) {
      expect(ref.startsWith('/'), ref).toBe(true);
      expect(ref.startsWith('//'), ref).toBe(false);
      if (ref === '/admin') continue; // "Reintentar" vuelve al panel
      expect(existsSync(path.join(PUBLIC, ref)), ref).toBe(true);
    }
  });
});
