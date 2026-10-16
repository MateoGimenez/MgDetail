/**
 * Crea (o actualiza la contraseña de) el administrador del panel.
 *   npm run crear-admin -- --email dueno@ejemplo.com      (con ADMIN_PASSWORD definida)
 * La lógica está en crear-admin-cli.ts para poder testearla; este archivo solo la ejecuta.
 */
import { loadDotEnv } from '../config.js';
import { runCrearAdmin } from './crear-admin-cli.js';

loadDotEnv();
process.exitCode = await runCrearAdmin(process.argv.slice(2), process.env, {
  out: (text) => {
    process.stdout.write(`${text}\n`);
  },
  err: (text) => {
    process.stderr.write(`${text}\n`);
  },
});
