import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BACKEND_ROOT, ConfigError, DEFAULT_RATE_LIMITS, loadDotEnv, parseConfig, resolveDbPath } from '../src/config.js';

const SECRET = 'a-very-long-and-random-secret-for-tests-0123456789';
const PRODUCTION = {
  NODE_ENV: 'production',
  JWT_SECRET: SECRET,
  FRONTEND_ORIGIN: 'https://mgdetailing.com.ar',
  TRUST_PROXY: '1',
  DB_DRIVER: 'sqlite',
};

function problemsOf(env: NodeJS.ProcessEnv): string {
  try {
    parseConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  throw new Error('Se esperaba un ConfigError y no se lanzó');
}

describe('desarrollo: defaults seguros', () => {
  it('sin ninguna variable arranca con los valores por defecto', () => {
    const config = parseConfig({});

    expect(config).toMatchObject({
      nodeEnv: 'development',
      isProduction: false,
      host: '127.0.0.1',
      port: 4000,
      frontendOrigins: ['http://localhost:5173'],
      sessionTtlSeconds: 8 * 60 * 60,
      trustProxy: false,
      serveFrontend: false,
      rateLimits: DEFAULT_RATE_LIMITS,
    });
    expect(config.database).toEqual({ driver: 'sqlite', path: path.join(BACKEND_ROOT, 'storage', 'mgdetailing.db') });
    expect(DEFAULT_RATE_LIMITS.bookings).toEqual({ windowMs: 15 * 60 * 1000, limit: 5 });
    expect(DEFAULT_RATE_LIMITS.loginFailures).toEqual({ windowMs: 15 * 60 * 1000, limit: 5 });
  });

  it('sin JWT_SECRET genera uno aleatorio (≥32) y avisa que las sesiones se pierden al reiniciar', () => {
    const first = parseConfig({});

    expect(first.jwtSecret.length).toBeGreaterThanOrEqual(32);
    expect(first.jwtSecret).not.toBe(parseConfig({}).jwtSecret);
    expect(first.warnings[0]).toMatch(/JWT_SECRET no está definido.*sesiones.*se pierden/);
    expect(parseConfig({ JWT_SECRET: SECRET })).toMatchObject({ jwtSecret: SECRET, warnings: [] });
  });

  it('las variables vacías (FOO=) cuentan como no definidas', () => {
    const config = parseConfig({ PORT: '', HOST: ' ', FRONTEND_ORIGIN: '', TRUST_PROXY: '', SERVE_FRONTEND: '', DB_PATH: '' });

    expect(config).toMatchObject({ port: 4000, host: '127.0.0.1', trustProxy: false, serveFrontend: false });
    expect(config.frontendOrigins).toEqual(['http://localhost:5173']);
  });
});

describe('producción', () => {
  it('con todo lo obligatorio arranca sin avisos', () => {
    expect(parseConfig(PRODUCTION)).toMatchObject({
      isProduction: true,
      jwtSecret: SECRET,
      frontendOrigins: ['https://mgdetailing.com.ar'],
      trustProxy: 1,
      warnings: [],
    });
  });

  it('sin JWT_SECRET ni FRONTEND_ORIGIN (o vacíos) falla y lista AMBOS problemas', () => {
    for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'production', JWT_SECRET: '', FRONTEND_ORIGIN: '' }]) {
      const message = problemsOf(env);
      expect(message).toMatch(/JWT_SECRET: es obligatorio en producción \(mínimo 32 caracteres\)/);
      expect(message).toMatch(/FRONTEND_ORIGIN: es obligatorio en producción/);
    }
  });

  it('un JWT_SECRET de menos de 32 caracteres se rechaza sin mostrar el valor', () => {
    const short = 'x'.repeat(31);
    const message = problemsOf({ ...PRODUCTION, JWT_SECRET: short });

    expect(message).toMatch(/JWT_SECRET: tiene que tener al menos 32 caracteres/);
    expect(message).not.toContain(short);
  });

  it('avisa por origen sin https (no localhost) y por falta de TRUST_PROXY', () => {
    const http = parseConfig({
      ...PRODUCTION,
      FRONTEND_ORIGIN: 'https://mgdetailing.com.ar,http://192.168.0.10:5173,http://localhost:5173',
    });
    expect(http.warnings).toHaveLength(1);
    expect(http.warnings[0]).toContain('http://192.168.0.10:5173');
    expect(http.warnings[0]).not.toContain('localhost');

    const { TRUST_PROXY: _omitted, ...withoutProxy } = PRODUCTION;
    expect(parseConfig(withoutProxy).warnings.join('\n')).toMatch(/TRUST_PROXY no está configurado/);
  });
});

