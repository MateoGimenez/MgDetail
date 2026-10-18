import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

/** Rol dedicado del backend (migración rol_app_minimo_privilegio). */
export const APP_DB_ROLE = 'mgdetailing_app';
/** Iteraciones por defecto de Postgres para SCRAM-SHA-256. */
const SCRAM_ITERATIONS = 4096;

/**
 * Verificador SCRAM-SHA-256 en el formato que guarda Postgres (RFC 5802 / RFC 7677):
 *   SCRAM-SHA-256$<iteraciones>:<salt>$<StoredKey>:<ServerKey>
 * Si `ALTER ROLE ... PASSWORD` recibe esto, Postgres lo guarda tal cual: la contraseña en texto plano nunca
 * llega al servidor, ni a sus logs (Supabase registra el DDL: log_statement=ddl) ni al historial del SQL Editor.
 * La contraseña tiene que ser ASCII (las que genera este script lo son), así no hace falta SASLprep.
 */
export function scramSha256Verifier(password: string, salt: Buffer = randomBytes(16), iterations = SCRAM_ITERATIONS): string {
  if (!/^[\x21-\x7e]+$/.test(password)) {
    throw new Error('La contraseña tiene que ser ASCII imprimible, sin espacios.');
  }
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${String(iterations)}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

/**
 * Genera una contraseña nueva para el rol del backend y la sentencia SQL que la activa (con el verificador, no la
 * contraseña). La contraseña es base64url: segura dentro de una URL de conexión sin codificar nada.
 */
export function runClaveDb(out: (text: string) => void): number {
  const password = randomBytes(24).toString('base64url');
  const sql = `alter role ${APP_DB_ROLE} with login password '${scramSha256Verifier(password)}';`;
  out(
    [
      'Contraseña nueva del rol de la base (guardala en tu gestor de contraseñas y en DATABASE_URL de backend/.env):',
      '',
      `  ${password}`,
      '',
      'Pegá esto en el SQL Editor de Supabase y ejecutalo (lleva el hash, no la contraseña):',
      '',
      `  ${sql}`,
      '',
      `Usuario para DATABASE_URL: ${APP_DB_ROLE}.<id-del-proyecto> (ver README, "Conectar Supabase").`,
    ].join('\n'),
  );
  return 0;
}
