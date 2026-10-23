import * as z from 'zod/mini';

/**
 * Único punto de salida a la red de toda la app (no usar fetch fuera de src/api/).
 * - URL relativa bajo /api (en desarrollo, Vite la pasa al backend).
 * - POST, PUT, PATCH y DELETE van SIEMPRE con Content-Type: application/json,
 *   aunque no haya datos: el backend lo exige como defensa CSRF (si falta, 415).
 * - 204 sin leer el cuerpo; cuerpos que no son JSON (un 502 del proxy) y
 *   fallas de red terminan en un ApiError con un mensaje en español.
 *
 * La lógica de sesión del panel (refresh y 403) está en sesion.ts, que solo carga /admin.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Readonly<Record<string, string>> | undefined;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function esAbortado(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Opciones<T> {
  method?: Metodo;
  body?: unknown;
  signal?: AbortSignal;
  /** Esquema de la respuesta. Sin esquema, la respuesta se descarta. */
  schema?: z.ZodMiniType<T>;
}

const BASE = '/api';

function mensajePorEstado(status: number): string {
  if (status === 401) return 'Tu sesión venció. Ingresá de nuevo.';
  if (status === 403) return 'No tenés permiso para hacer esto.';
  if (status === 404) return 'No encontramos lo que buscabas.';
  if (status === 429) return 'Hubo muchos intentos seguidos. Esperá un momento y probá de nuevo.';
  if (status === 502 || status === 503 || status === 504) {
    return 'No pudimos comunicarnos con el servidor. Probá de nuevo en unos minutos.';
  }
  if (status >= 500) return 'El servidor tuvo un problema. Probá de nuevo en unos minutos.';
  return 'Algo salió mal. Probá de nuevo.';
}

function esRegistroDeTextos(valor: unknown): valor is Record<string, string> {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    !Array.isArray(valor) &&
    Object.values(valor).every((v) => typeof v === 'string')
  );
}

/** Lee `{ error: { code, message, fields } }` sin confiar en la forma. */
function leerError(datos: unknown): { code?: string; message?: string; fields?: Record<string, string> } {
  if (typeof datos !== 'object' || datos === null || !('error' in datos)) return {};
  const error: unknown = datos.error;
  if (typeof error !== 'object' || error === null) return {};
  const { code, message, fields } = error as Record<string, unknown>;
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' && message.trim() !== '' ? message : undefined,
    fields: esRegistroDeTextos(fields) ? fields : undefined,
  };
}

/** Un pedido HTTP, sin lógica de sesión. Devuelve el JSON ya leído (o null). */
export async function ejecutar(ruta: string, method: Metodo, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let cuerpo: string | undefined;
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (body !== undefined) cuerpo = JSON.stringify(body);
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, { method, headers, body: cuerpo, signal, credentials: 'same-origin' });
  } catch {
    if (signal?.aborted) throw new DOMException('Pedido cancelado', 'AbortError');
    throw new ApiError(0, 'NETWORK_ERROR', 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.');
  }

  if (respuesta.status === 204) return null;

  let datos: unknown = null;
  const texto = await respuesta.text().catch(() => '');
  if (texto !== '') {
    try {
      datos = JSON.parse(texto);
    } catch {
      datos = null;
    }
  }

  if (!respuesta.ok) {
    const error = leerError(datos);
    throw new ApiError(
      respuesta.status,
      error.code ?? `HTTP_${String(respuesta.status)}`,
      error.message ?? mensajePorEstado(respuesta.status),
      error.fields,
    );
  }
  return datos;
}

export async function request<T = void>(ruta: string, opciones: Opciones<T> = {}): Promise<T> {
  const { method = 'GET', body, signal, schema } = opciones;
  return validarRespuesta(await ejecutar(ruta, method, body, signal), schema);
}

/** Valida la respuesta con su esquema (sin esquema, se descarta). */
export function validarRespuesta<T>(datos: unknown, schema: z.ZodMiniType<T> | undefined): T {
  if (!schema) return undefined as T;
  const resultado = z.safeParse(schema, datos);
  if (!resultado.success) {
    throw new ApiError(
      200,
      'INVALID_RESPONSE',
      'Recibimos una respuesta inesperada del servidor. Probá de nuevo en unos minutos.',
    );
  }
  return resultado.data;
}
