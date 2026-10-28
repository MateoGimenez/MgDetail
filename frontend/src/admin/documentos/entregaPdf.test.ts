import { describe, expect, it } from 'vitest';
import { clasificarFallaDeCompartir } from './entregaPdf';

describe('clasificarFallaDeCompartir', () => {
  it('cerrar la hoja no es un error; un gesto vencido pide otro toque; lo demás es una falla', () => {
    expect(clasificarFallaDeCompartir(new DOMException('x', 'AbortError'))).toBe('cancelado');
    expect(clasificarFallaDeCompartir(new DOMException('x', 'NotAllowedError'))).toBe('toque');
    expect(clasificarFallaDeCompartir(new TypeError('x'))).toBe('otra');
    expect(clasificarFallaDeCompartir(null)).toBe('otra');
  });
});
