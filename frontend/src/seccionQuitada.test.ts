import { describe, expect, it } from 'vitest';

/** Todo el texto de src/ y los documentos del frontend, tal cual está en disco (Vite los entrega como texto). */
const archivos = import.meta.glob<string>(['/src/**/*.{ts,tsx,css,md,json}', '/DESIGN.md', '/README.md'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const ESTE_ARCHIVO = '/src/seccionQuitada.test.ts';
const RESTO = /comparativa|cu[aá]l te conviene/i;

describe('la sección "¿Cuál te conviene?" se quitó por completo', () => {
  it('hay archivos que revisar (la búsqueda no está vacía)', () => {
    expect(Object.keys(archivos).length).toBeGreaterThan(50);
  });

  it('no queda código, estilos ni documentación que la mencionen', () => {
    const con = Object.entries(archivos)
      .filter(([ruta, texto]) => ruta !== ESTE_ARCHIVO && RESTO.test(texto))
      .map(([ruta]) => ruta);
    expect(con).toEqual([]);
  });

  it('los archivos de la sección no existen', () => {
    const rutas = Object.keys(archivos);
    for (const archivo of ['/src/landing/Comparativa.tsx', '/src/lib/comparativa.ts', '/src/lib/comparativa.test.ts']) {
      expect(rutas).not.toContain(archivo);
    }
  });
});
