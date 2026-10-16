import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { BACKEND_ROOT } from '../src/config.js';

// Guardia contra "Trojan Source": un carácter bidireccional escrito literalmente en el código puede hacer que
// lo que se ve en una revisión no sea lo que se ejecuta. Si hace falta uno, se arma por código
// (String.fromCodePoint) o con la propiedad \p{Bidi_Control}; nunca escrito literal.

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return /\.(ts|js|json|md)$/.test(entry.name) ? [full] : [];
  });
}

it('ningún fuente contiene caracteres bidireccionales escritos literalmente', () => {
  const files = [...listFiles(path.join(BACKEND_ROOT, 'src')), ...listFiles(path.join(BACKEND_ROOT, 'test'))];
  const offenders = files.filter((file) => /\p{Bidi_Control}/u.test(readFileSync(file, 'utf8')));

  expect(files.length).toBeGreaterThan(30);
  expect(offenders.map((file) => path.relative(BACKEND_ROOT, file))).toEqual([]);
});
