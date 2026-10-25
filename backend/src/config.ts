import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

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

/**
 * Recordatorios del día anterior a los clientes (contrato: reportes/2026-10-23_11_disponibilidad-seguimiento-recordatorios.md).
 * Cada canal es independiente del aviso al dueño (WHATSAPP_PROVIDER): undefined = ese canal no está configurado.
 */
export interface RecordatoriosConfig {
  /** Bearer que tiene que mandar el cron a POST /api/internal/recordatorios. undefined = el endpoint responde 404. */
  cronSecret: string | undefined;
  /** Email con Resend: RESEND_API_KEY + RECORDATORIO_EMAIL_DESDE. */
  email: { apiKey: string; from: string } | undefined;
  /** WhatsApp Cloud API: WHATSAPP_CLOUD_TOKEN + WHATSAPP_CLOUD_PHONE_NUMBER_ID + WHATSAPP_CLOUD_TEMPLATE_RECORDATORIO. */
  whatsapp: { token: string; phoneNumberId: string; template: string; language: string } | undefined;
}

/**
 * Base de datos: Postgres en Supabase (único motor).
 * `connection` tiene la contraseña: no se loguea nunca; para mostrar está `label`.
 */
export interface DatabaseConfig {
  connection: PostgresConnection;
  /** CA raíz para verificar el certificado TLS del servidor (Supabase Root 2021 CA). undefined = sin verificar. */
  sslCaFile: string | undefined;
  /** host:puerto/base (usuario), sin contraseña: para logs. */
  label: string;
}

/**
 * Supabase Auth (login del panel). Todo se deriva de SUPABASE_URL; la clave publishable la usa SOLO el backend
 * (el navegador nunca habla con Supabase).
 */
export interface SupabaseAuthConfig {
  /** Origen del proyecto, sin barra final: https://<ref>.supabase.co */
  url: string;
  /** <url>/auth/v1: base de los endpoints de Auth y valor exacto del claim `iss` de los access tokens. */
  authUrl: string;
  /** <url>/auth/v1/.well-known/jwks.json: claves públicas con las que se verifican los access tokens. */
  jwksUrl: string;
  /** sb_publishable_...: va en la cabecera `apikey` de las llamadas a Auth. No es un secreto, pero no se loguea. */
  publishableKey: string;
  /**
   * sb_secret_...: SOLO para la API admin de Auth (crear, borrar y cambiar email o contraseña de usuarios del panel,
   * acciones de superadmin). Salta RLS en todo el proyecto: nunca se loguea ni sale del servidor. undefined = esas
   * acciones responden 503 y el resto del panel funciona igual.
   */
  secretKey: string | undefined;
}

export interface PostgresConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

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
  /** Vida de las cookies de sesión en segundos (8 h desde el último login o refresco). */
  sessionCookieMaxAgeSeconds: number;
  /** Conexión a Postgres (ver databaseConfigFromEnv). */
  database: DatabaseConfig;
  supabase: SupabaseAuthConfig;
  trustProxy: TrustProxySetting;
  serveFrontend: boolean;
  /** Carpeta con el build del frontend (../frontend/dist). */
  frontendDistPath: string;
  rateLimits: {
    /** Tope general para toda la API, por IP. */
    api: RateLimitRule;
    /** Solicitudes de turno creadas, por IP. */
    bookings: RateLimitRule;
    /** Intentos de login FALLIDOS, por IP. */
    loginFailures: RateLimitRule;
    /** Consultas de seguimiento de un turno (GET /api/turnos/:id), por IP. */
    seguimiento: RateLimitRule;
  };
  whatsapp: WhatsappConfig;
  recordatorios: RecordatoriosConfig;
  /** Origen público del sitio (sin barra final), para el link al panel en los avisos. */
  publicUrl: string | undefined;
  /** Avisos para mostrar al arrancar (ej.: variables que ya no se usan). */
  warnings: string[];
}

const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';
const MAX_FRONTEND_ORIGINS = 10;
const SESSION_COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;

export const DEFAULT_RATE_LIMITS: AppConfig['rateLimits'] = {
  api: { windowMs: 60 * 1000, limit: 300 },
  bookings: { windowMs: 15 * 60 * 1000, limit: 5 },
  loginFailures: { windowMs: 15 * 60 * 1000, limit: 5 },
  // Una persona mira su turno unas pocas veces; un barrido de ids necesitaría millones de pedidos.
  seguimiento: { windowMs: 15 * 60 * 1000, limit: 60 },
};

