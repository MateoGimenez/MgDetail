import { describe, expect, it } from 'vitest';
import { isVapidPrivateKey, isVapidPublicKey } from '../src/config.js';
import { generarClavesVapid, runVapid } from '../src/scripts/vapid-cli.js';

describe('npm run vapid', () => {
  it('genera un par válido (pública de 65 bytes, privada de 32) y distinto cada vez', () => {
    const a = generarClavesVapid();
    const b = generarClavesVapid();
    expect(isVapidPublicKey(a.publicKey)).toBe(true);
    expect(isVapidPrivateKey(a.privateKey)).toBe(true);
    expect(Buffer.from(a.publicKey, 'base64url')).toHaveLength(65);
    expect(Buffer.from(a.privateKey, 'base64url')).toHaveLength(32);
    expect(a.privateKey).not.toBe(b.privateKey);
  });

  it('imprime las tres líneas listas para pegar en .env, con el formato que acepta la config', () => {
    const lineas: string[] = [];
    expect(runVapid((text) => lineas.push(text))).toBe(0);
    const text = lineas.join('\n');
    const env = Object.fromEntries(
      text
        .split('\n')
        .filter((linea) => /^VAPID_[A-Z_]+=/.test(linea))
        .map((linea) => [linea.slice(0, linea.indexOf('=')), linea.slice(linea.indexOf('=') + 1)]),
    );
    expect(Object.keys(env)).toEqual(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']);
    expect(isVapidPublicKey(env.VAPID_PUBLIC_KEY ?? '')).toBe(true);
    expect(isVapidPrivateKey(env.VAPID_PRIVATE_KEY ?? '')).toBe(true);
    expect(env.VAPID_SUBJECT).toMatch(/^mailto:/);
  });
});
