import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runClaveDb, scramSha256Verifier } from '../src/scripts/clave-db-cli.js';

describe('clave-db: verificador SCRAM-SHA-256 para el rol de la base', () => {
  it('coincide con el vector de prueba del RFC 7677 y el script nunca manda la contraseña en el SQL', () => {
    // RFC 7677, sección 3: usuario "user", contraseña "pencil", salt e iteraciones del intercambio de ejemplo.
    const verifier = scramSha256Verifier('pencil', Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64'), 4096);
    const match = /^SCRAM-SHA-256\$4096:W22ZaJ0SNY7soEsUEjb6gQ==\$([^:]+):(.+)$/.exec(verifier);
    expect(match).not.toBeNull();
    const storedKey = Buffer.from(match?.[1] ?? '', 'base64');
    const serverKey = Buffer.from(match?.[2] ?? '', 'base64');

    const authMessage =
      'n=user,r=rOprNGfwEbeRWgbNEkqO,' +
      'r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096,' +
      'c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0';
    // El servidor firma con ServerKey (v= del RFC) y verifica la prueba del cliente con StoredKey (p= del RFC).
    expect(createHmac('sha256', serverKey).update(authMessage).digest('base64')).toBe('6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=');
    const proof = Buffer.from('dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=', 'base64');
    const signature = createHmac('sha256', storedKey).update(authMessage).digest();
    const clientKey = Buffer.from(proof.map((byte, index) => byte ^ (signature[index] ?? 0)));
    expect(createHash('sha256').update(clientKey).digest().equals(storedKey)).toBe(true);

    const lines: string[] = [];
    runClaveDb((text) => lines.push(text));
    const output = lines.join('\n');
    const password = /^ {2}([\w-]{32})$/m.exec(output)?.[1];
    const sql = /^ {2}(alter role .*)$/m.exec(output)?.[1] ?? '';
    expect(password).toBeDefined();
    expect(sql).toMatch(/^alter role mgdetailing_app with login password 'SCRAM-SHA-256\$4096:[^']+';$/);
    expect(sql).not.toContain(password);
  });
});
