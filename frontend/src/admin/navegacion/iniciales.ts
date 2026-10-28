/** Una o dos letras para el avatar: iniciales de las dos primeras palabras del nombre (o la primera letra del mail). */
export function iniciales(texto: string): string {
  const palabras = texto
    .split(/[\s@._-]+/)
    .map((p) => p.trim())
    .filter((p) => /^\p{L}/u.test(p));
  const letras = palabras.slice(0, 2).map((p) => Array.from(p)[0] ?? '');
  const resultado = letras.join('').toLocaleUpperCase('es-AR');
  return resultado || '?';
}
