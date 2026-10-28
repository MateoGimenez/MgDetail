import { describe, expect, it } from 'vitest';
import { fotos } from '../data/galeria';

/** Lee un archivo del repo como texto (los `?raw` de CSS llegan vacíos en vitest; acá se lee del disco). */
// El nombre va en una variable para que TypeScript no busque los tipos de Node (el código de src usa solo vite/client).
const MODULO_FS: string = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ MODULO_FS)) as {
  readFileSync: (ruta: URL, codificacion: 'utf8') => string;
};
const leer = (relativa: string): string => readFileSync(new URL(relativa, import.meta.url), 'utf8');
const baseCss = leer('../styles/base.css');
const landingCss = leer('./landing.css');
const galeriaFuente = leer('./Galeria.tsx');

/**
 * Revisión 2026-10-28 (reportes/2026-10-28_18_revision-galeria-perfil.md, problema 1).
 * El `sizes` de las tarjetas le dice al navegador qué ancho van a ocupar, y con eso elige el WebP (480/800/1080w).
 * Si promete menos que la tarjeta real, baja uno chico y la foto se ve estirada en notebooks con zoom de Windows
 * (125 % / 150 %). Medido en HEAD: a 1366×768 la columna medía 389 px y `sizes` decía 300 px (bajaba el de 480w);
 * a 1280×720 @1,5 hacían falta 576 px y bajaba igual el de 480w.
 *
 * El test no copia el diseño de la grilla: usa un TOPE del ancho real de cada tarjeta desde 900 px, que vale para
 * cualquier variante (galería a todo el ancho o al lado del título): una tarjeta nunca es más ancha que su parte
 * del contenedor ((contenedor − huecos) / n) ni que el tope en px de `--foto-max` si landing.css lo declara.
 * Si `sizes` cubre ese tope, nunca promete de menos.
 */

/** Valor en px de una variable de base.css (`--e-4: 16px;`). */
function px(variable: string): number {
  const m = new RegExp(`${variable}:\\s*(\\d+)px`).exec(baseCss);
  if (!m?.[1]) throw new Error(`No encontré ${variable} en base.css`);
  return Number(m[1]);
}

/** `--margen: clamp(20px, 5vw, 48px)` evaluado para un ancho de ventana. */
function margen(anchoVentana: number): number {
  const m = /--margen:\s*clamp\((\d+)px,\s*(\d+(?:\.\d+)?)vw,\s*(\d+)px\)/.exec(baseCss);
  if (!m?.[1] || !m[2] || !m[3]) throw new Error('Cambió la forma de --margen: actualizar este test');
  return Math.min(Number(m[3]), Math.max(Number(m[1]), (Number(m[2]) / 100) * anchoVentana));
}

/** Tope en px de la tarjeta si landing.css lo declara (`--foto-max: ... min(400px, ...)`), o Infinity. */
function topeDeclarado(): number {
  const declaracion = /--foto-max:([^;]+);/.exec(landingCss)?.[1];
  const tope = declaracion ? /min\(\s*(\d+)px/.exec(declaracion)?.[1] : undefined;
  return tope ? Number(tope) : Number.POSITIVE_INFINITY;
}

/** Lo más ancha que puede ser una tarjeta desde 900 px con n fotos. */
function topeDeColumna(anchoVentana: number, n: number): number {
  const contenedor = Math.min(anchoVentana - 2 * margen(anchoVentana), px('--ancho'));
  const parte = (contenedor - (n - 1) * px('--e-4')) / n;
  return Math.min(parte, topeDeclarado());
}

/** El `sizes` de las tarjetas de la galería (no el del visor, que es 100vw). */
function sizesDeTarjeta(): string {
  const todos = [...galeriaFuente.matchAll(/sizes="([^"]+)"/g)].map((m) => m[1] ?? '');
  const deTarjeta = todos.find((s) => s.includes('min-width'));
  if (!deTarjeta) throw new Error('No encontré el sizes de las tarjetas en Galeria.tsx');
  return deTarjeta;
}

/** Un largo de `sizes`: `300px`, `72vw` o `min(a, b)` / `max(a, b)` de esos. */
function largo(texto: string, anchoVentana: number): number {
  const t = texto.trim();
  const simple = /^(\d+(?:\.\d+)?)(px|vw)$/.exec(t);
  if (simple) return simple[2] === 'vw' ? (Number(simple[1]) / 100) * anchoVentana : Number(simple[1]);
  const funcion = /^(min|max)\((.+)\)$/.exec(t);
  if (funcion?.[2]) {
    const valores = funcion[2].split(',').map((v) => largo(v, anchoVentana));
    return funcion[1] === 'min' ? Math.min(...valores) : Math.max(...valores);
  }
  throw new Error(`Largo de sizes que este test no sabe evaluar: "${t}"`);
}

/** Separa por comas que no están dentro de paréntesis. */
function entradas(sizes: string): string[] {
  const salida: string[] = [];
  let nivel = 0;
  let actual = '';
  for (const c of sizes) {
    if (c === '(') nivel++;
    if (c === ')') nivel--;
    if (c === ',' && nivel === 0) {
      salida.push(actual.trim());
      actual = '';
    } else actual += c;
  }
  salida.push(actual.trim());
  return salida;
}

/** Evalúa un `sizes`: entradas `(min-width: Npx) <largo>` / `(max-width: Npx) <largo>` y una final. */
function evaluarSizes(sizes: string, anchoVentana: number): number {
  for (const entrada of entradas(sizes)) {
    const m = /^(?:\((min|max)-width:\s*(\d+)px\)\s+)?(.+)$/.exec(entrada);
    if (!m?.[3]) throw new Error(`Entrada de sizes que este test no sabe evaluar: "${entrada}"`);
    const [, tipo, limite, valor] = m;
    const cumple =
      tipo === undefined || (tipo === 'min' ? anchoVentana >= Number(limite) : anchoVentana <= Number(limite));
    if (cumple) return largo(valor, anchoVentana);
  }
  throw new Error('El sizes no tiene una entrada final por defecto');
}

describe('galería: el sizes de las tarjetas no promete menos que la tarjeta real', () => {
  it('el evaluador entiende los sizes de antes y de ahora', () => {
    expect(evaluarSizes('(min-width: 900px) 300px, 72vw', 1366)).toBe(300);
    expect(evaluarSizes('(min-width: 900px) 300px, 72vw', 390)).toBeCloseTo(280.8);
    expect(evaluarSizes('(min-width: 900px) min(30vw, 400px), 72vw', 1366)).toBe(400);
  });

  const n = fotos.length;
  const anchos = [900, 1024, 1093, 1229, 1280, 1366, 1440, 1536, 1920];
  it.runIf(n > 0 && n <= 4).each(anchos)('a %i px de ventana', (anchoVentana) => {
    const tope = topeDeColumna(anchoVentana, n);
    const prometido = evaluarSizes(sizesDeTarjeta(), anchoVentana);
    // 2 px de tolerancia por redondeos.
    expect(prometido, `la tarjeta puede medir ${tope.toFixed(0)} px y sizes dice ${prometido.toFixed(0)} px`).toBeGreaterThanOrEqual(
      tope - 2,
    );
  });
});
