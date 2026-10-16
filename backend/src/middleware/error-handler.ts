import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, errorBody, type ErrorBody } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

/** 404 JSON para cualquier ruta que no exista (/api/... desconocida, o cualquier ruta si no se sirve el frontend). */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound());
};

interface HttpErrorInfo {
  status: number;
  type: string | undefined;
}

/** Errores de body-parser / Express: traen `status` (o `statusCode`) y a veces `type`. */
function readHttpError(error: unknown): HttpErrorInfo | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { status, statusCode, type } = error as { status?: unknown; statusCode?: unknown; type?: unknown };
  const code = typeof status === 'number' ? status : typeof statusCode === 'number' ? statusCode : undefined;
  if (code === undefined || code < 400 || code > 599) return undefined;
  return { status: code, type: typeof type === 'string' ? type : undefined };
}

interface Translated {
  status: number;
  body: ErrorBody;
  /** true si es un error nuestro (5xx) que hay que registrar. */
  unexpected: boolean;
}

function translate(error: unknown): Translated {
  if (error instanceof AppError) {
    return { status: error.status, body: errorBody(error.code, error.message, error.fields), unexpected: false };
  }

  const http = readHttpError(error);
  if (http) {
    switch (http.type) {
      case 'entity.parse.failed':
        return {
          status: 400,
          body: errorBody('INVALID_JSON', 'No pudimos leer los datos enviados: el JSON no es válido.'),
          unexpected: false,
        };
      case 'entity.too.large':
        return {
          status: 413,
          body: errorBody('PAYLOAD_TOO_LARGE', 'Los datos enviados son demasiado grandes.'),
          unexpected: false,
        };
      case 'charset.unsupported':
      case 'encoding.unsupported':
        return {
          status: 415,
          body: errorBody('UNSUPPORTED_MEDIA_TYPE', 'El formato de la solicitud no es válido. Tiene que enviarse como JSON.'),
          unexpected: false,
        };
      default:
        if (http.status < 500) {
          // Otros 4xx de Express (ej.: URL con % mal formado). Mensaje genérico, sin detalles internos.
          return {
            status: 400,
            body: errorBody('VALIDATION_ERROR', 'La solicitud no es válida.'),
            unexpected: false,
          };
        }
    }
  }

  return {
    status: 500,
    body: errorBody('INTERNAL_ERROR', 'Ocurrió un error inesperado. Probá de nuevo en unos minutos.'),
    unexpected: true,
  };
}

/**
 * Manejador central de errores. Al cliente solo le llega { error: { code, message, fields? } }.
 * Los errores inesperados se registran en el log del servidor (con stack), nunca en la respuesta.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) {
      next(error); // ya se empezó a responder: Express cierra la conexión
      return;
    }
    const { status, body, unexpected } = translate(error);
    if (unexpected) {
      const path = req.originalUrl.split('?')[0] ?? '';
      logger.error(`Error inesperado en ${req.method} ${path.slice(0, 200)}`, error);
    }
    res.status(status).json(body);
  };
}