describe('validación de cada variable', () => {
  it('NODE_ENV acepta solo development, test o production', () => {
    expect(parseConfig({ NODE_ENV: 'test' }).nodeEnv).toBe('test');
    expect(problemsOf({ NODE_ENV: 'prod' })).toMatch(/NODE_ENV: tiene que ser development, test o production/);
  });

  it('PORT: entero entre 1 y 65535', () => {
    expect(parseConfig({ PORT: '8080' }).port).toBe(8080);
    for (const raw of ['0', '65536', 'abc', '4e3']) expect(problemsOf({ PORT: raw }), raw).toMatch(/PORT:/);
  });

  it('HOST: IP o nombre de host', () => {
    for (const host of ['0.0.0.0', '::', 'localhost']) expect(parseConfig({ HOST: host }).host).toBe(host);
    expect(problemsOf({ HOST: 'bad host!' })).toMatch(/HOST:/);
  });

  it.each([
    ['http://localhost:5173/', ['http://localhost:5173']],
    ['  https://MgDetailing.com.ar  ', ['https://mgdetailing.com.ar']],
    ['https://mgdetailing.com.ar:443', ['https://mgdetailing.com.ar']],
  ])('FRONTEND_ORIGIN=%j se normaliza', (raw, expected) => {
    expect(parseConfig({ FRONTEND_ORIGIN: raw }).frontendOrigins).toEqual(expected);
  });

  it('FRONTEND_ORIGIN admite una lista separada por comas, sin duplicados', () => {
    expect(parseConfig({ FRONTEND_ORIGIN: ' http://localhost:5173 , http://192.168.0.10:5173/ ,' }).frontendOrigins).toEqual([
      'http://localhost:5173',
      'http://192.168.0.10:5173',
    ]);
    expect(parseConfig({ FRONTEND_ORIGIN: 'http://localhost:5173,http://localhost:5173/' }).frontendOrigins).toHaveLength(1);
  });

  it.each(['*', 'https://mgdetailing.com.ar/app', 'http://a.com http://b.com'])(
    'FRONTEND_ORIGIN=%j es inválido (sin comodines, rutas ni credenciales)',
    (raw) => {
      expect(problemsOf({ FRONTEND_ORIGIN: raw })).toMatch(/FRONTEND_ORIGIN:/);
    },
  );

  it('FRONTEND_ORIGIN: máximo 10 orígenes, y el error dice cuál es el inválido', () => {
    const many = Array.from({ length: 11 }, (_unused, index) => `http://host${String(index)}.example`).join(',');
    expect(problemsOf({ FRONTEND_ORIGIN: many })).toMatch(/entre 1 y 10 orígenes/);
    expect(problemsOf({ FRONTEND_ORIGIN: 'http://localhost:5173,https://x.example/ruta' })).toContain(
      '"https://x.example/ruta" no es un origen válido',
    );
  });

  it.each([
    ['false', false],
    ['1', 1],
    ['loopback, 10.0.0.0/8', ['loopback', '10.0.0.0/8']],
  ])('TRUST_PROXY=%j => %j', (raw, expected) => {
    expect(parseConfig({ TRUST_PROXY: raw }).trustProxy).toEqual(expected);
  });

  it('TRUST_PROXY=true se rechaza (permitiría falsear la IP) y también los valores absurdos', () => {
    expect(problemsOf({ TRUST_PROXY: 'true' })).toMatch(/TRUST_PROXY=true confía en cualquier X-Forwarded-For.*falsear la IP/);
    for (const raw of ['11', 'basura', '10.0.0.0/33']) expect(problemsOf({ TRUST_PROXY: raw }), raw).toMatch(/TRUST_PROXY:/);
  });

  it('SERVE_FRONTEND: true/1 o false/0', () => {
    expect(parseConfig({ SERVE_FRONTEND: 'TRUE' }).serveFrontend).toBe(true);
    expect(parseConfig({ SERVE_FRONTEND: '0' }).serveFrontend).toBe(false);
    expect(problemsOf({ SERVE_FRONTEND: 'yes' })).toMatch(/SERVE_FRONTEND: tiene que ser true o false/);
  });

  it('informa todos los problemas juntos, no de a uno', () => {
    const message = problemsOf({ PORT: 'abc', TRUST_PROXY: 'true', FRONTEND_ORIGIN: '*' });

    for (const name of ['PORT', 'TRUST_PROXY', 'FRONTEND_ORIGIN']) expect(message).toContain(name);
  });
});

