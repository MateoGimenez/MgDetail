import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DEFAULT_SCRYPT_PARAMS, type ScryptParams } from './lib/password.js';

/** Carpeta raíz del backend. Vale tanto desde src/ (tsx) como desde dist/ (build): ambas están un nivel abajo. */
export const BACKEND_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export type NodeEnv = 'development' | 'test' | 'production';

/** Valores válidos para `trust proxy` de Express (nunca `true`: ver parseo de TRUST_PROXY). */
export type TrustProxySetting = false | number | string[];

export interface RateLimitRule {
  windowMs: number;
  limit: number;
}

/** Proveedor de avisos al dueño (WhatsApp o Telegram). `ownerPhone`: solo dígitos, con código de país (5493804781737). */
export type WhatsappConfig =
  | { provider: 'none' }
  | { provider: 'callmebot'; ownerPhone: string; apikey: string }
  | { provider: 'telegram'; botToken: string; chatId: string }
  | {
      provider: 'cloud';
      ownerPhone: string;
      token: string;
      phoneNumberId: string;
      template: string;
      language: string;
    };

export interface AppConfig {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  host: string;
  port: number;
  /**
   * Orígenes del frontend permitidos (esquema + host + puerto, sin barra final), al menos uno. Lo usan CORS y el
   * chequeo de Origin de la defensa CSRF. Normalmente es uno solo; la lista sirve, por ejemplo, para probar desde
   * el celular por la red local (http://192.168.x.x:5173).
   */
  frontendOrigins: readonly string[];
  jwtSecret: string;
  /** Duración de la sesión en segundos (8 h). */
  sessionTtlSeconds: number;
  /** Ruta absoluta del archivo SQLite, o ':memory:'. */
  dbPath: string;
  trustProxy: TrustProxySetting;
  serveFrontend: boolean;
  /** Carpeta con el build del frontend (../frontend/dist). */
  frontendDistPath: string;
  passwordHashing: ScryptParams;
  rateLimits: {
    /** Tope general para toda la API, por IP. */
    api: RateLimitRule;
    /** Solicitudes de turno creadas, por IP. */
    bookings: RateLimitRule;
    /** Intentos de login FALLIDOS, por IP. */
    loginFailures: RateLimitRule;
  };
  whatsapp: WhatsappConfig;
  /** Origen público del sitio (sin barra final), para el link al panel en los avisos. */
  publicUrl: string | undefined;
  /** Avisos para mostrar al arrancar (ej.: JWT_SECRET generado al vuelo). */
  warnings: string[];
}

const DEFAULT_DB_PATH = './storage/mgdetailing.db';
const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';
const MAX_FRONTEND_ORIGINS = 10;
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export const DEFAULT_RATE_LIMITS: AppConfig['rateLimits'] = {
  api: { windowMs: 60 * 1000, limit: 300 },
  bookings: { windowMs: 15 * 60 * 1000, limit: 5 },
  loginFailures: { windowMs: 15 * 60 * 1000, limit: 5 },
};

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Configuración inválida:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Carga backend/.env si existe (process.loadEnvFile nativo). Las variables que ya están definidas en
 * el entorno del proceso tienen prioridad sobre las del archivo.
 */
export function loadDotEnv(file: string = path.join(BACKEND_ROOT, '.env')): void {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

/** Ruta absoluta de la base. Las rutas relativas se resuelven desde la raíz del backend, no desde el cwd. */
export function resolveDbPath(raw: string | undefined): string {
  const value = raw?.trim() ? raw.trim() : DEFAULT_DB_PATH;
  return value === ':memory:' ? value : path.resolve(BACKEND_ROOT, value);
}

// ---------------------------------------------------------------------------------------------
// Validación de variables de entorno
// ---------------------------------------------------------------------------------------------

/** Las variables vacías (`FOO=`) cuentan como no definidas. */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalEnv = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());

const NAMED_PROXY_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isValidProxyEntry(entry: string): boolean {
  if (NAMED_PROXY_RANGES.has(entry)) return true;
  const [address, prefix, ...extra] = entry.split('/');
  if (address === undefined || extra.length > 0) return false;
  const version = isIP(address);
  if (version === 0) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (version === 4 ? 32 : 128);
}

