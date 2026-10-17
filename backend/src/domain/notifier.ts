import type { Booking } from './booking.js';

/**
 * Puerto de avisos al dueño cuando entra un turno nuevo. Si no puede avisar, la promesa se rechaza
 * (con `NotifyError` si el proveedor respondió un status); quien la llama decide qué hacer (el servicio de turnos
 * solo lo registra en el log: un aviso fallido nunca debe afectar al cliente).
 */
export interface BookingNotifier {
  notifyNewBooking(booking: Booking): Promise<void>;
}

/** El proveedor de avisos respondió con un error HTTP. Nunca incluye URL, token ni texto del mensaje. */
export class NotifyError extends Error {
  constructor(readonly status: number) {
    super(`El proveedor de avisos respondió ${String(status)}`);
    this.name = 'NotifyError';
  }
}