describe('base de datos: SQLite o Postgres', () => {
  const URL_OK = 'postgresql://postgres.abcdefghijklmnopqrst:Cl4ve%40segura@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=disable';

  it('con DATABASE_URL elige Postgres, separa las partes (decodifica la contraseña, ignora sslmode) y no la muestra', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'mg-ca-'));
    const caFile = path.join(directory, 'supabase-ca.crt');
    writeFileSync(caFile, '-----BEGIN CERTIFICATE-----\n');
    const config = parseConfig({ DATABASE_URL: URL_OK, DATABASE_SSL_CA_FILE: caFile });
    rmSync(directory, { recursive: true, force: true });

    expect(config.database).toEqual({
      driver: 'postgres',
      connection: {
        host: 'aws-0-us-east-1.pooler.supabase.com',
        port: 5432,
        user: 'postgres.abcdefghijklmnopqrst',
        password: 'Cl4ve@segura',
        database: 'postgres',
      },
      sslCaFile: caFile,
      label: 'aws-0-us-east-1.pooler.supabase.com:5432/postgres (usuario postgres.abcdefghijklmnopqrst)',
    });
    expect(config.warnings.join('\n')).not.toContain('Cl4ve');
  });

  it('exige el CA con un Postgres remoto también fuera de producción; sin CA solo se tolera un Postgres local', () => {
    const remote = problemsOf({ DATABASE_URL: URL_OK });
    expect(remote).toMatch(/DATABASE_SSL_CA_FILE: es obligatoria con Postgres remoto/);
    expect(remote).not.toContain('Cl4ve');

    const local = parseConfig({ DATABASE_URL: 'postgresql://postgres:clave@127.0.0.1:5432/postgres' });
    expect(local.database).toMatchObject({ driver: 'postgres', sslCaFile: undefined });
    expect(local.warnings.join('\n')).toMatch(/Postgres local va cifrada pero SIN verificar/);
  });

  it('DB_DRIVER manda: sqlite ignora DATABASE_URL (con aviso); postgres sin DATABASE_URL falla', () => {
    const sqlite = parseConfig({ DB_DRIVER: 'sqlite', DATABASE_URL: URL_OK });
    expect(sqlite.database.driver).toBe('sqlite');
    expect(sqlite.warnings.join('\n')).toMatch(/se ignora DATABASE_URL/);

    expect(problemsOf({ DB_DRIVER: 'postgres' })).toMatch(/DATABASE_URL: es obligatoria con DB_DRIVER=postgres/);
    expect(problemsOf({ DB_DRIVER: 'mysql' })).toMatch(/DB_DRIVER: tiene que ser sqlite o postgres/);
  });

  it('rechaza una DATABASE_URL inválida o con [YOUR-PASSWORD] sin repetir su contenido', () => {
    const placeholder = problemsOf({ DATABASE_URL: 'postgresql://postgres.ref:[YOUR-PASSWORD]@host:5432/postgres' });
    expect(placeholder).toMatch(/\[YOUR-PASSWORD\]: reemplazalo/);

    for (const bad of ['mysql://u:secretito@host/db', 'postgresql://u@host/db', 'postgresql://u:secretito@host', 'no es url secretito']) {
      const message = problemsOf({ DATABASE_URL: bad });
      expect(message, bad).toMatch(/DATABASE_URL:/);
      expect(message, bad).not.toContain('secretito');
    }
  });

  it('en producción exige DB_DRIVER y, con Postgres, el certificado CA de Supabase', () => {
    const { DB_DRIVER: _omitted, ...withoutDriver } = PRODUCTION;
    expect(problemsOf(withoutDriver)).toMatch(/DB_DRIVER: es obligatorio en producción/);

    expect(problemsOf({ ...PRODUCTION, DB_DRIVER: 'postgres', DATABASE_URL: URL_OK })).toMatch(
      /DATABASE_SSL_CA_FILE: es obligatoria con Postgres remoto/,
    );

    const directory = mkdtempSync(path.join(tmpdir(), 'mg-ca-'));
    try {
      const caFile = path.join(directory, 'supabase-ca.crt');
      expect(problemsOf({ ...PRODUCTION, DB_DRIVER: 'postgres', DATABASE_URL: URL_OK, DATABASE_SSL_CA_FILE: caFile })).toMatch(
        /DATABASE_SSL_CA_FILE: no existe el archivo/,
      );
      writeFileSync(caFile, '-----BEGIN CERTIFICATE-----\n');
      const config = parseConfig({ ...PRODUCTION, DB_DRIVER: 'postgres', DATABASE_URL: URL_OK, DATABASE_SSL_CA_FILE: caFile });
      expect(config.database).toMatchObject({ driver: 'postgres', sslCaFile: caFile });
      expect(config.warnings).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('resolveDbPath y loadDotEnv', () => {
  it('resuelve las rutas relativas desde la raíz del backend, no desde el cwd', () => {
    expect(resolveDbPath(undefined)).toBe(path.join(BACKEND_ROOT, 'storage', 'mgdetailing.db'));
    expect(resolveDbPath('./datos/otra.db')).toBe(path.join(BACKEND_ROOT, 'datos', 'otra.db'));
    expect(resolveDbPath(':memory:')).toBe(':memory:');
  });

  describe('loadDotEnv', () => {
    const touched = ['MG_TEST_FROM_FILE', 'MG_TEST_ALREADY_SET'];
    let directory: string | undefined;

    afterEach(() => {
      for (const key of touched) Reflect.deleteProperty(process.env, key);
      if (directory) rmSync(directory, { recursive: true, force: true });
      directory = undefined;
    });

    it('carga el archivo pero NO pisa lo que ya está en el entorno; si no existe, no hace nada', () => {
      directory = mkdtempSync(path.join(tmpdir(), 'mg-env-'));
      const file = path.join(directory, '.env');
      writeFileSync(file, 'MG_TEST_FROM_FILE=desde_archivo\nMG_TEST_ALREADY_SET=desde_archivo\n');
      process.env.MG_TEST_ALREADY_SET = 'desde_entorno';

      loadDotEnv(file);

      expect(process.env.MG_TEST_FROM_FILE).toBe('desde_archivo');
      expect(process.env.MG_TEST_ALREADY_SET).toBe('desde_entorno');
      expect(() => { loadDotEnv(path.join(tmpdir(), 'no-existe', '.env')); }).not.toThrow();
    });
  });
});

describe('avisos por WhatsApp', () => {
  const CALLMEBOT = { WHATSAPP_PROVIDER: 'callmebot', WHATSAPP_OWNER_PHONE: '+54 9 380 478-1737' };

  it('por defecto están desactivados', () => {
    expect(parseConfig({}).whatsapp).toEqual({ provider: 'none' });
  });

  it('callmebot completo: normaliza el teléfono a dígitos', () => {
    const config = parseConfig({ ...CALLMEBOT, CALLMEBOT_APIKEY: '123456', PUBLIC_URL: 'https://mgdetailing.com.ar/' });
    expect(config.whatsapp).toEqual({ provider: 'callmebot', ownerPhone: '5493804781737', apikey: '123456' });
    expect(config.publicUrl).toBe('https://mgdetailing.com.ar');
  });

  it('callmebot sin apikey: en desarrollo avisa y queda desactivado; en producción no arranca', () => {
    const dev = parseConfig({ ...CALLMEBOT, CALLMEBOT_APIKEY: '' });
    expect(dev.whatsapp).toEqual({ provider: 'none' });
    expect(dev.warnings.join('\n')).toContain('CALLMEBOT_APIKEY');

    expect(problemsOf({ ...PRODUCTION, ...CALLMEBOT })).toContain('CALLMEBOT_APIKEY: es obligatoria');
    expect(problemsOf({ WHATSAPP_PROVIDER: 'callmebot', CALLMEBOT_APIKEY: '1' })).toContain('WHATSAPP_OWNER_PHONE');
  });

  it('cloud exige todas sus variables', () => {
    const message = problemsOf({ WHATSAPP_PROVIDER: 'cloud' });
    for (const name of [
      'WHATSAPP_OWNER_PHONE',
      'WHATSAPP_CLOUD_TOKEN',
      'WHATSAPP_CLOUD_PHONE_NUMBER_ID',
      'WHATSAPP_CLOUD_TEMPLATE',
    ]) {
      expect(message).toContain(name);
    }
    const config = parseConfig({
      WHATSAPP_PROVIDER: 'cloud',
      WHATSAPP_OWNER_PHONE: '5493804781737',
      WHATSAPP_CLOUD_TOKEN: 't',
      WHATSAPP_CLOUD_PHONE_NUMBER_ID: '123456789',
      WHATSAPP_CLOUD_TEMPLATE: 'nuevo_turno',
    });
    expect(config.whatsapp).toMatchObject({ provider: 'cloud', language: 'es_AR' });
  });

  it('rechaza un proveedor desconocido', () => {
    expect(problemsOf({ WHATSAPP_PROVIDER: 'signal' })).toContain('none, callmebot, cloud o telegram');
  });
});

describe('avisos por Telegram', () => {
  // Valor ficticio: tiene el formato que acepta la config pero no el de un token real,
  // para que los escáneres de secretos (GitHub) no lo marquen.
  const TOKEN = '123456:token-de-prueba-falso-no-real';

  it('con token y chat id queda activo', () => {
    const config = parseConfig({ WHATSAPP_PROVIDER: 'telegram', TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '987654321' });
    expect(config.whatsapp).toEqual({ provider: 'telegram', botToken: TOKEN, chatId: '987654321' });
  });

  it('incompleto: en desarrollo avisa y queda desactivado; en producción no arranca', () => {
    const dev = parseConfig({ WHATSAPP_PROVIDER: 'telegram', TELEGRAM_BOT_TOKEN: TOKEN });
    expect(dev.whatsapp).toEqual({ provider: 'none' });
    expect(dev.warnings.join('\n')).toContain('TELEGRAM_CHAT_ID');
    expect(problemsOf({ ...PRODUCTION, WHATSAPP_PROVIDER: 'telegram' })).toContain('TELEGRAM_BOT_TOKEN');
    expect(problemsOf({ WHATSAPP_PROVIDER: 'telegram', TELEGRAM_BOT_TOKEN: 'basura', TELEGRAM_CHAT_ID: 'x' })).toContain(
      'TELEGRAM_CHAT_ID',
    );
  });
});
