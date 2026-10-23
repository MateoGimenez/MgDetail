import { NOTA_MAXIMO, PROHIBIDO_VARIAS_LINEAS } from '../api/contract';

/**
 * Nota interna de un turno (contrato: reportes/2026-10-23_10_notas-busqueda-historial.md): texto libre hasta 1000
 * caracteres, con saltos de línea; vacía o solo espacios → null. El backend vuelve a controlar todo.
 */
export type NotaValidada = { valor: string | null } | { error: string };

export function validarNota(texto: string): NotaValidada {
  const recortada = texto.trim();
  if (recortada === '') return { valor: null };
  if (recortada.length > NOTA_MAXIMO) {
    return { error: `La nota puede tener hasta ${String(NOTA_MAXIMO)} caracteres.` };
  }
  if (PROHIBIDO_VARIAS_LINEAS.test(recortada)) return { error: 'La nota tiene caracteres que no se permiten.' };
  return { valor: recortada };
}
