import { request } from './client';
import { turnoCreadoSchema, type TurnoNuevo } from './contract';

export interface TurnoCreado {
  /** Número de solicitud que devuelve el backend, si vino. */
  id: string | null;
}

/**
 * POST /api/bookings (público). `datos` es la salida de crearEsquemaTurno().parse():
 * un objeto estricto con exactamente los campos del contrato, que se manda tal cual.
 */
export async function crearTurno(datos: TurnoNuevo): Promise<TurnoCreado> {
  const respuesta = await request('/bookings', { method: 'POST', body: datos, schema: turnoCreadoSchema });
  return { id: respuesta.booking.id ?? null };
}
