import type { CambiosTurno, Turno } from '../api/contract';

/**
 * Lo que dice el aviso (toast) cuando se guarda un cambio de un turno, con voseo y el primer nombre del cliente.
 * Si el pedido trae el estado, manda el estado; si no, la fecha (reprogramar) y por último la nota.
 */
export function avisoDeCambio(turno: Pick<Turno, 'nombre'>, cambios: CambiosTurno): string {
  const nombre = turno.nombre.trim().split(/\s+/)[0] ?? turno.nombre;
  if ('estado' in cambios) {
    switch (cambios.estado) {
      case 'confirmado':
        return `Confirmaste el turno de ${nombre}.`;
      case 'completado':
        return `Marcaste como completado el turno de ${nombre}.`;
      case 'cancelado':
        return `Cancelaste el turno de ${nombre}.`;
      case 'pendiente':
        return `El turno de ${nombre} volvió a pendiente.`;
    }
  }
  if ('fechaConfirmada' in cambios) return `Reprogramaste el turno de ${nombre}.`;
  return cambios.notasInternas === null ? 'Nota borrada.' : 'Nota guardada.';
}

export const avisoDeEliminacion = (turno: Pick<Turno, 'nombre'>) => {
  const nombre = turno.nombre.trim().split(/\s+/)[0] ?? turno.nombre;
  return `Eliminaste la solicitud de ${nombre}.`;
};
