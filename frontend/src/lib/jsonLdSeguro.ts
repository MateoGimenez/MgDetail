/** Barra invertida: se arma con su código para que el escape de abajo no se confunda con un "<" literal. */
const BARRA = String.fromCharCode(92);

/**
 * JSON listo para ir dentro de un `<script type="application/ld+json">`: ningún dato puede cerrar la etiqueta.
 * Cada "<" pasa a ser el texto de seis caracteres BARRA + "u003c" (sigue siendo JSON válido y equivalente).
 */
export function jsonLdSeguro(datos: unknown): string {
  return JSON.stringify(datos).replace(/</g, `${BARRA}u003c`);
}
