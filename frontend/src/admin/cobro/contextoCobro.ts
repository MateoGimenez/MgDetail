import { createContext, useContext } from 'react';
import type { VehiculoTipo } from '../../api/contract';

/**
 * Lo que la tarjeta de un turno necesita para completar con cobro y que el panel ya sabe: quién está logueado (es el
 * trabajador por defecto), el "Desde" de cada servicio (se sugiere como monto) y qué hacer si la sesión vence.
 * Lo provee Panel; fuera de él (pruebas) quedan los valores neutros de abajo.
 */
export interface DatosDeCobro {
  usuarioId: string | null;
  /**
   * "Desde" del servicio para ese tipo de vehículo, en pesos, o null si no está cargado (o el servicio ya no existe).
   * Nunca cae al precio de auto: si falta el del tipo del turno, no se sugiere nada.
   */
  precioDesde: (servicioId: string, vehiculoTipo: VehiculoTipo) => number | null;
  alVencerSesion: (mensaje: string) => void;
}

export const ContextoCobro = createContext<DatosDeCobro>({
  usuarioId: null,
  precioDesde: () => null,
  alVencerSesion: () => undefined,
});

export const useDatosDeCobro = () => useContext(ContextoCobro);
