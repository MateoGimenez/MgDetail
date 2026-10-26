import { afterEach, describe, expect, it, vi } from 'vitest';
import { borrarDuenoAvisos, decidirReconfirmacion, guardarDuenoAvisos, leerDuenoAvisos } from './duenoAvisos';

function almacenamientoFalso() {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void datos.set(clave, valor),
    removeItem: (clave: string) => void datos.delete(clave),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('decidirReconfirmacion', () => {
  it('reconfirma solo si la persona logueada es quien activó los avisos', () => {
    expect(decidirReconfirmacion('A', 'A')).toBe('reconfirmar');
  });

  it('libera el dispositivo si los activó otra persona', () => {
    expect(decidirReconfirmacion('A', 'B')).toBe('liberar');
  });

  it('libera el dispositivo si no hay registro de quién los activó', () => {
    expect(decidirReconfirmacion(null, 'B')).toBe('liberar');
  });
});

describe('dueño de los avisos en localStorage', () => {
  it('guarda, lee y borra el id de la persona', () => {
    vi.stubGlobal('window', { localStorage: almacenamientoFalso() });
    expect(leerDuenoAvisos()).toBeNull();
    guardarDuenoAvisos('abc');
    expect(leerDuenoAvisos()).toBe('abc');
    borrarDuenoAvisos();
    expect(leerDuenoAvisos()).toBeNull();
  });

  it('no lanza si el navegador no deja usar localStorage', () => {
    const roto = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    vi.stubGlobal('window', { localStorage: roto });
    expect(() => {
      guardarDuenoAvisos('abc');
      borrarDuenoAvisos();
    }).not.toThrow();
    expect(leerDuenoAvisos()).toBeNull();
  });
});