/** Largo mínimo de CRON_SECRET: suficiente entropía para que no se pueda adivinar por fuerza bruta. */
export const MIN_CRON_SECRET = 32;

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

/**
 * Remitente del recordatorio por email: `turnos@dominio` o `Nombre <turnos@dominio>` (el dominio verificado en
 * Resend). Sin saltos de línea ni caracteres de control (va en una cabecera del email).
 */
const emailFromSchema = z.string().transform((raw, ctx): string => {
  const value = raw.trim();
  const fail = () => {
    ctx.addIssue({
      code: 'custom',
      message: 'tiene que ser un email (turnos@mgdetailing.com.ar) o "Nombre <turnos@mgdetailing.com.ar>", del dominio verificado en Resend',
    });
    return z.NEVER;
  };
  if (value.length > 200 || /\p{Cc}/u.test(value)) return fail();
  const conNombre = /^([^<>"]{1,80}?)\s*<([^<>\s]+)>$/.exec(value);
  const email = conNombre ? conNombre[2] : value;
  if (email === undefined || !z.email().safeParse(email).success) return fail();
  return value;
});

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
  SUPABASE_URL: optionalEnv(z.string()),
  SUPABASE_PUBLISHABLE_KEY: optionalEnv(z.string()),
  SUPABASE_SECRET_KEY: optionalEnv(z.string()),
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
  WHATSAPP_CLOUD_TEMPLATE_RECORDATORIO: optionalEnv(
    z.string().trim().regex(/^[a-z0-9_]{1,512}$/, { error: 'es el nombre de la plantilla (minúsculas, números y _)' }),
  ),
  // Los mensajes de error nunca repiten el valor (es un secreto).
  CRON_SECRET: optionalEnv(
    z
      .string()
      .trim()
      .min(MIN_CRON_SECRET, {
        error: `tiene que tener al menos ${String(MIN_CRON_SECRET)} caracteres (generá uno con: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")`,
      })
      .max(200, { error: 'es demasiado larga' })
      .regex(/^[\x21-\x7E]+$/, { error: 'solo puede tener caracteres imprimibles, sin espacios' }),
  ),
  RESEND_API_KEY: optionalEnv(
    z.string().trim().regex(/^re_[A-Za-z0-9_-]{10,200}$/, { error: 'no parece una API key de Resend (empieza con re_)' }),
  ),
  RECORDATORIO_EMAIL_DESDE: optionalEnv(emailFromSchema),
  SERVE_FRONTEND: optionalEnv(
    z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.enum(['true', 'false', '1', '0'], { error: 'tiene que ser true o false' }))
      .transform((value) => value === 'true' || value === '1'),
  ),
});

// ---------------------------------------------------------------------------------------------
// Base de datos: Postgres (Supabase)
// ---------------------------------------------------------------------------------------------

const PASSWORD_PLACEHOLDER = /your-password/i;

/**
 * DATABASE_URL: postgres://usuario:contraseña@host:puerto/base (la cadena del pooler de Supabase).
 * Se desarma en sus partes: así ningún parámetro de la URL (sslmode, sslrootcert...) pisa la configuración
 * TLS del backend. Los mensajes de error NUNCA incluyen la URL (tiene la contraseña).
 */
const databaseUrlSchema = z.string().transform((raw, ctx): { connection: PostgresConnection; label: string } => {
  const fail = (message: string) => {
    ctx.addIssue({ code: 'custom', message });
    return z.NEVER;
  };
  const value = raw.trim();
  if (PASSWORD_PLACEHOLDER.test(value)) {
    return fail('todavía tiene el texto [YOUR-PASSWORD]: reemplazalo por la contraseña de la base (sin corchetes)');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(
      'no es una URL válida. Tiene que ser postgresql://usuario:contraseña@host:puerto/base. Si la contraseña ' +
        'tiene caracteres especiales (@ : / ? # % [ ]), codificalos o generá una nueva solo con letras y números.',
    );
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    return fail('tiene que empezar con postgresql:// (o postgres://)');
  }
  let user: string;
  let password: string;
  let database: string;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    return fail('tiene caracteres mal codificados (%) en el usuario, la contraseña o la base');
  }
  if (url.hostname === '' || user === '' || password === '') {
    return fail('le falta el host, el usuario o la contraseña (postgresql://usuario:contraseña@host:puerto/base)');
  }
  if (database === '' || database.includes('/')) {
    return fail('le falta el nombre de la base al final (en Supabase es /postgres)');
  }
  const port = url.port === '' ? 5432 : Number(url.port);
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1'); // IPv6 literal sin corchetes
  return {
    connection: { host, port, user, password, database },
    label: `${host}:${String(port)}/${database} (usuario ${user})`,
  };
});

