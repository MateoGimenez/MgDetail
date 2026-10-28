/**
 * Scrollspy del nav: qué sección de la página es la "actual". Lógica pura; el hook que mide las posiciones y
 * observa el scroll está en landing/useSeccionActiva.ts.
 */

export interface PosicionSeccion {
  readonly id: string;
  /** Borde superior respecto del viewport (getBoundingClientRect().top). */
  readonly top: number;
  /** Borde inferior respecto del viewport. */
  readonly bottom: number;
}

/**
 * La sección que ocupa la línea de lectura (`linea`, en px desde el borde superior del viewport: justo debajo de la
 * cabecera fija). null si la línea cae en el hero, en el espacio entre secciones del menú o después de todas.
 * Si dos secciones se superponen en la línea, gana la que empieza más abajo (la última del documento).
 */
export function elegirSeccionActiva(secciones: readonly PosicionSeccion[], linea: number): string | null {
  let elegida: PosicionSeccion | null = null;
  for (const seccion of secciones) {
    if (seccion.top <= linea && linea < seccion.bottom && (elegida === null || seccion.top >= elegida.top)) {
      elegida = seccion;
    }
  }
  return elegida?.id ?? null;
}
