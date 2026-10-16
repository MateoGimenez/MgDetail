/**
 * Errores de la API. Todo error que llega al cliente tiene la forma:
 *   { "error": { "code": string, "message": string, "fields"?: Record<string, string> } }
 * Los mensajes están en español rioplatense y listos para mostrar al usuario.
 * Nunca se incluyen stack traces ni detalles internos.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'FORBIDDEN_ORIGIN'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static validation(fields?: Record<string, string>, message = 'Revisá los datos ingresados.'): AppError {
    const hasFields = fields !== undefined && Object.keys(fields).length > 0;
    return new AppError(400, 'VALIDATION_ERROR', message, hasFields ? fields : undefined);
  }

  static unauthorized(): AppError {
    return new AppError(401, 'UNAUTHORIZED', 'Tu sesión no es válida o venció. Iniciá sesión de nuevo.');
  }

  static invalidCredentials(): AppError {
    return new AppError(401, 'INVALID_CREDENTIALS', 'El email o la contraseña no son correctos.');
  }

  static forbiddenOrigin(): AppError {
    return new AppError(403, 'FORBIDDEN_ORIGIN', 'No podemos procesar la solicitud desde este sitio.');
  }

  static notFound(message = 'No encontramos lo que buscás.'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static serviceUnavailable(): AppError {
    return new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'El servicio no está disponible en este momento. Probá de nuevo en unos minutos.',
    );
  }

  static unsupportedMediaType(): AppError {
    return new AppError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'El formato de la solicitud no es válido. Tiene que enviarse como JSON.',
    );
  }
}

export function errorBody(code: ErrorCode, message: string, fields?: Record<string, string>): ErrorBody {
  return { error: fields ? { code, message, fields } : { code, message } };
}
