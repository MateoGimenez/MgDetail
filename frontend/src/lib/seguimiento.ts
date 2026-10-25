import type { Estado } from '../api/contract';

/**
 * Línea de tiempo de la página de seguimiento (/turno/:id): Recibido → Confirmado → Listo; o Recibido → Cancelado.
 */
export interface Paso {
  texto: string;
  /** El turno ya pasó por acá (incluye el paso actual). */
  alcanzado: boolean;
  /** Es el estado de ahora. */
  actual: boolean;
}

const PASO_ACTUAL: Readonly<Record<Estado, number>> = { pendiente: 0, confirmado: 1, completado: 2, cancelado: 1 };

export function pasosDelTurno(estado: Estado): Paso[] {
  const textos = estado === 'cancelado' ? ['Recibido', 'Cancelado'] : ['Recibido', 'Confirmado', 'Listo'];
  const actual = PASO_ACTUAL[estado];
  return textos.map((texto, i) => ({ texto, alcanzado: i <= actual, actual: i === actual }));
}

/** Cómo se rotula la fecha según el estado: lo pedido todavía puede cambiar al confirmarse. */
export const ETIQUETA_FECHA_SEGUIMIENTO: Readonly<Record<Estado, string>> = {
  pendiente: 'Día pedido',
  confirmado: 'Día del turno',
  completado: 'Fue el',
  cancelado: 'Era para el',
};