/** Postgres en esta misma máquina (desarrollo con un Postgres local): el único caso donde se tolera TLS sin verificar. */
function isLoopbackHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === 'localhost' || lower === '::1' || (isIP(lower) === 4 && lower.startsWith('127.'));
}

const databaseEnvSchema = z.object({
  // SQLite se retiró: Postgres es el único motor. Se sigue aceptando DB_DRIVER=postgres para no romper los .env
  // existentes; cualquier otro valor se rechaza con una explicación.
  DB_DRIVER: optionalEnv(
    z
      .string()
      .trim()
      .toLowerCase()
      .pipe(
        z.literal('postgres', {
          error: 'el único motor es postgres (SQLite se retiró: el panel usa Supabase Auth). Borrá DB_DRIVER o poné postgres',
        }),
      ),
  ),
  DB_PATH: optionalEnv(z.string()),
  DATABASE_URL: optionalEnv(databaseUrlSchema),
  DATABASE_SSL_CA_FILE: optionalEnv(z.string().trim().max(500, { error: 'es demasiado larga' })),
});

export interface DatabaseConfigResult {
  database: DatabaseConfig | undefined;
  problems: string[];
  warnings: string[];
}

/**
 * Conexión a Postgres (Supabase): DATABASE_URL es obligatoria en todos los entornos (el panel usa Supabase Auth y
 * no funciona sin Supabase). Con Postgres remoto también se exige DATABASE_SSL_CA_FILE: sin el CA, la conexión va
 * cifrada pero sin verificar al servidor (expuesta a un intermediario). Solo un Postgres local se tolera sin CA.
 */
export function databaseConfigFromEnv(env: NodeJS.ProcessEnv, isProduction: boolean): DatabaseConfigResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const parsed = databaseEnvSchema.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      problems.push(`${issue.path.join('.')}: ${issue.message}`);
    }
    return { database: undefined, problems, warnings };
  }
  const values = parsed.data;

  if (values.DB_PATH !== undefined) {
    warnings.push('DB_PATH ya no se usa (SQLite se retiró; la base es Postgres en Supabase): podés borrarla del .env.');
  }

  if (values.DATABASE_URL === undefined) {
    problems.push(
      'DATABASE_URL: es obligatoria (la cadena de conexión del Session pooler de Supabase con el rol mgdetailing_app; ' +
        'ver README, "Conectar Supabase").',
    );
    return { database: undefined, problems, warnings };
  }

  let sslCaFile: string | undefined;
  if (values.DATABASE_SSL_CA_FILE !== undefined) {
    sslCaFile = path.resolve(BACKEND_ROOT, values.DATABASE_SSL_CA_FILE);
    if (!existsSync(sslCaFile)) {
      problems.push(`DATABASE_SSL_CA_FILE: no existe el archivo ${sslCaFile}`);
    }
  } else if (isProduction || !isLoopbackHost(values.DATABASE_URL.connection.host)) {
    // Sin el CA, un intermediario en la red (Wi-Fi pública, router comprometido) puede hacerse pasar por Supabase,
    // reenviar la autenticación y quedarse con la sesión de la base. Importa igual en la PC del dueño que en el
    // servidor (`npm run dev` apunta a la base REAL): se exige siempre que el host no sea local.
    problems.push(
      'DATABASE_SSL_CA_FILE: es obligatoria con Postgres remoto (el certificado raíz de Supabase, para verificar al servidor; ' +
        'ver README, "Conectar Supabase").',
    );
  } else {
    warnings.push(
      'DATABASE_SSL_CA_FILE no está definida: la conexión a Postgres local va cifrada pero SIN verificar el certificado del servidor.',
    );
  }

  return {
    database: { connection: values.DATABASE_URL.connection, label: values.DATABASE_URL.label, sslCaFile },
    problems,
    warnings,
  };
}

// ---------------------------------------------------------------------------------------------
// Supabase Auth
// ---------------------------------------------------------------------------------------------

/** https://<ref>.supabase.co (o un dominio propio), sin ruta. http solo para un Supabase local (supabase start). */
function parseSupabaseUrl(raw: string): string | undefined {
  const origin = parseOrigin(raw.trim().replace(/\/+$/, ''));
  if (origin === undefined) return undefined;
  const { protocol, hostname } = new URL(origin);
  if (protocol === 'https:') return origin;
  return isLoopbackHost(hostname.replace(/^\[(.*)\]$/, '$1')) ? origin : undefined;
}

