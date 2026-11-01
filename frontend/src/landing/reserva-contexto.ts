import { createContext, useContext } from 'react';
import type { ServicioId, VehiculoTipo } from '../api/contract';

export interface Preseleccion {
  servicioId?: ServicioId;
  vehiculoTipo?: VehiculoTipo;
}

type Aplicar = (preseleccion: Preseleccion) => void;

export interface ContextoReserva {
  /** El formulario se registra para recibir preselecciones. Devuelve la función para darse de baja. */
  registrar: (aplicar: Aplicar) => () => void;
  /** Tipo de vehículo elegido: es el mismo para las cards, el arranque del hero y el formulario (por defecto, auto). */
  vehiculo: VehiculoTipo;
  elegirVehiculo: (tipo: VehiculoTipo) => void;
  /** Lleva al formulario y, si se indica, deja elegidos el servicio y el vehículo. */
  reservar: (preseleccion?: Preseleccion) => void;
}

export const ReservaContexto = createContext<ContextoReserva | null>(null);

export function useReserva(): ContextoReserva {
  const contexto = useContext(ReservaContexto);
  if (!contexto) throw new Error('useReserva tiene que usarse dentro de <ReservaProvider>.');
  return contexto;
}

export const ID_SECCION_RESERVA = 'reservar';
