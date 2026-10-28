import { describe, expect, it } from 'vitest';
import { iniciales } from './iniciales';

describe('iniciales del avatar', () => {
  it('toma las de las dos primeras palabras', () => {
    expect(iniciales('Mateo Giménez')).toBe('MG');
    expect(iniciales('ana maría de los santos')).toBe('AM');
  });
  it('con una sola palabra, una letra', () => {
    expect(iniciales('Lucía')).toBe('L');
  });
  it('con un mail usa partes del usuario', () => {
    expect(iniciales('mg.detailing@gmail.com')).toBe('MD');
  });
  it('vacío o sin letras: signo de pregunta', () => {
    expect(iniciales('')).toBe('?');
    expect(iniciales('123')).toBe('?');
  });
});
