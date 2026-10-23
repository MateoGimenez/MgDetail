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
  | 'FORBIDDEN'
  | 'NO_ACCESS'
  | 'UNAUTHORIZED'
  | 'SESSION_EXPIRED'
  | 'INVALID_CREDENTIALS'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SERVICIO_EXISTE'
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

  /** El access token venció; el frontend tiene que llamar a POST /api/auth/refresh y reintentar una vez. */
  static sessionExpired(): AppError {
    return new AppError(401, 'SESSION_EXPIRED', 'Tu sesión venció. Estamos renovándola; si no se renueva, iniciá sesión de nuevo.');
  }

  /** Autenticado y con acceso al panel, pero su rol no permite esta acción. La sesión sigue. */
  static forbidden(message = 'No tenés permiso para hacer esto.'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  /**
   * Sesión válida, pero el usuario ya no tiene acceso al panel (desactivado o sin perfil): se borran las cookies y el
   * frontend vuelve al ingreso. Distinto de FORBIDDEN (rol sin permiso), sin tener que preguntar a /auth/me.
   */
  static noAccess(): AppError {
    return new AppError(403, 'NO_ACCESS', 'Tu usuario no tiene acceso al panel. Pedile al administrador que lo habilite.');
  }

  /** La operación choca con una regla de negocio (ej.: quedarse sin ningún superadmin). */
  static conflict(message: string, fields?: Record<string, string>): AppError {
    return new AppError(409, 'CONFLICT', message, fields);
  }

  /** POST /api/admin/servicios con un id (slug) que ya existe, activo o no. */
  static servicioExiste(): AppError {
    const message = 'Ya existe un servicio con ese identificador. Elegí otro.';
    return new AppError(409, 'SERVICIO_EXISTE', message, { id: message });
  }

  static invalidCredentials(): AppError {
    return new AppError(401, 'INVALID_CREDENTIALS', 'El email o la contraseña no son correctos, o tu usuario todavía no está habilitado para el panel.');
  }

  static forbiddenOrigin(): AppError {
    return new AppError(403, 'FORBIDDEN_ORIGIN', 'No podemos procesar la solicitud desde este sitio.');
  }

  static notFound(message = 'No encontramos lo que buscás.'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static serviceUnavailable(
    message = 'El servicio no está disponible en este momento. Probá de nuevo en unos minutos.',
  ): AppError {
    return new AppError(503, 'SERVICE_UNAVAILABLE', message);
  }

  static rateLimited(message: string): AppError {
    return new AppError(429, 'RATE_LIMITED', message);
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
