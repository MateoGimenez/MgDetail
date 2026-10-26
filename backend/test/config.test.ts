import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_RATE_LIMITS, loadDotEnv, parseConfig as parseRaw } from '../src/config.js';
import { generarClavesVapid } from '../src/scripts/vapid-cli.js';

// Certificado CA "de mentira": la config solo verifica que el archivo exista.
const caDirectory = mkdtempSync(path.join(tmpdir(), 'mg-ca-'));
const CA_FILE = path.join(caDirectory, 'supabase-ca.crt');
writeFileSync(CA_FILE, '-----BEGIN CERTIFICATE-----\n');
afterAll(() => {
  rmSync(caDirectory, { recursive: true, force: true });
});

const URL_OK =
  'postgresql://mgdetailing_app.abcdefghijklmnopqrst:Cl4ve%40segura@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=disable';
const SUPABASE = {
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_AbCdEf0123456789_xyz',
  // Armada por partes para que los escáneres de secretos (GitHub) no la tomen por una clave real.
  SUPABASE_SECRET_KEY: ['sb', 'secret', 'DePrueba0123456789'].join('_'),
};
/** Lo mínimo para arrancar sin avisos: Postgres (con su CA) y Supabase Auth (con la secret key opcional). */
const BASE = { DATABASE_URL: URL_OK, DATABASE_SSL_CA_FILE: CA_FILE, ...SUPABASE };
const PRODUCTION = {
  NODE_ENV: 'production',
  FRONTEND_ORIGIN: 'https://mgdetailing.com.ar',
  TRUST_PROXY: '1',
};

/** parseConfig con lo obligatorio ya cargado: cada test agrega o pisa lo que prueba. */
const parseConfig = (env: NodeJS.ProcessEnv) => parseRaw({ ...BASE, ...env });

