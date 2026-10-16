import type { RequestHandler } from 'express';
import type { Logger } from '../lib/logger.js';

const MAX_LOGGED_PATH = 200;

/** Ruta sin query string (puede traer datos personales) y acotada. */
function pathOnly(url: string): string {
  const queryStart = url.indexOf('?');
  const path = queryStart === -1 ? url : url.slice(0, queryStart);
  return path.length > MAX_LOGGED_PATH ? `${path.slice(0, MAX_LOGGED_PATH)}…` : path;
}

/**
 * Una línea por request: método, ruta sin query, status y milisegundos.
 * Nunca se loguean bodies, headers, cookies ni la IP del visitante.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.info(`${req.method} ${pathOnly(req.originalUrl)} ${String(res.statusCode)} ${elapsedMs.toFixed(1)}ms`);
    });
    next();
  };
}
