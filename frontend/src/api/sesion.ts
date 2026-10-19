import { ApiError, ejecutar, validarRespuesta, type Opciones } from './client';

/**
 * Sesión del panel (Supabase Auth en modo BFF, cookies httpOnly). Solo lo usa /admin,
 * así la landing no lo descarga.
 * - 401 SESSION_EXPIRED en /api/admin/* → un único POST /api/auth/refresh, compartido
 *   entre todos los pedidos que fallen a la vez; si sale bien, se reintenta el pedido
 *   (una sola vez). Si no, el error queda marcado como sesión perdida.
 * - 403 NO_ACCESS: el usuario ya no tiene acceso al panel (desactivado): sesión perdida.
 * - 403 FORBIDDEN: su rol no permite esa acción; la sesión sigue y se muestra el mensaje.
 */

let refrescoEnCurso: Promise<boolean> | null = null;

/** POST /api/auth/refresh una sola vez aunque lo pidan varios pedidos a la vez. */
export function refrescarSesion(): Promise<boolean> {
  refrescoEnCurso ??= ejecutar('/auth/refresh', 'POST', undefined)
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      refrescoEnCurso = null;
    });
  return refrescoEnCurso;
}

/** Error que obliga a volver al ingreso del panel. */
export class SesionPerdidaError extends ApiError {}

const sesionPerdida = (error: ApiError, mensaje = error.message) =>
  new SesionPerdidaError(error.status, error.code, mensaje, error.fields);

/** true si hay que volver a iniciar sesión (401 sin refresco posible, o 403 NO_ACCESS). */
export function esSesionPerdida(error: unknown): error is ApiError {
  return (
    error instanceof SesionPerdidaError ||
    (error instanceof ApiError && (error.status === 401 || error.code === 'NO_ACCESS'))
  );
}

/** Como request(), pero para /api/admin/*: refresca la sesión vencida y marca la sesión perdida. */
export async function requestAdmin<T = void>(ruta: string, opciones: Opciones<T> = {}): Promise<T> {
  const { method = 'GET', body, signal, schema } = opciones;

  let datos: unknown;
  try {
    datos = await ejecutar(ruta, method, body, signal);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    if (error.status === 401 && error.code === 'SESSION_EXPIRED') {
      if (!(await refrescarSesion())) throw sesionPerdida(error, 'Tu sesión venció. Ingresá de nuevo.');
      try {
        datos = await ejecutar(ruta, method, body, signal);
      } catch (reintento) {
        if (reintento instanceof ApiError && esSesionPerdida(reintento)) throw sesionPerdida(reintento);
        throw reintento;
      }
    } else if (esSesionPerdida(error)) {
      throw sesionPerdida(error);
    } else {
      throw error;
    }
  }
  return validarRespuesta(datos, schema);
}
