import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Solo se compara el media type; el charset lo resuelve express.json. */
function isJsonContentType(header: string | undefined): boolean {
  return header?.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

/**
 * Defensa CSRF para POST/PUT/PATCH/DELETE (se suma a SameSite=Strict de la cookie):
 *  1. Si el pedido trae `Origin`, tiene que ser EXACTAMENTE uno de los FRONTEND_ORIGIN (si no: 403 FORBIDDEN_ORIGIN).
 *     Los navegadores siempre mandan Origin en pedidos cross-origin; su ausencia indica un cliente que no es
 *     un navegador (curl, scripts), que no está expuesto a CSRF.
 *  2. Exige `Content-Type: application/json` (si no: 415). Un formulario HTML de otro sitio no puede
 *     enviar ese tipo sin pasar por un preflight CORS, que la política CORS rechaza.
 * Los pedidos sin body (logout, delete) también deben declarar el Content-Type; el body vacío se acepta.
 */
export function requestGuard(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    if (!STATE_CHANGING_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins.includes(origin)) {
      next(AppError.forbiddenOrigin());
      return;
    }
    if (!isJsonContentType(req.headers['content-type'])) {
      next(AppError.unsupportedMediaType());
      return;
    }
    next();
  };
}
