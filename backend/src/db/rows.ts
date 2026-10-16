import type { SQLOutputValue } from 'node:sqlite';

/**
 * Lectura tipada de filas de node:sqlite. En vez de castear (`row as Booking`), cada columna se
 * verifica en tiempo de ejecución: si el esquema y el código se desalinean, falla fuerte y claro.
 */
export type Row = Record<string, SQLOutputValue>;

export function str(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new TypeError(`La columna "${key}" debería ser texto`);
  }
  return value;
}

export function strOrNull(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new TypeError(`La columna "${key}" debería ser texto o null`);
  }
  return value;
}

export function int(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== 'number') {
    throw new TypeError(`La columna "${key}" debería ser numérica`);
  }
  return value;
}

export function oneOf<T extends string>(allowed: readonly T[], row: Row, key: string): T {
  const value = str(row, key);
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new TypeError(`La columna "${key}" tiene un valor inesperado`);
  }
  return match;
}
