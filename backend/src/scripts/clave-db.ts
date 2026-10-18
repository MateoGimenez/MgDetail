/**
 * Genera la contraseña del rol mgdetailing_app y el ALTER ROLE (con hash SCRAM) para pegar en Supabase.
 *   npm run clave-db
 * La lógica está en clave-db-cli.ts para poder testearla; este archivo solo la ejecuta.
 */
import { runClaveDb } from './clave-db-cli.js';

process.exitCode = runClaveDb((text) => {
  process.stdout.write(`${text}\n`);
});
