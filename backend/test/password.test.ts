import { describe, expect, it } from 'vitest';
import { DEFAULT_SCRYPT_PARAMS, hashPassword, verifyPassword } from '../src/lib/password.js';
import { TEST_SCRYPT_PARAMS } from './helpers.js';

describe('hashPassword / verifyPassword (scrypt)', () => {
  it('genera un hash en formato PHC con los parámetros dentro', async () => {
    const hash = await hashPassword('una-clave-larga', TEST_SCRYPT_PARAMS);

    expect(hash).toMatch(/^\$scrypt\$ln=10,r=8,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(hash).not.toContain('una-clave-larga');
  });

  it('verifica la contraseña correcta y rechaza las incorrectas', async () => {
    const hash = await hashPassword('una-clave-larga', TEST_SCRYPT_PARAMS);

    expect(await verifyPassword('una-clave-larga', hash)).toBe(true);
    expect(await verifyPassword('una-clave-larga ', hash)).toBe(false);
    expect(await verifyPassword('Una-clave-larga', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('usa un salt aleatorio distinto por cada hash', async () => {
    const [first, second] = await Promise.all([
      hashPassword('misma-clave', TEST_SCRYPT_PARAMS),
      hashPassword('misma-clave', TEST_SCRYPT_PARAMS),
    ]);

    expect(first).not.toBe(second);
    expect(await verifyPassword('misma-clave', first)).toBe(true);
    expect(await verifyPassword('misma-clave', second)).toBe(true);
  });

  it('los parámetros por defecto son los de OWASP (N=2^15, r=8, p=3) y se guardan en el hash', async () => {
    expect(DEFAULT_SCRYPT_PARAMS).toEqual({ logN: 15, r: 8, p: 3 });

    const hash = await hashPassword('clave-con-costo-real');
    expect(hash).toMatch(/^\$scrypt\$ln=15,r=8,p=3\$/);
    expect(await verifyPassword('clave-con-costo-real', hash)).toBe(true);
    expect(await verifyPassword('otra', hash)).toBe(false);
  });

  it('normaliza Unicode (NFKC): la misma contraseña escrita con otra composición verifica igual', async () => {
    const composed = 'contraseña-Zoë-é'; // é como un solo carácter
    const decomposed = composed.normalize('NFD'); // e + acento combinante
    expect(composed).not.toBe(decomposed);

    const hash = await hashPassword(composed, TEST_SCRYPT_PARAMS);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });

  it.each([
    ['texto cualquiera', 'esto-no-es-un-hash'],
    ['logN gigante (consumiría memoria)', '$scrypt$ln=30,r=8,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g'],
    ['clave derivada demasiado corta', '$scrypt$ln=10,r=8,p=1$c2FsdHNhbHRzYWx0$YQ'],
  ])('un hash ilegible (%s) nunca verifica y nunca lanza', async (_label, stored) => {
    await expect(verifyPassword('cualquier-cosa', stored)).resolves.toBe(false);
  });

  it('un hash con un byte alterado no verifica', async () => {
    const hash = await hashPassword('clave-original', TEST_SCRYPT_PARAMS);
    const parts = hash.split('$');
    const key = Buffer.from(parts[4] ?? '', 'base64');
    key[0] = (key[0] ?? 0) ^ 0xff;
    const tampered = [...parts.slice(0, 4), key.toString('base64').replace(/=+$/, '')].join('$');

    expect(await verifyPassword('clave-original', tampered)).toBe(false);
  });
});
