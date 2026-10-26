/**
 * Genera un par de claves VAPID para los avisos push y lo imprime para pegar en backend/.env.
 *   npm run vapid
 * La lógica está en vapid-cli.ts para poder testearla; este archivo solo la ejecuta.
 */
import { runVapid } from './vapid-cli.js';

process.exitCode = runVapid((text) => {
  process.stdout.write(`${text}\n`);
});
