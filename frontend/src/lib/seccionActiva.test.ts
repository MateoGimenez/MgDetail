import { describe, expect, it } from 'vitest';
import { elegirSeccionActiva, type PosicionSeccion } from './seccionActiva';

const caja = (id: string, top: number, bottom: number): PosicionSeccion => ({ id, top, bottom });
const LINEA = 80;
/** La misma página con todo corrido `delta` píxeles hacia arriba (lo que pasa al hacer scroll). */
const scroll = (secciones: readonly PosicionSeccion[], delta: number) =>
  secciones.map((s) => caja(s.id, s.top - delta, s.bottom - delta));

describe('elegirSeccionActiva', () => {
  // Entre "trabajos" y "preguntas" hay otras secciones del sitio que no están en el menú.
  const pagina = [caja('servicios', 600, 1400), caja('trabajos', 1400, 2200), caja('preguntas', 2600, 3200)];

  it('en el hero (todo debajo de la línea) no hay ninguna', () => {
    expect(elegirSeccionActiva(pagina, LINEA)).toBeNull();
  });

  it('gana la sección que ocupa la línea', () => {
    expect(elegirSeccionActiva(scroll(pagina, 700), LINEA)).toBe('servicios');
    expect(elegirSeccionActiva(scroll(pagina, 1500), LINEA)).toBe('trabajos');
    expect(elegirSeccionActiva(scroll(pagina, 2700), LINEA)).toBe('preguntas');
  });

  it('el borde superior cuenta (top igual a la línea) y el inferior no', () => {
    expect(elegirSeccionActiva([caja('a', LINEA, 500)], LINEA)).toBe('a');
    expect(elegirSeccionActiva([caja('a', -400, LINEA)], LINEA)).toBeNull();
  });

  it('entre dos secciones del menú no marca ninguna', () => {
    expect(elegirSeccionActiva(scroll(pagina, 2400), LINEA)).toBeNull();
  });

  it('si se superponen en la línea, gana la que empieza más abajo en el documento', () => {
    expect(elegirSeccionActiva([caja('a', -100, 200), caja('b', 50, 900)], LINEA)).toBe('b');
    expect(elegirSeccionActiva([caja('b', 50, 900), caja('a', -100, 200)], LINEA)).toBe('b');
  });

  it('después de la última sección no queda ninguna', () => {
    expect(elegirSeccionActiva([caja('contacto', -900, -10)], LINEA)).toBeNull();
  });

  it('sin secciones, null', () => {
    expect(elegirSeccionActiva([], LINEA)).toBeNull();
  });
});
