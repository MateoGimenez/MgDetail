/**
 * Lectura tipada de filas (node-postgres y PGlite). En vez de castear (`row as Booking`), cada columna se
 * verifica en tiempo de ejecución: si el esquema y el código se desalinean, falla fuerte y claro.
 */
export type Row = Readonly<Record<string, unknown>>;

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
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`La columna "${key}" debería ser un entero`);
  }
  return value;
}

/** Entero o null (una columna integer nullable). */
export function intOrNull(row: Row, key: string): number | null {
  return row[key] === null ? null : int(row, key);
}

export function bool(row: Row, key: string): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') {
    throw new TypeError(`La columna "${key}" debería ser booleana`);
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

/**
 * Fecha y hora en ISO 8601 UTC (`2026-10-16T15:00:00.000Z`), el formato del contrato. Postgres devuelve los
 * `timestamptz` como Date (se acepta también texto ISO).
 */
export function isoTimestamp(row: Row, key: string): string {
  const value = row[key];
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : undefined;
  if (date === undefined || Number.isNaN(date.getTime())) {
    throw new TypeError(`La columna "${key}" debería ser una fecha y hora`);
  }
  return date.toISOString();
}
