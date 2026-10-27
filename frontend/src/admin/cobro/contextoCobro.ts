import { createContext, useContext } from 'react';

/**
 * Lo que la tarjeta de un turno necesita para completar con cobro y que el panel ya sabe: quién está logueado (es el
 * trabajador por defecto), el "Desde" de cada servicio (se sugiere como monto) y qué hacer si la sesión vence.
 * Lo provee Panel; fuera de él (pruebas) quedan los valores neutros de abajo.
 */
export interface DatosDeCobro {
  usuarioId: string | null;
  /** "Desde" del servicio en pesos, o null si no está cargado (o el servicio ya no existe). */
  precioDesde: (servicioId: string) => number | null;
  alVencerSesion: (mensaje: string) => void;
}

export const ContextoCobro = createContext<DatosDeCobro>({
  usuarioId: null,
  precioDesde: () => null,
  alVencerSesion: () => undefined,
});

export const useDatosDeCobro = () => useContext(ContextoCobro);
