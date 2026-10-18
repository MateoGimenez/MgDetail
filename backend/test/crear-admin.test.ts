import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BACKEND_ROOT } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { sqliteDatabase } from '../src/db/database.js';
import { migrate } from '../src/db/migrations.js';
import { runCrearAdmin } from '../src/scripts/crear-admin-cli.js';
import { TEST_SCRYPT_PARAMS, createClient, testConfig } from './helpers.js';

const execFileAsync = promisify(execFile);

let directory: string;
let dbFile: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'mg-admin-'));
  dbFile = path.join(directory, 'storage', 'test.db');
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function run(argv: string[], env: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const promise = runCrearAdmin(
    argv,
    { DB_PATH: dbFile, ...env },
    { out: (text) => out.push(text), err: (text) => err.push(text) },
    { passwordParams: TEST_SCRYPT_PARAMS },
  );
  return promise.then((code) => ({ code, out: out.join('\n'), err: err.join('\n') }));
}

/** Abre la base que dejó el script, arma la app real y devuelve un cliente HTTP. */
function appOnScriptDatabase() {
  const db = openDatabase(dbFile);
  migrate(db);
  const { repositories, checkDatabase } = sqliteDatabase(db, dbFile);
  const app = createApp({
    config: testConfig(),
    repositories,
    checkDatabase,
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  });
  return { db, client: createClient(app) };
}

describe('crear-admin: crear', () => {
  it('crea el admin leyendo la contraseña de ADMIN_PASSWORD y después se puede iniciar sesión', async () => {
    const result = await run(['--email', 'dueno@mgdetailing.com'], { ADMIN_PASSWORD: 'una-clave-bien-larga' });

    expect(result.code).toBe(0);
    expect(result.out).toContain('Administrador creado: dueno@mgdetailing.com');
    expect(result.err).toBe('');

    const { db, client } = appOnScriptDatabase();
    try {
      const login = await client.post('/api/auth/login', { email: 'dueno@mgdetailing.com', password: 'una-clave-bien-larga' });
      expect(login.status).toBe(200);
      const wrong = await client.post('/api/auth/login', { email: 'dueno@mgdetailing.com', password: 'otra-clave-distinta' });
      expect(wrong.status).toBe(401);
    } finally {
      db.close();
    }
  });

  it('crea la carpeta de la base si no existe', async () => {
    const result = await run(['--email', 'dueno@mgdetailing.com'], { ADMIN_PASSWORD: 'una-clave-bien-larga' });

    expect(result.code).toBe(0);
    expect(result.out).toContain(dbFile);
  });

  it('normaliza el email a minúsculas y sin espacios', async () => {
    const result = await run(['--email', '  Dueno@MgDetailing.COM '], { ADMIN_PASSWORD: 'una-clave-bien-larga' });

    expect(result.code).toBe(0);
    expect(result.out).toContain('Administrador creado: dueno@mgdetailing.com');
    const { db, client } = appOnScriptDatabase();
    try {
      const login = await client.post('/api/auth/login', { email: 'DUENO@mgdetailing.com', password: 'una-clave-bien-larga' });
      expect(login.status).toBe(200);
    } finally {
      db.close();
    }
  });

  it('nunca imprime la contraseña', async () => {
    const password = 'secreto-que-no-debe-salir-1';
    const ok = await run(['--email', 'dueno@mgdetailing.com'], { ADMIN_PASSWORD: password });
    const viaFlag = await run(['--email', 'dueno@mgdetailing.com', '--password', password]);
    const tooShort = await run(['--email', 'dueno@mgdetailing.com'], { ADMIN_PASSWORD: 'corta' });

    for (const result of [ok, viaFlag, tooShort]) {
      expect(result.out).not.toContain(password);
      expect(result.err).not.toContain(password);
    }
  });

  it('también acepta el email por la variable ADMIN_EMAIL', async () => {
    const result = await run([], { ADMIN_EMAIL: 'dueno@mgdetailing.com', ADMIN_PASSWORD: 'una-clave-bien-larga' });

    expect(result.code).toBe(0);
    expect(result.out).toContain('dueno@mgdetailing.com');
  });
});

describe('crear-admin: actualizar', () => {
  it('si el email ya existe actualiza la contraseña (no duplica) y cierra sus sesiones abiertas', async () => {
    await run(['--email', 'dueno@mgdetailing.com'], { ADMIN_PASSWORD: 'clave-vieja-123456' });

    // Inicia sesión con la clave vieja.
    const before = appOnScriptDatabase();
    const session = await before.client.post('/api/auth/login', { email: 'dueno@mgdetailing.com', password: 'clave-vieja-123456' });
    expect(session.status).toBe(200);
    expect((await before.client.get('/api/auth/me')).status).toBe(200);
    before.db.close();

    const result = await run(['--email', 'DUENO@mgdetailing.com'], { ADMIN_PASSWORD: 'clave-nueva-654321' });
    expect(result.code).toBe(0);
    expect(result.out).toContain('Contraseña actualizada para dueno@mgdetailing.com');
    expect(result.out).toContain('Sesiones abiertas cerradas: 1');

    const after = appOnScriptDatabase();
    try {
      expect(after.db.prepare('SELECT COUNT(*) AS n FROM admins').get()?.n).toBe(1);
      expect((await after.client.post('/api/auth/login', { email: 'dueno@mgdetailing.com', password: 'clave-vieja-123456' })).status).toBe(401);
      expect((await after.client.post('/api/auth/login', { email: 'dueno@mgdetailing.com', password: 'clave-nueva-654321' })).status).toBe(200);
      expect(after.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n).toBe(1); // solo la nueva
    } finally {
      after.db.close();
    }
  });
});