/** Normaliza un origen (esquema + host + puerto). undefined si no es un origen http(s) válido. */
function parseOrigin(raw: string): string | undefined {
  if (/[\s,*]/.test(raw)) return undefined; // sin espacios ni comodines
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  const isWeb = url.protocol === 'http:' || url.protocol === 'https:';
  const hasExtras =
    url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.pathname !== '/';
  return isWeb && !hasExtras ? url.origin : undefined;
}

/** Uno o varios orígenes separados por comas; cada uno se valida y normaliza. Sin duplicados. */
const originListSchema = z.string().transform((raw, ctx): string[] => {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  if (entries.length === 0 || entries.length > MAX_FRONTEND_ORIGINS) {
    ctx.addIssue({
      code: 'custom',
      message: `tiene que tener entre 1 y ${String(MAX_FRONTEND_ORIGINS)} orígenes separados por comas`,
    });
    return z.NEVER;
  }

  const origins: string[] = [];
  for (const entry of entries) {
    const origin = parseOrigin(entry);
    if (origin === undefined) {
      ctx.addIssue({
        code: 'custom',
        message:
          `"${entry.slice(0, 80)}" no es un origen válido: tiene que ser http(s)://host[:puerto] sin ruta ` +
          '(ej.: http://localhost:5173 o https://mgdetailing.com.ar). Para varios orígenes, separalos con comas.',
      });
      return z.NEVER;
    }
    if (!origins.includes(origin)) origins.push(origin);
  }
  return origins;
});

const trustProxySchema = z.string().transform((raw, ctx): TrustProxySetting => {
  const value = raw.trim();
  const lower = value.toLowerCase();
  if (lower === 'false' || value === '0') return false;
  if (lower === 'true') {
    ctx.addIssue({
      code: 'custom',
      message:
        'TRUST_PROXY=true confía en cualquier X-Forwarded-For y permite falsear la IP para saltear el rate limit. ' +
        'Indicá la cantidad de proxies (ej. 1) o la IP/CIDR del proxy (ej. 10.0.0.0/8, loopback).',
    });
    return z.NEVER;
  }
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (hops > 10) {
      ctx.addIssue({ code: 'custom', message: 'la cantidad de proxies tiene que estar entre 0 y 10' });
      return z.NEVER;
    }
    return hops;
  }
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (entries.length === 0 || !entries.every(isValidProxyEntry)) {
    ctx.addIssue({
      code: 'custom',
      message: 'tiene que ser false, la cantidad de proxies (ej. 1) o una lista de IP/CIDR (ej. 10.0.0.0/8, loopback)',
    });
    return z.NEVER;
  }
  return entries;
});

const originSchema = z.string().transform((raw, ctx): string => {
  const origin = parseOrigin(raw.trim());
  if (origin === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'tiene que ser http(s)://host sin ruta (ej.: https://mgdetailing.com.ar)',
    });
    return z.NEVER;
  }
  return origin;
});

/** Teléfono para WhatsApp: se aceptan "+", espacios y guiones; queda solo con dígitos (8 a 15). */
const whatsappPhoneSchema = z
  .string()
  .transform((raw) => raw.replace(/[\s+()-]/g, ''))
  .pipe(
    z.string().regex(/^\d{8,15}$/, {
      error: 'tiene que ser un número con código de país, sin 0 ni 15 (ej.: 5493804781737)',
    }),
  );