/** Claves publishable nuevas (sb_publishable_...). La secret (sb_secret_...) nunca va en el backend del panel. */
const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{10,200}$/;
const SECRET_KEY = /^sb_secret_[A-Za-z0-9_-]{10,200}$/;

function supabaseConfigFromValues(
  url: string | undefined,
  key: string | undefined,
  secret: string | undefined,
  allProblems: string[],
): SupabaseAuthConfig | undefined {
  const problems: string[] = [];
  let origin: string | undefined;
  if (url === undefined) {
    problems.push(
      'SUPABASE_URL: es obligatoria (la URL del proyecto, ej.: https://iclsiweaqhupxvxbpekl.supabase.co). El login del panel usa Supabase Auth.',
    );
  } else {
    origin = parseSupabaseUrl(url);
    if (origin === undefined) {
      problems.push('SUPABASE_URL: tiene que ser https://<id-del-proyecto>.supabase.co, sin ruta ni barra final.');
    }
  }

  const trimmedKey = key?.trim();
  if (trimmedKey === undefined) {
    problems.push(
      'SUPABASE_PUBLISHABLE_KEY: es obligatoria (Project Settings > API Keys > Publishable key, empieza con sb_publishable_).',
    );
  } else if (trimmedKey.startsWith('sb_secret_')) {
    // Nunca se repite el valor: si es una secret key, el mensaje no debe filtrarla.
    problems.push(
      'SUPABASE_PUBLISHABLE_KEY: tiene una SECRET key (sb_secret_...). El backend solo necesita la publishable: ' +
        'reemplazala y, por las dudas, rotá la secret en el panel de Supabase.',
    );
  } else if (!PUBLISHABLE_KEY.test(trimmedKey)) {
    problems.push('SUPABASE_PUBLISHABLE_KEY: no parece una clave publishable (tiene que empezar con sb_publishable_).');
  }

  // Opcional. Como arriba, el valor nunca se repite en un mensaje.
  const trimmedSecret = secret?.trim();
  if (trimmedSecret !== undefined && !SECRET_KEY.test(trimmedSecret)) {
    problems.push(
      trimmedSecret.startsWith('sb_publishable_')
        ? 'SUPABASE_SECRET_KEY: tiene la clave publishable. Va la secret key (Project Settings > API Keys > Secret keys, empieza con sb_secret_).'
        : 'SUPABASE_SECRET_KEY: no parece una secret key (tiene que empezar con sb_secret_; las claves viejas service_role no se aceptan).',
    );
  }

  allProblems.push(...problems);
  if (origin === undefined || trimmedKey === undefined || problems.length > 0) {
    return undefined;
  }
  const authUrl = `${origin}/auth/v1`;
  return {
    url: origin,
    authUrl,
    jwksUrl: `${authUrl}/.well-known/jwks.json`,
    publishableKey: trimmedKey,
    secretKey: trimmedSecret,
  };
}

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

  const databaseResult = databaseConfigFromEnv(env, isProduction);
  problems.push(...databaseResult.problems);
  warnings.push(...databaseResult.warnings);

  const supabase = supabaseConfigFromValues(
    values?.SUPABASE_URL,
    values?.SUPABASE_PUBLISHABLE_KEY,
    values?.SUPABASE_SECRET_KEY,
    problems,
  );

  if (env.JWT_SECRET !== undefined && env.JWT_SECRET.trim() !== '') {
    warnings.push('JWT_SECRET ya no se usa (las sesiones son de Supabase Auth): podés borrarla del .env.');
  }
  // La secret key (sb_secret_) es la única clave secreta que usa el backend, y solo para la API admin de Auth. Las
  // viejas (service_role, JWT secret) no se usan: tenerlas en el entorno solo agranda lo que se filtra si alguien lee
  // el .env o las variables del proceso. Se avisa sin mostrar el valor.
  const legacyKeyVars = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_JWT_SECRET'].filter(
    (name) => (env[name]?.trim() ?? '') !== '',
  );
  if (legacyKeyVars.length > 0) {
    warnings.push(
      `${legacyKeyVars.join(', ')}: el backend no usa estas claves. Borralas del .env (y del entorno del servidor): ` +
        'saltan RLS en todo el proyecto y solo suman riesgo si se filtran. Para gestionar usuarios va SUPABASE_SECRET_KEY.',
    );
  }
  if (supabase !== undefined && supabase.secretKey === undefined) {
    warnings.push(
      'SUPABASE_SECRET_KEY: no está configurada. El panel funciona, pero el superadmin no puede crear ni eliminar ' +
        'usuarios, ni cambiarles el email o la contraseña.',
    );
  }

  // Obligatorias en producción (en desarrollo hay valores por defecto seguros).
  if (parsed.success && isProduction) {
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

  const recordatorios = recordatoriosFromValues(values, isProduction, problems, warnings);

  const database = databaseResult.database;
  if (problems.length > 0 || values === undefined || database === undefined || supabase === undefined) {
    throw new ConfigError(problems);
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
        `FRONTEND_ORIGIN incluye orígenes sin https (${insecure.join(', ')}): las cookies de sesión son Secure en ` +
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
    sessionCookieMaxAgeSeconds: SESSION_COOKIE_MAX_AGE_SECONDS,
    database,
    supabase,
    trustProxy,
    serveFrontend: values.SERVE_FRONTEND ?? false,
    frontendDistPath: path.resolve(BACKEND_ROOT, '..', 'frontend', 'dist'),
    rateLimits: DEFAULT_RATE_LIMITS,
    whatsapp,
    recordatorios,
    publicUrl: values.PUBLIC_URL,
    warnings,
  };
}

