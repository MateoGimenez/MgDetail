import { BUSQUEDA } from '../api/contract';

/**
 * Lo que se escribió en el buscador de Turnos, ya interpretado (contrato:
 * reportes/2026-10-23_10_notas-busqueda-historial.md):
 * - vacia: no hay búsqueda, se lista la pestaña tal cual;
 * - corta: 1 carácter (recortado), todavía no se pide nada al backend;
 * - lista: de 2 a 80 caracteres, se manda como `q`.
 * Más de 80 no se puede escribir (el campo tiene maxLength), pero si llega se trata como `larga`.
 */
export type Busqueda =
  | { tipo: 'vacia' }
  | { tipo: 'corta' }
  | { tipo: 'larga' }
  | { tipo: 'lista'; q: string };

/**
 * Largo en caracteres (code points), como lo cuenta el backend (char_length): un emoji es 1, no 2. Con `.length`
 * un solo emoji contaba 2 y se mandaba una búsqueda que el backend rechaza.
 */
export const largoBusqueda = (texto: string): number => Array.from(texto).length;

export function interpretarBusqueda(texto: string): Busqueda {
  const q = texto.trim();
  if (q === '') return { tipo: 'vacia' };
  if (largoBusqueda(q) < BUSQUEDA.min) return { tipo: 'corta' };
  if (largoBusqueda(q) > BUSQUEDA.max) return { tipo: 'larga' };
  return { tipo: 'lista', q };
}

/** `q` que corresponde mandar, o undefined si no hay que filtrar (vacía, corta o larga). */
export const consultaDe = (busqueda: Busqueda): string | undefined =>
  busqueda.tipo === 'lista' ? busqueda.q : undefined;

/** Espera desde la última tecla antes de pedir: lo justo para no mandar un pedido por letra. */
export const ESPERA_BUSQUEDA_MS = 350;
