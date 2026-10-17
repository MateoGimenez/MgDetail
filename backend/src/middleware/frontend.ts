import { existsSync } from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express, { type Express } from 'express';
import { isApiPath } from './security.js';

/** Carpetas que solo tienen archivos del build: nunca son rutas de la SPA. */
const isStaticFolderPath = (urlPath: string): boolean => /^\/(?:assets|fotos|marca)(?:\/|$)/i.test(urlPath);

/**
 * Sirve el build del frontend (../frontend/dist) como estáticos, con fallback SPA a index.html para
 * las rutas que no empiezan con /api (ej.: /admin). Se monta DESPUÉS de la API: las rutas /api nunca
 * llegan hasta acá (el router de la API termina en su propio 404), así que la compresión solo toca estáticos.
 */
export function mountFrontend(app: Express, distPath: string): void {
  const indexFile = path.join(distPath, 'index.html');
  if (!existsSync(indexFile)) {
    throw new Error(
      `SERVE_FRONTEND está activo pero no existe ${indexFile}. Generá el build del frontend (npm run build en frontend/) o desactivá SERVE_FRONTEND.`,
    );
  }

  app.use(compression());

  // redirect:false => una carpeta (/assets) no responde un 301 a /assets/: cae al 404.
  // Los archivos de /assets llevan hash en el nombre (Vite): se pueden cachear un año.
  app.use(
    '/assets',
    express.static(path.join(distPath, 'assets'), { index: false, redirect: false, immutable: true, maxAge: '1y' }),
  );
  // Las fotos NO llevan hash: 7 días de caché. Al reemplazar una foto hay que cambiarle el nombre.
  app.use('/fotos', express.static(path.join(distPath, 'fotos'), { index: false, redirect: false, maxAge: '7d' }));
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
    if (/^\/admin(?:\/|$)/i.test(req.path)) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    res.sendFile(indexFile, (error) => {
      if (error) next(error);
    });
  });
}