const envSchema = z.object({
  NODE_ENV: optionalEnv(
    z.enum(['development', 'test', 'production'], { error: 'tiene que ser development, test o production' }),
  ),
  PORT: optionalEnv(
    z
      .string()
      .trim()
      .regex(/^\d{1,5}$/, { error: 'tiene que ser un puerto numérico entre 1 y 65535' })
      .transform(Number)
      .refine((port) => port >= 1 && port <= 65535, { error: 'tiene que ser un puerto entre 1 y 65535' }),
  ),
  HOST: optionalEnv(
    z
      .string()
      .trim()
      .refine((host) => isIP(host) !== 0 || /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(host), {
        error: 'tiene que ser una IP o un nombre de host (ej. 127.0.0.1, 0.0.0.0)',
      }),
  ),
  FRONTEND_ORIGIN: optionalEnv(originListSchema),
  JWT_SECRET: optionalEnv(z.string().min(32, { error: 'tiene que tener al menos 32 caracteres' })),
  DB_PATH: optionalEnv(z.string().trim().max(500, { error: 'es demasiado larga' })),
  TRUST_PROXY: optionalEnv(trustProxySchema),
  PUBLIC_URL: optionalEnv(originSchema),
  WHATSAPP_PROVIDER: optionalEnv(
    z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.enum(['none', 'callmebot', 'cloud', 'telegram'], {
        error: 'tiene que ser none, callmebot, cloud o telegram',
      })),
  ),
  WHATSAPP_OWNER_PHONE: optionalEnv(whatsappPhoneSchema),
  CALLMEBOT_APIKEY: optionalEnv(z.string().trim().max(100, { error: 'es demasiado larga' })),
  TELEGRAM_BOT_TOKEN: optionalEnv(
    z.string().trim().regex(/^\d{5,15}:[\w-]{20,100}$/, { error: 'no parece un token de bot (formato 123456:ABC...)' }),
  ),
  TELEGRAM_CHAT_ID: optionalEnv(
    z.string().trim().regex(/^-?\d{4,20}$/, { error: 'tiene que ser numérico (el chat id que devuelve getUpdates)' }),
  ),
  WHATSAPP_CLOUD_TOKEN: optionalEnv(z.string().trim().max(1000, { error: 'es demasiado larga' })),
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: optionalEnv(
    z.string().trim().regex(/^\d{5,30}$/, { error: 'tiene que ser numérico (el "Phone number ID" de Meta)' }),
  ),
  WHATSAPP_CLOUD_TEMPLATE: optionalEnv(
    z.string().trim().regex(/^[a-z0-9_]{1,512}$/, { error: 'es el nombre de la plantilla (minúsculas, números y _)' }),
  ),
  WHATSAPP_CLOUD_LANGUAGE: optionalEnv(z.enum(['es_AR', 'es'], { error: 'tiene que ser es_AR o es' })),
  SERVE_FRONTEND: optionalEnv(
    z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.enum(['true', 'false', '1', '0'], { error: 'tiene que ser true o false' }))
      .transform((value) => value === 'true' || value === '1'),
  ),
});

/**
 * Valida el entorno y arma la configuración. Función pura (recibe el env), por eso es testeable.
 * Lanza ConfigError con TODOS los problemas juntos, en español.
 */
