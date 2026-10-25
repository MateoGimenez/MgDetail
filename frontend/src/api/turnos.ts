import { ApiError, request } from './client';
import {
  ID_TURNO,
  disponibilidadSchema,
  esRutaDeSeguimiento,
  seguimientoSchema,
  turnoCreadoSchema,
  type DiaDisponible,
  type TurnoNuevo,
  type TurnoSeguido,
} from './contract';

export interface TurnoCreado {
  /** Número de solicitud que devuelve el backend, si vino. */
  id: string | null;
  /** Ruta relativa de la página de seguimiento (/turno/<id>), o null si no se pudo armar. */
  seguimiento: string | null;
}

/** Ruta de seguimiento de un turno: /turno/<id>. */
export const rutaDeSeguimiento = (id: string) => `/turno/${encodeURIComponent(id)}`;

/**
 * POST /api/bookings (público). `datos` es la salida de crearEsquemaTurno().parse():
 * un objeto estricto con exactamente los campos del contrato, que se manda tal cual.
 *
 * Errores del contrato de disponibilidad: 400 con `fields.fechaPreferida` si el día está cerrado y 409
 * `FRANJA_LLENA` con `fields.franja` si la franja se llenó. Los dos llegan como ApiError con sus campos.
 */
export async function crearTurno(datos: TurnoNuevo): Promise<TurnoCreado> {
  const respuesta = await request('/bookings', { method: 'POST', body: datos, schema: turnoCreadoSchema });
  const id = respuesta.booking.id ?? null;
  const ruta = respuesta.seguimientoUrl ?? respuesta.booking.seguimientoUrl;
  const seguimiento =
    ruta !== undefined && esRutaDeSeguimiento(ruta) ? ruta : id !== null && ID_TURNO.test(id) ? rutaDeSeguimiento(id) : null;
  return { id, seguimiento };
}

/**
 * GET /api/disponibilidad (público) → días de hoy a hoy + 60 (o del rango pedido, de hasta 62 días) con si se
 * atiende y si queda lugar a la mañana y a la tarde. Nunca trae cantidades.
 */
export async function consultarDisponibilidad(
  rango: { desde: string; hasta: string } | null,
  signal?: AbortSignal,
): Promise<DiaDisponible[]> {
  const consulta = rango ? `?${new URLSearchParams(rango).toString()}` : '';
  const { dias } = await request(`/disponibilidad${consulta}`, { signal, schema: disponibilidadSchema });
  return dias;
}

/**
 * GET /api/turnos/:id (público) → lo que el cliente puede ver de su turno, o null si no existe. Un id con formato
 * inválido da el mismo null sin preguntarle al backend (que respondería el mismo 404).
 */
export async function consultarTurno(id: string, signal?: AbortSignal): Promise<TurnoSeguido | null> {
  if (!ID_TURNO.test(id)) return null;
  try {
    const { turno } = await request(`/turnos/${encodeURIComponent(id)}`, { signal, schema: seguimientoSchema });
    return turno;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
