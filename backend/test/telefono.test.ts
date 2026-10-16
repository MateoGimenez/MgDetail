import { describe, expect, it } from 'vitest';
import { telefonoWhatsapp } from '../src/domain/telefono.js';

describe('telefonoWhatsapp', () => {
  it.each(['0380 15-4123456', '380 4123456', '+54 9 380 412-3456', '+54 380 4123456'])(
    'celular argentino %j => 5493804123456',
    (input) => {
      expect(telefonoWhatsapp(input)).toBe('5493804123456');
    },
  );

  it('Buenos Aires: 011 15 2345-6789 => 5491123456789', () => {
    expect(telefonoWhatsapp('011 15 2345-6789')).toBe('5491123456789');
  });

  it('Chilecito (área 3825, abonado de 6 dígitos) => 549 + 10 dígitos', () => {
    expect(telefonoWhatsapp('03825 15-456789')).toBe('5493825456789');
    expect(telefonoWhatsapp('3825 456789')).toMatch(/^549\d{10}$/);
  });

  it('número válido de otro país => E.164 sin "+"', () => {
    expect(telefonoWhatsapp('+1 415 555 2671')).toBe('14155552671');
  });

  it('lo que no se puede interpretar => null (y nunca lanza)', () => {
    expect(telefonoWhatsapp('1234 5678')).toBeNull();
    expect(telefonoWhatsapp('(((')).toBeNull();
  });
});
