import type { RefObject } from 'react';
import { ETIQUETA_VEHICULO, type VehiculoTipo } from '../api/contract';
import type { ServicioPanel } from '../api/contract-panel';
import { Icono } from '../components/Icono';

export interface QuitarDe {
  servicio: ServicioPanel;
  tipo: VehiculoTipo;
}

interface Props {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  pedido: QuitarDe | null;
  alConfirmar: (pedido: QuitarDe) => void;
  alCerrar: () => void;
}

/**
 * Confirma «Quitar de [vehículo]». Deja claro que NO elimina el servicio: sigue en los otros vehículos y se conserva
 * el precio cargado. El foco arranca en "No, volver" (la acción segura).
 */
export function DialogoQuitarVehiculo({ dialogoRef, pedido, alConfirmar, alCerrar }: Props) {
  const vehiculo = pedido ? ETIQUETA_VEHICULO[pedido.tipo].toLowerCase() : '';
  return (
    <dialog
      ref={dialogoRef}
      className="confirmar"
      aria-labelledby="quitar-titulo"
      aria-describedby="quitar-texto"
      onClose={alCerrar}
    >
      <h2 id="quitar-titulo" className="confirmar__titulo">
        ¿Quitar {pedido?.servicio.nombre ?? 'el servicio'} de {vehiculo}?
      </h2>
      <p id="quitar-texto" className="confirmar__texto">
        Deja de ofrecerse para {vehiculo}: no aparece en la web ni en el formulario de turnos para ese vehículo. No se
        elimina el servicio: sigue para los otros vehículos y se conserva el precio cargado, por si lo volvés a
        ofrecer desde «Editar».
      </p>
      <div className="confirmar__acciones">
        <button
          type="button"
          className="boton boton--secundario"
          onClick={() => {
            dialogoRef.current?.close();
          }}
        >
          No, volver
        </button>
        <button
          type="button"
          className="boton boton--peligro"
          onClick={() => {
            if (pedido) alConfirmar(pedido);
            dialogoRef.current?.close();
          }}
        >
          <Icono nombre="cerrar" tamano={18} />
          Sí, quitar de {vehiculo}
        </button>
      </div>
    </dialog>
  );
}
