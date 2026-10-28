import { describe, expect, it } from 'vitest';

/** Lee un archivo del repo como texto (los `?raw` de CSS llegan vacíos en vitest; acá se lee del disco). */
// El nombre va en una variable para que TypeScript no busque los tipos de Node (el código de src usa solo vite/client).
const MODULO_FS: string = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ MODULO_FS)) as {
  readFileSync: (ruta: URL, codificacion: 'utf8') => string;
};
const leer = (relativa: string): string => readFileSync(new URL(relativa, import.meta.url), 'utf8');
const navegacionCss = leer('../navegacion.css');
const hojaFuente = leer('./Hoja.tsx');

/**
 * Revisión 2026-10-28 (reportes/2026-10-28_18_revision-galeria-perfil.md, problema 2). Causas medidas con capturas:
 * 1. `.hoja__interior` es una grilla sin columnas declaradas: la columna implícita (`auto`) crece hasta el
 *    min-content del hijo más ancho. "Empleado · empleado@mgdetailing.test" en una línea sin cortes empujaba la
 *    cabecera a 389 px dentro de una hoja de 356 px útiles (390 px de pantalla): la X, los ">" y Salir quedaban
 *    cortados; con un nombre y un email largos la columna llegaba a 604 px y la hoja se corría de costado.
 * 2. Hoja.tsx escuchaba `onClose` sin mirar de dónde venía: React hace subir el `close` de los diálogos en portal
 *    ("Tu rol", "Ajustes") por el árbol de componentes, así que cerrarlos cerraba también la hoja de perfil.
 */

/** Cuerpo de la primera regla con ese selector exacto (sin media queries anidadas). */
function regla(css: string, selector: string): string {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n)${escapado}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m?.[1]) throw new Error(`No encontré la regla ${selector}`);
  return m[1];
}

describe('hoja del panel: nada empuja el ancho', () => {
  it('la grilla interior tiene una sola columna que puede achicarse (minmax(0, 1fr))', () => {
    expect(regla(navegacionCss, '.hoja__interior')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });
});

describe('hoja del panel: cerrar un diálogo hijo no cierra la hoja', () => {
  it('onClose solo reacciona al close del propio <dialog> (target === currentTarget)', () => {
    const m = /onClose=\{([\s\S]*?)\}\s*\n\s*onClick=/.exec(hojaFuente);
    expect(m, 'no encontré el onClose del <dialog> en Hoja.tsx').not.toBeNull();
    expect(m?.[1]).toMatch(/target\s*===\s*\w+\.currentTarget/);
  });
});
