import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express, { type Express, type Response } from 'express';
import { isApiPath } from './security.js';

/** Carpetas que solo tienen archivos del build: nunca son rutas de la SPA. */
const isStaticFolderPath = (urlPath: string): boolean => /^\/(?:assets|fotos|marca)(?:\/|$)/i.test(urlPath);

/**
 * Cabeceras de los dos archivos de la app instalable del panel (public/admin/ del frontend, copiados a dist/admin/):
 *  - sw.js: el navegador tiene que revisar el service worker en cada visita (no-cache) para actualizarlo, y exige un
 *    Content-Type de JavaScript;
 *  - manifest.webmanifest: application/manifest+json.
 * El resto de public/admin (sin-conexion.html, íconos) usa la revalidación de siempre.
 */
function adminAssetHeaders(res: Response, filePath: string): void {
  const name = path.basename(filePath);
  if (name === 'sw.js') {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    // Sin esto el worker (que vive en /admin/) solo controla /admin/...: no la ruta exacta /admin, el start_url de la app.
    res.setHeader('Service-Worker-Allowed', '/admin');
  } else if (name === 'manifest.webmanifest') {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  }
}

/** El robots.txt de siempre, si el build no trae uno. */
const ROBOTS_POR_DEFECTO = ['User-agent: *', 'Allow: /', 'Disallow: /admin', ''].join('\n');

/**
 * robots.txt con la línea `Sitemap:` (solo cuando hay PUBLIC_URL, que es lo que también activa /sitemap.xml). Parte del
 * robots.txt del build (frontend/public/robots.txt) sin tocar lo que ya dice; si ya trae una línea Sitemap, no la repite.
 */
export function robotsConSitemap(distPath: string, publicUrl: string): string {
  const archivo = path.join(distPath, 'robots.txt');
  const base = existsSync(archivo) ? readFileSync(archivo, 'utf8') : ROBOTS_POR_DEFECTO;
  if (/^\s*sitemap\s*:/im.test(base)) return base;
  const conSalto = base.endsWith('\n') ? base : `${base}\n`;
  return `${conSalto}\nSitemap: ${publicUrl}/sitemap.xml\n`;
}

/**
 * Sirve el build del frontend (../frontend/dist) como estáticos, con fallback SPA a index.html para
 * las rutas que no empiezan con /api (ej.: /admin). Se monta DESPUÉS de la API: las rutas /api nunca
 * llegan hasta acá (el router de la API termina en su propio 404), así que la compresión solo toca estáticos.
 */
export function mountFrontend(app: Express, distPath: string, publicUrl?: string): void {
  const indexFile = path.join(distPath, 'index.html');
  if (!existsSync(indexFile)) {
    throw new Error(
      `SERVE_FRONTEND está activo pero no existe ${indexFile}. Generá el build del frontend (npm run build en frontend/) o desactivá SERVE_FRONTEND.`,
    );
  }

  app.use(compression());

  // robots.txt dinámico solo con URL pública (así apunta al sitemap); sin ella, el archivo estático del build.
  if (publicUrl !== undefined) {
    const robots = robotsConSitemap(distPath, publicUrl);
    app.get('/robots.txt', (_req, res) => {
      res.type('text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(robots);
    });
  }

  // redirect:false => una carpeta (/assets) no responde un 301 a /assets/: cae al 404.
  // Los archivos de /assets llevan hash en el nombre (Vite): se pueden cachear un año.
  app.use(
    '/assets',
    express.static(path.join(distPath, 'assets'), { index: false, redirect: false, immutable: true, maxAge: '1y' }),
  );
  // Las fotos NO llevan hash: 7 días de caché. Al reemplazar una foto hay que cambiarle el nombre.
  app.use('/fotos', express.static(path.join(distPath, 'fotos'), { index: false, redirect: false, maxAge: '7d' }));
  // Los archivos de la app instalable del panel (/admin/sw.js, /admin/manifest.webmanifest, /admin/sin-conexion.html)
  // se sirven ANTES del fallback de la SPA. Una ruta del panel (/admin, /admin/turnos) no es un archivo: sigue de largo.
  app.use(
    '/admin',
    express.static(path.join(distPath, 'admin'), { index: false, redirect: false, maxAge: 0, setHeaders: adminAssetHeaders }),
  );
  // El resto (favicon, imágenes, etc.) se revalida siempre.
  app.use(express.static(distPath, { index: false, redirect: false, maxAge: 0 }));

  app.use((req, res, next) => {
    const isPageRequest = req.method === 'GET' || req.method === 'HEAD';
    // Un archivo con extensión que no existe (/assets/viejo.js) tiene que dar 404, no el HTML de la SPA.
    // Lo mismo con rutas ocultas (/.env, /.git/config) y con lo que cuelga de las carpetas de estáticos
    // (/assets/, /fotos/x): 404 real, para que no parezca que "existen".
    const hasHiddenSegment = req.path.split('/').some((segment) => segment.startsWith('.'));
    if (
      !isPageRequest ||
      isApiPath(req.path) ||
      isStaticFolderPath(req.path) ||
      path.extname(req.path) !== '' ||
      hasHiddenSegment
    ) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    // El panel no se indexa. robots.txt impide rastrearlo, pero entonces el buscador no ve el <meta robots> de
    // la SPA y puede listar la URL igual si alguien la enlaza: la cabecera lo resuelve sin depender del JS.
    // Tampoco la página de seguimiento de un turno (/turno/<id>): es de un cliente puntual.
    if (/^\/(?:admin|turno)(?:\/|$)/i.test(req.path)) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    res.sendFile(indexFile, (error) => {
      if (error) next(error);
    });
  });
}
