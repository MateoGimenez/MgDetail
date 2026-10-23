/**
 * Referencia corta y legible de una solicitud (los ids del backend son UUID).
 * La misma referencia se muestra al cliente y en el panel, para encontrarla.
 */
export function referenciaDeTurno(id: string): string {
  return id.replace(/[^0-9a-z]/gi, '').slice(0, 8).toUpperCase();
}

/**
 * Sello del cliente según cuántos turnos tiene con el mismo WhatsApp (contrato del historial,
 * reportes/2026-10-23_10_notas-busqueda-historial.md). null si no se puede saber (sin teléfono interpretable).
 * Con 2 o más se puede abrir el historial.
 */
export function selloDeCliente(turnosDelCliente: number | null): { texto: string; conHistorial: boolean } | null {
  if (turnosDelCliente === null || turnosDelCliente < 1) return null;
  if (turnosDelCliente === 1) return { texto: 'Primer turno', conHistorial: false };
  return { texto: `Cliente frecuente · ${String(turnosDelCliente)} turnos`, conHistorial: true };
}

/**
 * Una lista que llega del backend, con los turnos que este panel guardó después reemplazados por su versión guardada.
 * Evita que una recarga que salió antes de guardar (y llegó después) muestre la nota o el estado viejos: gana el que
 * tenga el `updatedAt` más nuevo (si el backend tiene uno más nuevo, gana el backend).
 */
export function conLoMasNuevo<T extends { id: string; updatedAt: string }>(
  turnos: readonly T[],
  guardados: ReadonlyMap<string, T>,
): T[] {
  return turnos.map((turno) => {
    const guardado = guardados.get(turno.id);
    return guardado && Date.parse(guardado.updatedAt) > Date.parse(turno.updatedAt) ? guardado : turno;
  });
}
