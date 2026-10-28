import { ApiError, esAbortado } from './client';
import { SesionPerdidaError, esSesionPerdida, refrescarSesion } from './sesion';

/**
 * Baja un PDF del backend (presupuestos y comprobantes) como Blob. Va por acá y no por `request()` porque la
 * respuesta no es JSON. Misma lógica de sesión que el resto del panel: un 401 SESSION_EXPIRED refresca una vez y
 * reintenta; si no se puede, la sesión se da por perdida.
 *
 * Los errores del backend vienen como `{ error: { code, message } }`: se leen para mostrar el mensaje.
 */

const BASE = '/api';
const TIPO_PDF = 'application/pdf';

async function leerFalla(respuesta: Response): Promise<ApiError> {
  let codigo = `HTTP_${String(respuesta.status)}`;
  let mensaje: string | undefined;
  let campos: Record<string, string> | undefined;
  try {
    const datos: unknown = JSON.parse(await respuesta.text());
    const error = typeof datos === 'object' && datos !== null && 'error' in datos ? (datos.error as Record<string, unknown>) : null;
    if (error) {
      if (typeof error.code === 'string') codigo = error.code;
      if (typeof error.message === 'string' && error.message.trim() !== '') mensaje = error.message;
      const fields = error.fields;
      if (typeof fields === 'object' && fields !== null && Object.values(fields).every((v) => typeof v === 'string')) {
        campos = fields as Record<string, string>;
      }
    }
  } catch {
    // Cuerpo vacío o que no es JSON: queda el mensaje por estado.
  }
  const porEstado =
    respuesta.status === 401
      ? 'Tu sesión venció. Ingresá de nuevo.'
      : respuesta.status === 403
        ? 'No tenés permiso para hacer esto.'
        : respuesta.status === 404
          ? 'Ya no encontramos ese documento.'
          : respuesta.status === 429
            ? 'Hubo muchos intentos seguidos. Esperá un momento y probá de nuevo.'
            : 'No pudimos armar el PDF. Probá de nuevo en unos minutos.';
  return new ApiError(respuesta.status, codigo, mensaje ?? porEstado, campos);
}

async function pedir(ruta: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(`${BASE}${ruta}`, { method: 'GET', headers: { Accept: TIPO_PDF }, signal, credentials: 'same-origin' });
  } catch {
    if (signal?.aborted) throw new DOMException('Pedido cancelado', 'AbortError');
    throw new ApiError(0, 'NETWORK_ERROR', 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.');
  }
}

/** `ruta` va sin el prefijo /api, como el resto (por ejemplo `/admin/presupuestos/<id>/pdf`). */
export async function descargarPdf(ruta: string, signal?: AbortSignal): Promise<Blob> {
  let respuesta = await pedir(ruta, signal);
  if (respuesta.status === 401) {
    const falla = await leerFalla(respuesta);
    if (falla.code !== 'SESSION_EXPIRED') throw new SesionPerdidaError(falla.status, falla.code, falla.message);
    if (!(await refrescarSesion())) throw new SesionPerdidaError(falla.status, falla.code, 'Tu sesión venció. Ingresá de nuevo.');
    respuesta = await pedir(ruta, signal);
  }
  if (!respuesta.ok) {
    const falla = await leerFalla(respuesta);
    throw esSesionPerdida(falla) ? new SesionPerdidaError(falla.status, falla.code, falla.message, falla.fields) : falla;
  }
  const tipo = respuesta.headers.get('Content-Type') ?? '';
  if (!tipo.toLowerCase().startsWith(TIPO_PDF)) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'Recibimos una respuesta inesperada del servidor. Probá de nuevo en unos minutos.');
  }
  let blob: Blob;
  try {
    blob = await respuesta.blob();
  } catch (error) {
    if (esAbortado(error)) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Se cortó la descarga. Probá de nuevo.');
  }
  if (blob.size === 0) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'El PDF llegó vacío. Probá de nuevo en unos minutos.');
  }
  return blob.type === TIPO_PDF ? blob : new Blob([blob], { type: TIPO_PDF });
}
