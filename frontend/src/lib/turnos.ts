/**
 * Referencia corta y legible de una solicitud (los ids del backend son UUID).
 * La misma referencia se muestra al cliente y en el panel, para encontrarla.
 */
export function referenciaDeTurno(id: string): string {
  return id.replace(/[^0-9a-z]/gi, '').slice(0, 8).toUpperCase();
}
