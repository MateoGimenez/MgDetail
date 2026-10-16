import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Hash de contraseñas con scrypt nativo (sin dependencias).
 *
 * Formato almacenado (estilo PHC):  $scrypt$ln=15,r=8,p=3$<salt base64>$<hash base64>
 * Los parámetros viajan dentro del hash, así que se pueden endurecer más adelante sin romper
 * las contraseñas ya guardadas.
 */

export interface ScryptParams {
  /** log2 del costo de CPU/memoria (N = 2^logN). */
  logN: number;
  /** Tamaño de bloque. */
  r: number;
  /** Paralelización. */
  p: number;
}

/**
 * OWASP (Password Storage Cheat Sheet): N=2^15, r=8, p=3 equivale a N=2^17, r=8, p=1, pero usa 32 MiB
 * en vez de 128 MiB por hash. Con la threadpool de libuv (4 hilos) acota el pico de memoria ante
 * una ráfaga de logins en un servidor chico.
 */
export const DEFAULT_SCRYPT_PARAMS: Readonly<ScryptParams> = { logN: 15, r: 8, p: 3 };

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// Límites al leer un hash almacenado: evitan que un valor corrupto provoque un consumo absurdo de memoria.
const LIMITS = { logN: [4, 20], r: [1, 32], p: [1, 16], salt: [8, 64], key: [16, 128] } as const;

function deriveKey(password: string, salt: Buffer, keyLength: number, params: ScryptParams): Promise<Buffer> {
  const N = 2 ** params.logN;
  const options: ScryptOptions = {
    N,
    r: params.r,
    p: params.p,
    // Node rechaza por defecto lo que supera 32 MiB; N=2^15,r=8 necesita un poco más. 256*N*r es holgado.
    maxmem: Math.max(32 * 1024 * 1024, 256 * N * params.r),
  };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

const b64 = (buffer: Buffer): string => buffer.toString('base64').replace(/=+$/, '');

export async function hashPassword(
  password: string,
  params: Readonly<ScryptParams> = DEFAULT_SCRYPT_PARAMS,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH); // salt aleatorio por contraseña
  const key = await deriveKey(password, salt, KEY_LENGTH, params);
  return `$scrypt$ln=${params.logN},r=${params.r},p=${params.p}$${b64(salt)}$${b64(key)}`;
}

interface ParsedHash {
  params: ScryptParams;
  salt: Buffer;
  key: Buffer;
}

const inRange = (value: number, [min, max]: readonly [number, number]): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

function parseHash(encoded: string): ParsedHash | undefined {
  const parts = encoded.split('$');
  if (parts.length !== 5 || parts[0] !== '' || parts[1] !== 'scrypt') return undefined;
  const [, , paramText, saltText, keyText] = parts;
  const match = /^ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})$/.exec(paramText ?? '');
  if (!match || saltText === undefined || keyText === undefined) return undefined;

  const params: ScryptParams = { logN: Number(match[1]), r: Number(match[2]), p: Number(match[3]) };
  const salt = Buffer.from(saltText, 'base64');
  const key = Buffer.from(keyText, 'base64');
  if (
    !inRange(params.logN, LIMITS.logN) ||
    !inRange(params.r, LIMITS.r) ||
    !inRange(params.p, LIMITS.p) ||
    !inRange(salt.length, LIMITS.salt) ||
    !inRange(key.length, LIMITS.key)
  ) {
    return undefined;
  }
  return { params, salt, key };
}

/**
 * Compara en tiempo constante. Un hash ilegible devuelve false (nunca lanza), para que un registro
 * corrupto se comporte como "contraseña incorrecta".
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parsed = parseHash(encoded);
  if (!parsed) return false;
  const candidate = await deriveKey(password, parsed.salt, parsed.key.length, parsed.params);
  return candidate.length === parsed.key.length && timingSafeEqual(candidate, parsed.key);
}
