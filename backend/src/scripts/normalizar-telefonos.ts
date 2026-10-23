/**
 * Completa el teléfono normalizado (telefono_whatsapp) de los turnos que ya existían antes de la migración
 * notas_telefono_cliente. Usa la DATABASE_URL de backend/.env (el rol mgdetailing_app alcanza).
 *   npm run normalizar-telefonos       (después de npm run build)
 *   npm run normalizar-telefonos:dev   (sin compilar)
 * Se puede correr las veces que haga falta. La lógica está en normalizar-telefonos-cli.ts para poder testearla.
 */
import { BACKEND_ROOT, databaseConfigFromEnv, loadDotEnv } from '../config.js';
import { createPgPool, pgPoolClient } from '../db/postgres.js';
import { createLogger } from '../lib/logger.js';
import { runNormalizarTelefonos } from './normalizar-telefonos-cli.js';

const out = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

loadDotEnv();
const { database, problems } = databaseConfigFromEnv(process.env, process.env.NODE_ENV === 'production');
if (database === undefined || problems.length > 0) {
  out(`Revisá la configuración de la base en ${BACKEND_ROOT}/.env:`);
  for (const problem of problems) out(`  - ${problem}`);
  process.exitCode = 1;
} else {
  const pool = createPgPool(database, createLogger());
  try {
    process.exitCode = await runNormalizarTelefonos(pgPoolClient(pool), out);
  } finally {
    await pool.end();
  }
}