function problemsOfRaw(env: NodeJS.ProcessEnv): string {
  try {
    parseRaw(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  throw new Error('Se esperaba un ConfigError y no se lanzó');
}

const problemsOf = (env: NodeJS.ProcessEnv): string => problemsOfRaw({ ...BASE, ...env });

describe('desarrollo: defaults seguros', () => {
  it('con la base y Supabase configurados arranca con los valores por defecto y sin avisos', () => {
    const config = parseConfig({});

    expect(config).toMatchObject({
      nodeEnv: 'development',
      isProduction: false,
      host: '127.0.0.1',
      port: 4000,
      frontendOrigins: ['http://localhost:5173'],
      sessionCookieMaxAgeSeconds: 8 * 60 * 60,
      trustProxy: false,
      serveFrontend: false,
      rateLimits: DEFAULT_RATE_LIMITS,
      warnings: [],
    });
    expect(DEFAULT_RATE_LIMITS.bookings).toEqual({ windowMs: 15 * 60 * 1000, limit: 5 });
    expect(DEFAULT_RATE_LIMITS.loginFailures).toEqual({ windowMs: 15 * 60 * 1000, limit: 5 });
  });

  it('las variables vacías (FOO=) cuentan como no definidas', () => {
    const config = parseConfig({ PORT: '', HOST: ' ', FRONTEND_ORIGIN: '', TRUST_PROXY: '', SERVE_FRONTEND: '' });

    expect(config).toMatchObject({ port: 4000, host: '127.0.0.1', trustProxy: false, serveFrontend: false });
    expect(config.frontendOrigins).toEqual(['http://localhost:5173']);
  });

  it('sin nada configurado no arranca y pide DATABASE_URL, SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY', () => {
    const message = problemsOfRaw({});
    expect(message).toMatch(/DATABASE_URL: es obligatoria/);
    expect(message).toMatch(/SUPABASE_URL: es obligatoria/);
    expect(message).toMatch(/SUPABASE_PUBLISHABLE_KEY: es obligatoria/);
  });

  it('variables viejas: DB_DRIVER=postgres se acepta, DB_DRIVER=sqlite se rechaza, DB_PATH y JWT_SECRET solo avisan', () => {
    expect(parseConfig({ DB_DRIVER: 'postgres' }).warnings).toEqual([]);
    expect(problemsOf({ DB_DRIVER: 'sqlite' })).toMatch(/DB_DRIVER: el único motor es postgres/);
    const warnings = parseConfig({ DB_PATH: './storage/mgdetailing.db', JWT_SECRET: 'x'.repeat(40) }).warnings.join('\n');
    expect(warnings).toMatch(/DB_PATH ya no se usa/);
    expect(warnings).toMatch(/JWT_SECRET ya no se usa/);

    // Las claves viejas de Supabase en el entorno se avisan (sin mostrar su valor).
    const legacy = parseConfig({ SUPABASE_SERVICE_ROLE_KEY: 'eyJ.valor-que-no-se-muestra' }).warnings.join('\n');
    expect(legacy).toMatch(/SUPABASE_SERVICE_ROLE_KEY: el backend no usa estas claves/);
    expect(legacy).not.toContain('valor-que-no-se-muestra');
  });
});

describe('Supabase Auth', () => {
  it('deriva la URL de Auth (emisor de los tokens) y el JWKS de SUPABASE_URL, sin pedir otra variable', () => {
    expect(parseConfig({ SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co/' }).supabase).toEqual({
      url: 'https://abcdefghijklmnopqrst.supabase.co',
      authUrl: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
      jwksUrl: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1/.well-known/jwks.json',
      publishableKey: SUPABASE.SUPABASE_PUBLISHABLE_KEY,
      secretKey: SUPABASE.SUPABASE_SECRET_KEY,
    });
  });

  it('SUPABASE_SECRET_KEY: opcional (sin ella solo avisa); si está, tiene que ser sb_secret_ y nunca se repite', () => {
    const sinClave = parseConfig({ SUPABASE_SECRET_KEY: '' });
    expect(sinClave.supabase.secretKey).toBeUndefined();
    expect(sinClave.warnings.join('\n')).toMatch(/SUPABASE_SECRET_KEY: no está configurada/);

    const legacy = 'eyJhbGciOiJIUzI1NiJ9.service-role-viejo';
    expect(problemsOf({ SUPABASE_SECRET_KEY: legacy })).toMatch(/no parece una secret key/);
    expect(problemsOf({ SUPABASE_SECRET_KEY: legacy })).not.toContain(legacy);
    const publishable = SUPABASE.SUPABASE_PUBLISHABLE_KEY;
    expect(problemsOf({ SUPABASE_SECRET_KEY: publishable })).toMatch(/tiene la clave publishable/);
    expect(problemsOf({ SUPABASE_SECRET_KEY: publishable })).not.toContain(publishable);
  });

  it('SUPABASE_URL: https sin ruta (http solo para un Supabase local)', () => {
    for (const bad of ['http://abc.supabase.co', 'https://abc.supabase.co/auth/v1', 'no-es-url']) {
      expect(problemsOf({ SUPABASE_URL: bad }), bad).toMatch(/SUPABASE_URL: tiene que ser https/);
    }
    expect(parseConfig({ SUPABASE_URL: 'http://127.0.0.1:54321' }).supabase.authUrl).toBe('http://127.0.0.1:54321/auth/v1');
  });

  it('SUPABASE_PUBLISHABLE_KEY: tiene que ser sb_publishable_; una secret key se rechaza sin repetirla', () => {
    // Armada por partes para que los escáneres de secretos (GitHub) no la tomen por una clave real.
    const secret = ['sb', 'secret', 'NoDeberiaEstarAca0123456789'].join('_');
    const message = problemsOf({ SUPABASE_PUBLISHABLE_KEY: secret });
    expect(message).toMatch(/SECRET key/);
    expect(message).not.toContain(secret);
    expect(problemsOf({ SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.legacy' })).toMatch(/no parece una clave publishable/);
  });
});

describe('producción', () => {
  it('con todo lo obligatorio arranca sin avisos', () => {
    expect(parseConfig(PRODUCTION)).toMatchObject({
      isProduction: true,
      frontendOrigins: ['https://mgdetailing.com.ar'],
      trustProxy: 1,
      warnings: [],
    });
  });

  it('sin FRONTEND_ORIGIN (o vacío) falla', () => {
    for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'production', FRONTEND_ORIGIN: '' }]) {
      expect(problemsOf(env)).toMatch(/FRONTEND_ORIGIN: es obligatorio en producción/);
    }
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
    const message = problemsOf({ PORT: 'abc', TRUST_PROXY: 'true', FRONTEND_ORIGIN: '*', SUPABASE_URL: 'x' });

    for (const name of ['PORT', 'TRUST_PROXY', 'FRONTEND_ORIGIN', 'SUPABASE_URL']) expect(message).toContain(name);
  });
});

describe('base de datos: Postgres', () => {
  it('separa las partes de DATABASE_URL (decodifica la contraseña, ignora sslmode) y no la muestra', () => {
    const config = parseConfig({});

    expect(config.database).toEqual({
      connection: {
        host: 'aws-0-us-east-1.pooler.supabase.com',
        port: 5432,
        user: 'mgdetailing_app.abcdefghijklmnopqrst',
        password: 'Cl4ve@segura',
        database: 'postgres',
      },
      sslCaFile: CA_FILE,
      label: 'aws-0-us-east-1.pooler.supabase.com:5432/postgres (usuario mgdetailing_app.abcdefghijklmnopqrst)',
    });
    expect(config.warnings.join('\n')).not.toContain('Cl4ve');
  });

  it('exige el CA con un Postgres remoto en cualquier entorno; sin CA solo se tolera un Postgres local fuera de producción', () => {
    const remote = problemsOfRaw({ ...SUPABASE, DATABASE_URL: URL_OK });
    expect(remote).toMatch(/DATABASE_SSL_CA_FILE: es obligatoria con Postgres remoto/);
    expect(remote).not.toContain('Cl4ve');
    expect(problemsOf({ DATABASE_SSL_CA_FILE: path.join(caDirectory, 'no-existe.crt') })).toMatch(
      /DATABASE_SSL_CA_FILE: no existe el archivo/,
    );

    const LOCAL = 'postgresql://postgres:clave@127.0.0.1:5432/postgres';
    const local = parseRaw({ ...SUPABASE, DATABASE_URL: LOCAL });
    expect(local.database).toMatchObject({ sslCaFile: undefined });
    expect(local.warnings.join('\n')).toMatch(/Postgres local va cifrada pero SIN verificar/);
    expect(problemsOfRaw({ ...SUPABASE, ...PRODUCTION, DATABASE_URL: LOCAL })).toMatch(/DATABASE_SSL_CA_FILE: es obligatoria/);
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

describe('recordatorios', () => {
  const SECRETO = 'secreto-de-cron-de-prueba-0123456789abcdef';
  // Armada por partes para que los escáneres de secretos no la tomen por una clave real.
  const RESEND = ['re', 'DePrueba0123456789'].join('_');
  const EMAIL = { RESEND_API_KEY: RESEND, RECORDATORIO_EMAIL_DESDE: 'MgDetailing <turnos@mgdetailing.com.ar>' };
  const CLOUD = {
    WHATSAPP_CLOUD_TOKEN: 'token-de-meta',
    WHATSAPP_CLOUD_PHONE_NUMBER_ID: '123456789',
    WHATSAPP_CLOUD_TEMPLATE_RECORDATORIO: 'recordatorio_turno',
  };

  it('por defecto: sin canales, sin CRON_SECRET y sin avisos', () => {
    const config = parseConfig({});
    expect(config.recordatorios).toEqual({ cronSecret: undefined, email: undefined, whatsapp: undefined });
    expect(config.warnings).toEqual([]);
  });

  it('completo: email y WhatsApp (independiente de WHATSAPP_PROVIDER), con el idioma por defecto', () => {
    const config = parseConfig({ CRON_SECRET: SECRETO, ...EMAIL, ...CLOUD, RECORDATORIO_EMAIL_DESDE: 'turnos@mgdetailing.com.ar' });
    expect(config.whatsapp).toEqual({ provider: 'none' });
    expect(config.recordatorios).toEqual({
      cronSecret: SECRETO,
      email: { apiKey: RESEND, from: 'turnos@mgdetailing.com.ar' },
      whatsapp: { token: 'token-de-meta', phoneNumberId: '123456789', template: 'recordatorio_turno', language: 'es_AR' },
    });
    expect(config.warnings).toEqual([]);
    expect(parseConfig({ CRON_SECRET: SECRETO, ...EMAIL }).recordatorios.email?.from).toBe(EMAIL.RECORDATORIO_EMAIL_DESDE);
  });

  it('valida CRON_SECRET, la API key y el remitente sin repetir el valor', () => {
    const corto = problemsOf({ CRON_SECRET: 'corto-secreto' });
    expect(corto).toContain('CRON_SECRET: tiene que tener al menos 32 caracteres');
    expect(corto).not.toContain('corto-secreto');
    expect(problemsOf({ CRON_SECRET: `${'a'.repeat(20)} ${'b'.repeat(20)}` })).toContain('CRON_SECRET: solo puede tener');
    expect(problemsOf({ RESEND_API_KEY: 'sk_otra_cosa_123456789' })).toContain('RESEND_API_KEY: no parece');
    for (const desde of ['no-es-email', 'Nombre <no-es-email>', 'a@b.com\r\nBcc: x@y.z', `${'n'.repeat(81)} <a@b.com>`]) {
      expect(problemsOf({ ...EMAIL, RECORDATORIO_EMAIL_DESDE: desde }), desde).toContain('RECORDATORIO_EMAIL_DESDE');
    }
    expect(problemsOf({ WHATSAPP_CLOUD_TEMPLATE_RECORDATORIO: 'Con Mayúsculas' })).toContain('WHATSAPP_CLOUD_TEMPLATE_RECORDATORIO');
  });

  it('un canal a medio configurar: en desarrollo avisa y queda desactivado; en producción no arranca', () => {
    const dev = parseConfig({ RESEND_API_KEY: RESEND, WHATSAPP_CLOUD_TEMPLATE_RECORDATORIO: 'recordatorio_turno' });
    expect(dev.recordatorios).toEqual({ cronSecret: undefined, email: undefined, whatsapp: undefined });
    expect(dev.warnings.join('\n')).toContain('RECORDATORIO_EMAIL_DESDE');
    expect(dev.warnings.join('\n')).toContain('WHATSAPP_CLOUD_TOKEN');
    expect(problemsOf({ ...PRODUCTION, RECORDATORIO_EMAIL_DESDE: 'turnos@mgdetailing.com.ar' })).toContain('RESEND_API_KEY');
    expect(problemsOf({ ...PRODUCTION, WHATSAPP_CLOUD_TEMPLATE_RECORDATORIO: 'x' })).toContain('WHATSAPP_CLOUD_PHONE_NUMBER_ID');
  });

  it('avisa si hay secreto sin canal o canal sin secreto', () => {
    expect(parseConfig({ CRON_SECRET: SECRETO }).warnings.join('\n')).toContain('no hay ningún canal');
    expect(parseConfig({ ...EMAIL }).warnings.join('\n')).toContain('falta CRON_SECRET');
    expect(parseConfig({ CRON_SECRET: SECRETO }).warnings.join('\n')).not.toContain(SECRETO);
  });
});

describe('avisos push (VAPID)', () => {
  const par = generarClavesVapid();
  const VAPID = { VAPID_PUBLIC_KEY: par.publicKey, VAPID_PRIVATE_KEY: par.privateKey, VAPID_SUBJECT: 'mailto:dueno@mgdetailing.com.ar' };

  it('por defecto: apagados y sin avisos de configuración', () => {
    const config = parseConfig({});
    expect(config.push).toBeUndefined();
    expect(config.warnings).toEqual([]);
  });

  it('con las tres variables queda activado (mailto: o https:)', () => {
    expect(parseConfig(VAPID).push).toEqual({
      publicKey: par.publicKey,
      privateKey: par.privateKey,
      subject: 'mailto:dueno@mgdetailing.com.ar',
    });
    expect(parseConfig({ ...VAPID, VAPID_SUBJECT: 'https://mgdetailing.com.ar' }).push?.subject).toBe('https://mgdetailing.com.ar');
  });

  it('las tres juntas o ninguna: con una o dos falla (también en desarrollo) y no repite la clave privada', () => {
    for (const parcial of [
      { VAPID_PUBLIC_KEY: VAPID.VAPID_PUBLIC_KEY },
      { VAPID_PRIVATE_KEY: VAPID.VAPID_PRIVATE_KEY },
      { VAPID_SUBJECT: VAPID.VAPID_SUBJECT },
      { VAPID_PUBLIC_KEY: VAPID.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: VAPID.VAPID_PRIVATE_KEY },
    ]) {
      const message = problemsOf(parcial);
      expect(message, JSON.stringify(Object.keys(parcial))).toMatch(/VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT: van las tres juntas o ninguna/);
      expect(message).not.toContain(par.privateKey);
    }
    expect(problemsOf({ ...PRODUCTION, VAPID_SUBJECT: VAPID.VAPID_SUBJECT })).toMatch(/van las tres juntas/);
  });

  it('valida el formato de cada una sin repetir el valor', () => {
    expect(problemsOf({ ...VAPID, VAPID_PUBLIC_KEY: 'no-es-una-clave' })).toMatch(/VAPID_PUBLIC_KEY: no parece una clave pública VAPID/);
    // 87 caracteres, pero no empieza con el byte 0x04 de un punto sin comprimir.
    expect(problemsOf({ ...VAPID, VAPID_PUBLIC_KEY: 'A'.repeat(87) })).toMatch(/VAPID_PUBLIC_KEY: no parece/);
    const mala = `${par.privateKey}!`;
    const message = problemsOf({ ...VAPID, VAPID_PRIVATE_KEY: mala });
    expect(message).toMatch(/VAPID_PRIVATE_KEY: no parece una clave privada VAPID/);
    expect(message).not.toContain(mala);
    for (const subject of ['dueno@mgdetailing.com.ar', 'http://mgdetailing.com.ar', 'mailto:sin-arroba', 'https://', 'mailto:a@b.com c']) {
      expect(problemsOf({ ...VAPID, VAPID_SUBJECT: subject }), subject).toMatch(/VAPID_SUBJECT: tiene que ser mailto:/);
    }
  });
});
