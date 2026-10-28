/**
 * El id de la sección a la que apunta un `#hash`, o null si no apunta a ninguna. Un hash mal codificado
 * (`#%E0%A4%A`) no puede romper la página: se usa tal cual vino.
 */
export function idDeHash(hash: string): string | null {
  if (hash.length <= 1) return null;
  const crudo = hash.slice(1);
  try {
    return decodeURIComponent(crudo);
  } catch {
    return crudo;
  }
}