describe('crear-admin: errores', () => {
  it('sin contraseña falla con instrucciones', async () => {
    const result = await run(['--email', 'dueno@mgdetailing.com']);

    expect(result.code).toBe(1);
    expect(result.err).toMatch(/Falta la contraseña: definí la variable ADMIN_PASSWORD/);
  });

  it('contraseña de menos de 10 caracteres => error y no crea nada', async () => {
    const result = await run(['--email', 'dueno@mgdetailing.com'], { ADMIN_PASSWORD: '123456789' });

    expect(result.code).toBe(1);
    expect(result.err).toBe('La contraseña tiene que tener al menos 10 caracteres.');
    const db = openDatabase(dbFile);
    try {
      migrate(db);
      expect(db.prepare('SELECT COUNT(*) AS n FROM admins').get()?.n).toBe(0);
    } finally {
      db.close();
    }
  });

  it('10 caracteres justos es válido; más de 128 no', async () => {
    expect((await run(['--email', 'a@b.co'], { ADMIN_PASSWORD: '1234567890' })).code).toBe(0);
    const tooLong = await run(['--email', 'a@b.co'], { ADMIN_PASSWORD: 'x'.repeat(129) });
    expect(tooLong.code).toBe(1);
    expect(tooLong.err).toMatch(/no puede tener más de 128/);
  });

  it('sin email o con email inválido => error', async () => {
    const missing = await run([], { ADMIN_PASSWORD: 'una-clave-bien-larga' });
    expect(missing.code).toBe(1);
    expect(missing.err).toMatch(/Falta el email/);

    const invalid = await run(['--email', 'esto-no-es-un-email'], { ADMIN_PASSWORD: 'una-clave-bien-larga' });
    expect(invalid.code).toBe(1);
    expect(invalid.err).toMatch(/Email inválido: Revisá el email/);
  });

  it('una opción desconocida o un argumento suelto muestran el uso y fallan', async () => {
    const unknown = await run(['--email', 'a@b.co', '--rol', 'superadmin'], { ADMIN_PASSWORD: 'una-clave-bien-larga' });
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain('Uso:');

    const positional = await run(['dueno@mgdetailing.com'], { ADMIN_PASSWORD: 'una-clave-bien-larga' });
    expect(positional.code).toBe(1);
  });

  it('--password funciona pero avisa que queda en el historial de la terminal', async () => {
    const result = await run(['--email', 'a@b.co', '--password', 'una-clave-bien-larga']);

    expect(result.code).toBe(0);
    expect(result.err).toMatch(/historial de la terminal/);
    expect(result.err).toMatch(/ADMIN_PASSWORD/);
  });

  it('--help muestra el uso y sale bien', async () => {
    const result = await run(['--help']);

    expect(result.code).toBe(0);
    expect(result.out).toContain('npm run crear-admin -- --email <email>');
    expect(result.out).toContain('ADMIN_PASSWORD');
  });
});

describe('crear-admin: ejecución real del script (npm run crear-admin)', () => {
  it('crea el admin ejecutando el archivo con tsx, igual que el script de npm', async () => {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', 'src/scripts/crear-admin.ts', '--email', 'Real@MgDetailing.com'],
      {
        cwd: BACKEND_ROOT,
        env: { ...process.env, DB_PATH: dbFile, ADMIN_PASSWORD: 'clave-del-proceso-real' },
        windowsHide: true,
        timeout: 60_000,
      },
    );

    expect(stdout).toContain('Administrador creado: real@mgdetailing.com');
    expect(stdout).not.toContain('clave-del-proceso-real');
    expect(stderr).toBe('');

    const db = openDatabase(dbFile);
    try {
      expect(db.prepare('SELECT email FROM admins').get()?.email).toBe('real@mgdetailing.com');
      // El hash es scrypt con los parámetros por defecto, nunca la contraseña en claro.
      const hash = String(db.prepare('SELECT password_hash FROM admins').get()?.password_hash);
      expect(hash).toMatch(/^\$scrypt\$ln=15,r=8,p=3\$/);
      expect(hash).not.toContain('clave-del-proceso-real');
    } finally {
      db.close();
    }
  });

  it('termina con código distinto de 0 si falta la contraseña', async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, DB_PATH: dbFile };
    delete env.ADMIN_PASSWORD;

    await expect(
      execFileAsync(process.execPath, ['--import', 'tsx', 'src/scripts/crear-admin.ts', '--email', 'a@b.co'], {
        cwd: BACKEND_ROOT,
        env,
        windowsHide: true,
        timeout: 60_000,
      }),
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Falta la contraseña') as string });
  });
});
