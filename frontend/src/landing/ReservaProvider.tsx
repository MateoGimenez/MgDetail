import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { esVehiculoTipo, type VehiculoTipo } from '../api/contract';
import { vehiculoInicial } from '../lib/vehiculoElegido';
import { ID_SECCION_RESERVA, ReservaContexto, type ContextoReserva, type Preseleccion } from './reserva-contexto';

function prefiereMenosMovimiento(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Último tipo elegido: sobrevive a navegar entre la landing y /servicios/:id (cada una monta su proveedor). */
let recordado: VehiculoTipo | null = null;

export function ReservaProvider({ children }: { children: ReactNode }) {
  const aplicarRef = useRef<((p: Preseleccion) => void) | null>(null);
  // Un solo tipo de vehículo para todo: selector de las cards, arranque del hero y formulario de turno.
  const [vehiculo, setVehiculo] = useState<VehiculoTipo>(() => vehiculoInicial(window.location.search, recordado));

  const elegirVehiculo = useCallback((tipo: VehiculoTipo) => {
    recordado = tipo;
    setVehiculo(tipo);
  }, []);

  const acciones = useMemo(
    () => ({
      registrar(aplicar: (p: Preseleccion) => void) {
        aplicarRef.current = aplicar;
        return () => {
          if (aplicarRef.current === aplicar) aplicarRef.current = null;
        };
      },
      reservar(preseleccion: Preseleccion = {}) {
        if (preseleccion.vehiculoTipo && esVehiculoTipo(preseleccion.vehiculoTipo)) elegirVehiculo(preseleccion.vehiculoTipo);
        document.getElementById(ID_SECCION_RESERVA)?.scrollIntoView({
          behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth',
          block: 'start',
        });
        aplicarRef.current?.(preseleccion);
      },
    }),
    [elegirVehiculo],
  );

  const valor = useMemo<ContextoReserva>(() => ({ ...acciones, vehiculo, elegirVehiculo }), [acciones, vehiculo, elegirVehiculo]);

  return <ReservaContexto value={valor}>{children}</ReservaContexto>;
}
