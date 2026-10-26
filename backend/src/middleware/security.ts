import cors from 'cors';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import type { AppConfig } from '../config.js';

export const isApiPath = (path: string): boolean => /^\/api(?:\/|$)/i.test(path);

const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';

/**
 * Cabeceras de seguridad (helmet). Hay dos perfiles:
 * - /api: respuestas JSON. CSP "none": no pueden cargar ni ejecutar nada ni embeberse en un frame.
 * - resto (solo si SERVE_FRONTEND=true): la SPA. CSP restrictiva y ajustada a lo que el frontend realmente usa:
 *   todo del mismo origen ('self'), sin scripts ni estilos inline, fuentes autoalojadas (sin Google Fonts),
 *   imágenes y video propios o data:, sin iframes (Google Maps va solo como link) ni plugins.
 *   Si el frontend pasa a cargar recursos de otro dominio, hay que agregarlos acá a propósito.
 */
export function securityHeaders(config: Pick<AppConfig, 'isProduction'>): RequestHandler {
  const common = {
    frameguard: { action: 'deny' },
    // HSTS solo en producción (en HTTP local no aplica). Sin includeSubDomains: no se impone HTTPS a otros subdominios.
    strictTransportSecurity: config.isProduction ? { maxAge: 15_552_000, includeSubDomains: false } : false,
  } as const;

  const apiHeaders = helmet({
    ...common,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  });

  const appHeaders = helmet({
    ...common,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        mediaSrc: ["'self'"], // <video> mp4 propio servido desde /fotos/
        workerSrc: ["'self'"], // service worker del panel (/admin/sw.js): solo el propio
        manifestSrc: ["'self'"], // manifest del panel (/admin/manifest.webmanifest)
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(config.isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
  });

  return (req, res, next) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    (isApiPath(req.path) ? apiHeaders : appHeaders)(req, res, next);
  };
}

/**
 * CORS: solo los orígenes de FRONTEND_ORIGIN, con credenciales (cookie de sesión). Se refleja únicamente el
 * origen que coincide; si el Origin del pedido no está en la lista, no se emite ninguna cabecera CORS y el
 * navegador bloquea la lectura de la respuesta.
 */
export function corsPolicy(allowedOrigins: readonly string[]): RequestHandler {
  return cors({
    origin: (origin, callback) => {
      callback(null, origin !== undefined && allowedOrigins.includes(origin) ? origin : false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Retry-After'],
    maxAge: 600,
    optionsSuccessStatus: 204,
  });
}

/** Las respuestas de la API (con datos personales) no deben guardarse en cachés del navegador ni de proxies. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
