/*
 * Service worker del panel (/admin). Sin dependencias y a propósito mínimo:
 * - Avisos push de turnos nuevos (y el globito del ícono con los pendientes).
 * - Una página "Sin conexión" cuando falla abrir /admin.
 * NO guarda nada de /api ni JS/CSS de la app: no hay datos personales en el dispositivo.
 */
const CACHE = 'mg-panel-sin-conexion-v1';
const PAGINA_SIN_CONEXION = '/admin/sin-conexion.html';
const PRECARGA = [PAGINA_SIN_CONEXION, '/admin/sin-conexion.css', '/marca/logo-fondo-oscuro.png'];
const ICONO = '/marca/app-192.png';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Una por una: si falla una, las demás igual quedan.
      await Promise.all(PRECARGA.map((ruta) => cache.add(ruta).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

const esRutaDelPanel = (ruta) => ruta === '/admin' || ruta.startsWith('/admin/');

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  // La página "Sin conexión" también necesita su estilo y su logo: se piden con la red caída, así que se sirven de
  // la precarga (primero la red, para que una actualización se vea). Es lo único que no es navegación.
  if (pedido.method === 'GET' && pedido.mode !== 'navigate' && PRECARGA.includes(url.pathname)) {
    evento.respondWith(fetch(pedido).catch(async () => (await caches.match(url.pathname)) ?? Response.error()));
    return;
  }
  if (pedido.mode !== 'navigate' || !esRutaDelPanel(url.pathname)) return;
  evento.respondWith(
    fetch(pedido).catch(async () => (await caches.match(PAGINA_SIN_CONEXION)) ?? Response.error()),
  );
});

/** Lee el aviso con tolerancia: vacío, malformado o con campos raros → "Turno nuevo" genérico. */
function leerAviso(evento) {
  let datos = null;
  try {
    datos = evento.data ? evento.data.json() : null;
  } catch {
    datos = null;
  }
  if (typeof datos !== 'object' || datos === null) datos = {};
  const texto = (valor, maximo) =>
    typeof valor === 'string' && valor.trim() !== '' ? valor.trim().slice(0, maximo) : null;
  const pendientes =
    Number.isInteger(datos.pendientes) && datos.pendientes >= 0 && datos.pendientes <= 9999 ? datos.pendientes : null;
  // Solo rutas del propio panel: un aviso nunca abre otro sitio.
  const url = typeof datos.url === 'string' && esRutaDelPanel(datos.url.split(/[?#]/)[0]) ? datos.url : '/admin';
  const id = texto(datos.turnoId ?? datos.tag, 80);
  return {
    titulo: texto(datos.titulo, 80) ?? 'Turno nuevo',
    cuerpo: texto(datos.cuerpo, 200) ?? '',
    pendientes,
    url,
    // Una etiqueta distinta por aviso: dos turnos seguidos no se pisan en la bandeja.
    tag: id ? `turno-${id}` : `turno-${String(Date.now())}`,
  };
}

async function ponerGlobito(cantidad) {
  try {
    if (cantidad === null) return;
    if (cantidad > 0 && 'setAppBadge' in self.navigator) await self.navigator.setAppBadge(cantidad);
    else if ('clearAppBadge' in self.navigator) await self.navigator.clearAppBadge();
  } catch {
    // El globito es un extra: si el sistema no lo permite, no pasa nada.
  }
}

self.addEventListener('push', (evento) => {
  const aviso = leerAviso(evento);
  evento.waitUntil(
    Promise.all([
      self.registration.showNotification(aviso.titulo, {
        body: aviso.cuerpo,
        icon: ICONO,
        tag: aviso.tag,
        data: { url: aviso.url },
        lang: 'es-AR',
      }),
      ponerGlobito(aviso.pendientes),
    ]),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const pedida = evento.notification.data && evento.notification.data.url;
  let destino = new URL(typeof pedida === 'string' ? pedida : '/admin', self.location.origin);
  // Solo rutas del panel en este mismo origen (ojo: '/admin/../x' normaliza fuera del panel).
  if (destino.origin !== self.location.origin || !esRutaDelPanel(destino.pathname)) {
    destino = new URL('/admin', self.location.origin);
  }
  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const abierta = ventanas.find((v) => esRutaDelPanel(new URL(v.url).pathname));
      if (abierta) {
        await abierta.focus();
        return;
      }
      await self.clients.openWindow(destino.href);
    })(),
  );
});
