import { ApiError, request } from './client';
import { requestAdmin } from './sesion';
import { listaDeTurnosSchema, respuestaTurnoSchema, type Estado, type Turno } from './contract';
import { listaDeUsuariosSchema, respuestaSesionSchema, respuestaUsuarioSchema, type CambiosUsuario, type NuevoUsuario, type UsuarioPanel, type UsuarioSesion } from './contract-panel';

export type ResultadoSesion = { usuario: UsuarioSesion } | { usuario: null; aviso?: string };

/** GET /api/auth/me → usuario de la sesión; null con 401, o con aviso si el usuario no tiene acceso (403). */
export async function sesionActual(signal?: AbortSignal): Promise<ResultadoSesion> {
  try {
    const { usuario } = await request('/auth/me', { signal, schema: respuestaSesionSchema });
    return { usuario };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { usuario: null };
    if (error instanceof ApiError && error.status === 403) return { usuario: null, aviso: error.message };
    throw error;
  }
}

const MENSAJE_SIN_SERVICIO = 'El servicio de acceso no responde, probá en un rato.';

/** POST /api/auth/login → usuario. Las cookies de sesión las pone el backend. */
export async function iniciarSesion(email: string, password: string): Promise<UsuarioSesion> {
  try {
    const { usuario } = await request('/auth/login', {
      method: 'POST',
      body: { email, password },
      schema: respuestaSesionSchema,
    });
    return usuario;
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      throw new ApiError(503, error.code, MENSAJE_SIN_SERVICIO);
    }
    throw error;
  }
}

/** POST /api/auth/logout → 204. */
export async function cerrarSesion(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

export interface FiltroTurnos {
  estado?: Estado;
  limit: number;
  offset: number;
}

/** GET /api/admin/bookings → más nuevas primero, paginadas. */
export async function listarTurnos(
  { estado, limit, offset }: FiltroTurnos,
  signal?: AbortSignal,
): Promise<{ turnos: Turno[]; total: number }> {
  const parametros = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (estado) parametros.set('estado', estado);
  const { bookings, total } = await requestAdmin(`/admin/bookings?${parametros.toString()}`, {
    signal,
    schema: listaDeTurnosSchema,
  });
  return { turnos: bookings, total };
}

/** Cantidad de turnos en un estado (pide una sola fila y lee el total). */
export async function contarTurnos(estado: Estado, signal?: AbortSignal): Promise<number> {
  const { total } = await listarTurnos({ estado, limit: 1, offset: 0 }, signal);
  return total;
}

/** PATCH /api/admin/bookings/:id → turno actualizado. */
export async function cambiarEstado(id: string, estado: Estado): Promise<Turno> {
  const { booking } = await requestAdmin(`/admin/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { estado },
    schema: respuestaTurnoSchema,
  });
  return booking;
}

/** DELETE /api/admin/bookings/:id → 204. */
export async function eliminarTurno(id: string): Promise<void> {
  await requestAdmin(`/admin/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * GET /api/admin/usuarios (solo superadmin) → los más viejos primero, y si el servidor puede crear, borrar y
 * cambiar email o contraseña (gestionCuentas).
 */
export async function listarUsuarios(
  signal?: AbortSignal,
): Promise<{ usuarios: UsuarioPanel[]; gestionCuentas: boolean }> {
  return requestAdmin('/admin/usuarios', { signal, schema: listaDeUsuariosSchema });
}

/** POST /api/admin/usuarios → usuario creado. 409 CONFLICT si el email ya está en uso. */
export async function crearUsuario(datos: NuevoUsuario): Promise<UsuarioPanel> {
  const { usuario } = await requestAdmin('/admin/usuarios', {
    method: 'POST',
    body: datos,
    schema: respuestaUsuarioSchema,
  });
  return usuario;
}

/** DELETE /api/admin/usuarios/:id → 204. Borra la cuenta y su perfil: no se puede deshacer. */
export async function eliminarUsuario(id: string): Promise<void> {
  await requestAdmin(`/admin/usuarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** PATCH /api/admin/usuarios/:id → usuario actualizado. 409 CONFLICT trae un mensaje para mostrar. */
export async function actualizarUsuario(id: string, cambios: CambiosUsuario): Promise<UsuarioPanel> {
  const { usuario } = await requestAdmin(`/admin/usuarios/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: cambios,
    schema: respuestaUsuarioSchema,
  });
  return usuario;
}