/**
 * Recordatorios (opcionales): cada canal se activa con sus variables, independiente de WHATSAPP_PROVIDER. Un canal a
 * medio configurar es un aviso en desarrollo y un error en producción (como los proveedores de avisos). Sin nada
 * configurado, no hay avisos: los recordatorios quedan desactivados y el endpoint interno responde 404.
 */
function recordatoriosFromValues(
  values: z.output<typeof envSchema> | undefined,
  isProduction: boolean,
  problems: string[],
  warnings: string[],
): RecordatoriosConfig {
  const vacio: RecordatoriosConfig = { cronSecret: undefined, email: undefined, whatsapp: undefined };
  if (values === undefined) return vacio;
  const incompleto = (message: string) => (isProduction ? problems : warnings).push(message);

  let email: RecordatoriosConfig['email'];
  const { RESEND_API_KEY: apiKey, RECORDATORIO_EMAIL_DESDE: from } = values;
  if (apiKey !== undefined && from !== undefined) {
    email = { apiKey, from };
  } else if (apiKey !== undefined || from !== undefined) {
    incompleto(
      'RESEND_API_KEY y RECORDATORIO_EMAIL_DESDE: van juntas (falta una). Los recordatorios por email quedan ' +
        'desactivados hasta completarlas (ver README, "Recordatorios").',
    );
  }

  let whatsapp: RecordatoriosConfig['whatsapp'];
  const template = values.WHATSAPP_CLOUD_TEMPLATE_RECORDATORIO;
  if (template !== undefined) {
    const { WHATSAPP_CLOUD_TOKEN: token, WHATSAPP_CLOUD_PHONE_NUMBER_ID: phoneNumberId } = values;
    if (token !== undefined && phoneNumberId !== undefined) {
      whatsapp = { token, phoneNumberId, template, language: values.WHATSAPP_CLOUD_LANGUAGE ?? 'es_AR' };
    } else {
      incompleto(
        'WHATSAPP_CLOUD_TEMPLATE_RECORDATORIO necesita WHATSAPP_CLOUD_TOKEN y WHATSAPP_CLOUD_PHONE_NUMBER_ID: los ' +
          'recordatorios por WhatsApp quedan desactivados hasta completarlas (ver README, "Recordatorios").',
      );
    }
  }

  const cronSecret = values.CRON_SECRET;
  const hayCanal = email !== undefined || whatsapp !== undefined;
  if (cronSecret !== undefined && !hayCanal) {
    warnings.push(
      'CRON_SECRET está configurada pero no hay ningún canal de recordatorios (email con Resend o WhatsApp Cloud): ' +
        'el cron puede llamar al endpoint, pero no se manda nada.',
    );
  } else if (cronSecret === undefined && hayCanal) {
    warnings.push(
      'Hay un canal de recordatorios configurado pero falta CRON_SECRET: POST /api/internal/recordatorios responde ' +
        '404 y nadie puede dispararlos (ver README, "Recordatorios").',
    );
  }
  return { cronSecret, email, whatsapp };
}

/** Carga el .env y valida process.env. Es lo que usa el servidor al arrancar. */
export function loadConfig(): AppConfig {
  loadDotEnv();
  return parseConfig(process.env);
}
