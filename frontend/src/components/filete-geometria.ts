/**
 * Geometría de los filetes. La voluta es una espiral de semicírculos: cada
 * arco tiene un radio `paso` más chico que el anterior y todos empalman
 * tangentes sobre una misma recta, como el remate en espiral que el
 * fileteador hace de un solo trazo.
 */

interface OpcionesVoluta {
  /** Punto donde termina la línea y empieza la espiral. */
  x: number;
  y: number;
  /** 'h' si la línea viene en horizontal; 'v' si viene en vertical. */
  eje: 'h' | 'v';
  /** Sentido en que avanza la línea sobre su eje: +1 o −1. */
  avance: 1 | -1;
  /** Hacia qué lado se enrolla, sobre el otro eje: +1 o −1. */
  giro: 1 | -1;
  radio: number;
  paso: number;
  arcos?: number;
}

const n = (valor: number) => Number(valor.toFixed(2)).toString();

export function voluta({ x, y, eje, avance, giro, radio, paso, arcos = 4 }: OpcionesVoluta) {
  const mismoSigno = avance * giro > 0;
  // En pantalla (y hacia abajo), avanzar en +x y enrollarse hacia +y es sentido horario.
  const barrido = eje === 'h' ? (mismoSigno ? 1 : 0) : mismoSigno ? 0 : 1;
  let desplazamiento = 0;
  let r = radio;
  let d = '';
  let fin: [number, number] = [x, y];
  for (let i = 0; i < arcos && r > 0.1; i++) {
    desplazamiento += i % 2 === 0 ? 2 * r : -2 * r;
    fin = eje === 'h' ? [x, y + giro * desplazamiento] : [x + giro * desplazamiento, y];
    d += ` A${n(r)} ${n(r)} 0 0 ${String(barrido)} ${n(fin[0])} ${n(fin[1])}`;
    r -= paso;
  }
  return { d, fin };
}

/* Esquina superior izquierda de un marco de 140 × 140. */
const esquinaArriba = voluta({ x: 64, y: 11, eje: 'h', avance: -1, giro: 1, radio: 14, paso: 3.5 });
const esquinaIzquierda = voluta({ x: 11, y: 64, eje: 'v', avance: -1, giro: 1, radio: 14, paso: 3.5 });

export const ESQUINA = {
  arriba: `M140 11H64${esquinaArriba.d}`,
  izquierda: `M11 140V64${esquinaIzquierda.d}`,
  finArriba: esquinaArriba.fin,
  finIzquierda: esquinaIzquierda.fin,
  luzArriba: 'M140 14.5H87',
  luzIzquierda: 'M14.5 140V87',
  rombo: 'M28 17 39 28 28 39 17 28Z M28 22.5 22.5 28 28 33.5 33.5 28Z',
} as const;

/* Separador de 320 × 44: rombo al centro y dos líneas que rematan en volutas hacia arriba. */
const separadorIzq = voluta({ x: 58, y: 30, eje: 'h', avance: -1, giro: -1, radio: 12, paso: 3 });
const separadorDer = voluta({ x: 262, y: 30, eje: 'h', avance: 1, giro: -1, radio: 12, paso: 3 });

export const SEPARADOR = {
  izquierda: `M146 30H58${separadorIzq.d}`,
  derecha: `M174 30H262${separadorDer.d}`,
  finIzquierda: separadorIzq.fin,
  finDerecha: separadorDer.fin,
  luzIzquierda: 'M140 34.5H80',
  luzDerecha: 'M180 34.5H240',
  rombo: 'M160 21 169 30 160 39 151 30Z M160 25.5 155.5 30 160 34.5 164.5 30Z',
} as const;

/* Subrayado de selección de 48 × 12: nace en el centro y remata en dos volutas. */
const subrayadoDer = voluta({ x: 38, y: 3, eje: 'h', avance: 1, giro: 1, radio: 3.2, paso: 0.8 });
const subrayadoIzq = voluta({ x: 10, y: 3, eje: 'h', avance: -1, giro: 1, radio: 3.2, paso: 0.8 });

export const SUBRAYADO = {
  derecha: `M24 3H38${subrayadoDer.d}`,
  izquierda: `M24 3H10${subrayadoIzq.d}`,
} as const;
