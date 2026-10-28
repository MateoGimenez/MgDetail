import { describe, expect, it } from 'vitest';
import { idDeHash } from './ancla';
import { jsonLdSeguro } from './jsonLdSeguro';

describe('idDeHash', () => {
  it('decodifica, ignora el vacío y no lanza con un hash mal codificado', () => {
    expect(idDeHash('')).toBeNull();
    expect(idDeHash('#')).toBeNull();
    expect(idDeHash('#reservar')).toBe('reservar');
    expect(idDeHash('#d%C3%B3nde')).toBe('dónde');
    expect(() => idDeHash('#%E0%A4%A')).not.toThrow();
    expect(idDeHash('#%E0%A4%A')).toBe('%E0%A4%A');
  });
});

describe('jsonLdSeguro', () => {
  it('escapa "<" para que un dato no cierre el script, y sigue siendo JSON equivalente', () => {
    const datos = { name: '</script><img src=x onerror=alert(1)>', n: 1 };
    const texto = jsonLdSeguro(datos);
    expect(texto).not.toContain('<');
    expect(texto).toContain(String.fromCharCode(92) + 'u003c/script>');
    expect(JSON.parse(texto)).toEqual(datos);
  });
});
