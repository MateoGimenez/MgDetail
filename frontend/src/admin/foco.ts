/** Lo mínimo de un elemento que puede recibir el foco (así se prueba sin DOM). */
export interface Enfocable {
  focus: () => void;
  getClientRects: () => { length: number };
}

interface Raiz<E extends Enfocable> {
  querySelectorAll: (selector: string) => Iterable<E>;
}

/** Selector de la ficha de un turno en la agenda (la tira del celular y la grilla tienen una cada una). */
export const selectorDeFicha = (idTurno: string) => `[data-turno="${idTurno.replace(/["\\]/g, '\\$&')}"]`;

/**
 * Al cerrar el detalle de la agenda el navegador devuelve el foco a la ficha que lo abrió. Si esa ficha ya no
 * está (el turno se reprogramó a otro día o franja, se canceló o se borró), el foco cae en <body> y quien usa
 * teclado pierde el lugar. Esto lo lleva a la ficha nueva del mismo turno que se vea (la otra vista está con
 * display: none) o, si ya no hay ninguna, al respaldo (el título de la agenda).
 * Devuelve true si movió el foco.
 */
export function devolverFoco<E extends Enfocable>(
  raiz: Raiz<E>,
  selector: string,
  respaldo: Enfocable | null,
  focoPerdido: boolean,
): boolean {
  if (!focoPerdido) return false;
  for (const elemento of raiz.querySelectorAll(selector)) {
    if (elemento.getClientRects().length > 0) {
      elemento.focus();
      return true;
    }
  }
  if (!respaldo) return false;
  respaldo.focus();
  return true;
}

/** Selector del botón "Ver historial" de un turno (el diálogo del historial le devuelve el foco al cerrarse). */
export const selectorDeHistorial = (idTurno: string) => `[data-historial="${idTurno.replace(/["\\]/g, '\\$&')}"]`;