export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const problems: string[] = [];
  const warnings: string[] = [];

  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      problems.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }
  const values = parsed.success ? parsed.data : undefined;

  const nodeEnv: NodeEnv = values?.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  // Obligatorias en producción (en desarrollo hay valores por defecto seguros).
  if (parsed.success && isProduction) {
    if (values?.JWT_SECRET === undefined) {
      problems.push(
        "JWT_SECRET: es obligatorio en producción (mínimo 32 caracteres). Generá uno con: node -e \"console.log(require('node:crypto').randomBytes(48).toString('base64url'))\"",
      );
    }
    if (values?.FRONTEND_ORIGIN === undefined) {
      problems.push(
        'FRONTEND_ORIGIN: es obligatorio en producción (el origen público del sitio, ej.: https://mgdetailing.com.ar)',
      );
    }
  }

  // Avisos por WhatsApp: cada proveedor exige sus variables.
  let whatsapp: WhatsappConfig = { provider: 'none' };
  if (values !== undefined) {
    const provider = values.WHATSAPP_PROVIDER ?? 'none';
    const ownerPhone = values.WHATSAPP_OWNER_PHONE;
    if (provider === 'callmebot') {
      const apikey = values.CALLMEBOT_APIKEY;
      if (ownerPhone === undefined) {
        problems.push('WHATSAPP_OWNER_PHONE: es obligatoria con WHATSAPP_PROVIDER=callmebot (ej.: 5493804781737)');
      }
      if (apikey === undefined && !isProduction && ownerPhone !== undefined) {
        warnings.push(
          'CALLMEBOT_APIKEY está vacía: los avisos por WhatsApp quedan desactivados hasta completarla (ver README, "Avisos por WhatsApp").',
        );
      } else if (apikey === undefined) {
        problems.push(
          'CALLMEBOT_APIKEY: es obligatoria con WHATSAPP_PROVIDER=callmebot (es la clave que te manda el bot de CallMeBot por WhatsApp)',
        );
      } else if (ownerPhone !== undefined) {
        whatsapp = { provider, ownerPhone, apikey };
      }
    } else if (provider === 'telegram') {
      const { TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_CHAT_ID: chatId } = values;
      if (botToken !== undefined && chatId !== undefined) {
        whatsapp = { provider, botToken, chatId };
      } else if (!isProduction) {
        warnings.push(
          'TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID están vacías: los avisos por Telegram quedan desactivados hasta completarlas (ver README, "Avisos de turnos").',
        );
      } else {
        problems.push('TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID: son obligatorias con WHATSAPP_PROVIDER=telegram');
      }
    } else if (provider === 'cloud') {
      const required = [
        ['WHATSAPP_OWNER_PHONE', ownerPhone],
        ['WHATSAPP_CLOUD_TOKEN', values.WHATSAPP_CLOUD_TOKEN],
        ['WHATSAPP_CLOUD_PHONE_NUMBER_ID', values.WHATSAPP_CLOUD_PHONE_NUMBER_ID],
        ['WHATSAPP_CLOUD_TEMPLATE', values.WHATSAPP_CLOUD_TEMPLATE],
      ] as const;
      for (const [name, value] of required) {
        if (value === undefined) problems.push(`${name}: es obligatoria con WHATSAPP_PROVIDER=cloud`);
      }
      if (
        ownerPhone !== undefined &&
        values.WHATSAPP_CLOUD_TOKEN !== undefined &&
        values.WHATSAPP_CLOUD_PHONE_NUMBER_ID !== undefined &&
        values.WHATSAPP_CLOUD_TEMPLATE !== undefined
      ) {
        whatsapp = {
          provider,
          ownerPhone,
          token: values.WHATSAPP_CLOUD_TOKEN,
          phoneNumberId: values.WHATSAPP_CLOUD_PHONE_NUMBER_ID,
          template: values.WHATSAPP_CLOUD_TEMPLATE,
          language: values.WHATSAPP_CLOUD_LANGUAGE ?? 'es_AR',
        };
      }
    }
  }

  if (problems.length > 0 || values === undefined) {
    throw new ConfigError(problems);
  }

  let jwtSecret = values.JWT_SECRET;
  if (jwtSecret === undefined) {
    jwtSecret = randomBytes(48).toString('base64url');
    warnings.push(
      'JWT_SECRET no está definido: se generó uno aleatorio solo para esta ejecución. ' +
        'Las sesiones iniciadas se pierden cada vez que se reinicia el servidor.',
    );
  }

  const frontendOrigins = values.FRONTEND_ORIGIN ?? [DEFAULT_FRONTEND_ORIGIN];
  const trustProxy = values.TRUST_PROXY ?? false;

  if (isProduction) {
    const insecure = frontendOrigins.filter((origin) => {
      const { protocol, hostname } = new URL(origin);
      return protocol !== 'https:' && hostname !== 'localhost';
    });
    if (insecure.length > 0) {
      warnings.push(
        `FRONTEND_ORIGIN incluye orígenes sin https (${insecure.join(', ')}): la cookie de sesión es Secure en ` +
          'producción y el navegador no la va a guardar desde ahí.',
      );
    }
    if (trustProxy === false) {
      warnings.push(
        'TRUST_PROXY no está configurado: si el servidor está detrás de un proxy inverso, el rate limit ' +
          'va a ver la IP del proxy para todos los visitantes. Indicá la cantidad de proxies (ej. TRUST_PROXY=1).',
      );
    }
  }

  return {
    nodeEnv,
    isProduction,
    host: values.HOST ?? '127.0.0.1',
    port: values.PORT ?? 4000,
    frontendOrigins,
    jwtSecret,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
    dbPath: resolveDbPath(values.DB_PATH),
    trustProxy,
    serveFrontend: values.SERVE_FRONTEND ?? false,
    frontendDistPath: path.resolve(BACKEND_ROOT, '..', 'frontend', 'dist'),
    passwordHashing: { ...DEFAULT_SCRYPT_PARAMS },
    rateLimits: DEFAULT_RATE_LIMITS,
    whatsapp,
    publicUrl: values.PUBLIC_URL,
    warnings,
  };
}

/** Carga el .env y valida process.env. Es lo que usa el servidor al arrancar. */
export function loadConfig(): AppConfig {
  loadDotEnv();
  return parseConfig(process.env);
}
