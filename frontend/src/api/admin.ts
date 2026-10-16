import { ApiError, request } from './client';
import {
  listaDeTurnosSchema,
  respuestaAdminSchema,
  respuestaTurnoSchema,
  type Estado,
  type Turno,
} from './contract';

/** GET /api/auth/me → email del admin, o null si no hay sesión (401). */
export async function sesionActual(signal?: AbortSignal): Promise<string | null> {
  try {
    const { admin } = await request('/auth/me', { signal, schema: respuestaAdminSchema });
    return admin.email;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** POST /api/auth/login → email del admin. La cookie de sesión la pone el backend. */
export async function iniciarSesion(email: string, password: string): Promise<string> {
  const { admin } = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
    schema: respuestaAdminSchema,
  });
  return admin.email;
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
  const { bookings, total } = await request(`/admin/bookings?${parametros.toString()}`, {
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
  const { booking } = await request(`/admin/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { estado },
    schema: respuestaTurnoSchema,
  });
  return booking;
}

/** DELETE /api/admin/bookings/:id → 204. */
export async function eliminarTurno(id: string): Promise<void> {
  await request(`/admin/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
