import { describe, expect, it } from 'vitest';
import { esVertical, fotoOptimizada } from './fotos';

describe('fotoOptimizada', () => {
  const foto = fotoOptimizada({ nombre: 'honda-nx-lateral', ancho: 1080, alto: 1350, alt: 'Una moto', titulo: 'Honda NX' });

  it('arma el respaldo JPG y los WebP con ruta sin "public"', () => {
    expect(foto.src).toBe('/trabajos/honda-nx-lateral-800.jpg');
    expect(foto.srcset).toBe(
      '/trabajos/honda-nx-lateral-480.webp 480w, /trabajos/honda-nx-lateral-800.webp 800w, /trabajos/honda-nx-lateral-1080.webp 1080w',
    );
    expect(foto.src).not.toContain('public');
  });

  it('reserva el lugar con el tamaño del respaldo, sin deformar', () => {
    expect([foto.ancho, foto.alto]).toEqual([800, 1000]);
  });

  it('no ofrece versiones más grandes que el original', () => {
    const chica = fotoOptimizada({ nombre: 'x', ancho: 600, alto: 400, alt: 'x' });
    expect(chica.srcset).toBe('/trabajos/x-480.webp 480w');
    expect(chica.ancho).toBe(600);
  });

  it('esVertical distingue las fotos altas; sin medidas se asume horizontal', () => {
    expect(esVertical(foto)).toBe(true);
    expect(esVertical({ ancho: 800, alto: 600 })).toBe(false);
    expect(esVertical({})).toBe(false);
  });
});
