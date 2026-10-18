import { parseArgs } from 'node:util';
import { type DatabaseConfig, databaseConfigFromEnv } from '../config.js';
import { type Database, openConfiguredDatabase } from '../db/database.js';
import type { Logger } from '../lib/logger.js';
import type { ScryptParams } from '../lib/password.js';
import { emailSchema, newPasswordSchema } from '../schemas/auth.js';
import { saveAdmin } from '../services/admin-accounts.js';

const USAGE = `Uso:
  npm run crear-admin -- --email <email>        (producción: requiere "npm run build" antes)
  npm run crear-admin:dev -- --email <email>    (desarrollo: corre el TypeScript directo con tsx)

La contraseña se lee de la variable de entorno ADMIN_PASSWORD (recomendado).
También se puede pasar con --password <contraseña>, pero queda en el historial de la terminal.
Si el email ya existe, se actualiza su contraseña y se cierran sus sesiones abiertas.
Usa la misma base que el servidor: Postgres si backend/.env tiene DATABASE_URL (o DB_DRIVER=postgres);
si no, el archivo SQLite de DB_PATH.

Opciones:
  --email <email>        Email del administrador (también se acepta la variable ADMIN_EMAIL)
  --password <clave>     Contraseña (mínimo 10 caracteres)
  -h, --help             Muestra esta ayuda

Ejemplos:
  PowerShell:  $env:ADMIN_PASSWORD = "una clave larga y unica"; npm run crear-admin -- --email dueno@ejemplo.com
  Git Bash:    ADMIN_PASSWORD="una clave larga y unica" npm run crear-admin -- --email dueno@ejemplo.com
`;

export interface CliIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

export interface CliOptions {
  /** Parámetros de scrypt (los tests usan unos baratos). */
  passwordParams?: ScryptParams;
  /** Abre la base (los tests inyectan una Postgres en memoria). Por defecto, la que indica el entorno. */
  openDatabase?: (config: DatabaseConfig, logger: Logger) => Promise<Database>;
}

/** Ejecuta el script. Devuelve el código de salida (0 = ok). No imprime nunca la contraseña. */
export async function runCrearAdmin(
  argv: string[],
  env: NodeJS.ProcessEnv,
  io: CliIo,
  options: CliOptions = {},
): Promise<number> {
  let values: { email?: string; password?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        email: { type: 'string' },
        password: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : 'Argumentos inválidos'}\n\n${USAGE}`);
    return 1;
  }

  if (values.help) {
    io.out(USAGE);
    return 0;
  }

  const rawEmail = values.email ?? env.ADMIN_EMAIL;
  if (rawEmail === undefined || rawEmail.trim() === '') {
    io.err(`Falta el email.\n\n${USAGE}`);
    return 1;
  }
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) {
    io.err(`Email inválido: ${email.error.issues[0]?.message ?? 'revisalo'}`);
    return 1;
  }

  if (values.password !== undefined) {
    io.err(
      'Aviso: pasar la contraseña con --password la deja guardada en el historial de la terminal. ' +
        'Es más seguro usar la variable de entorno ADMIN_PASSWORD.',
    );
  }
  const rawPassword = values.password ?? env.ADMIN_PASSWORD;
  if (rawPassword === undefined || rawPassword === '') {
    io.err(`Falta la contraseña: definí la variable ADMIN_PASSWORD (o usá --password).\n\n${USAGE}`);
    return 1;
  }
  const password = newPasswordSchema.safeParse(rawPassword);
  if (!password.success) {
    io.err(password.error.issues[0]?.message ?? 'Contraseña inválida');
    return 1;
  }

  const dbConfig = databaseConfigFromEnv(env, env.NODE_ENV?.trim() === 'production');
  if (dbConfig.database === undefined || dbConfig.problems.length > 0) {
    io.err(`Configuración de la base inválida:\n${dbConfig.problems.map((problem) => `  - ${problem}`).join('\n')}`);
    return 1;
  }
  for (const warning of dbConfig.warnings) {
    io.err(`Aviso: ${warning}`);
  }

  // Solo para errores de conexiones inactivas del pool de Postgres (el script dura segundos).
  const logger: Logger = {
    info: (message) => {
      io.out(message);
    },
    warn: (message) => {
      io.err(`Aviso: ${message}`);
    },
    error: (message) => {
      io.err(message);
    },
  };

  let database: Database;
  try {
    database = await (options.openDatabase ?? openConfiguredDatabase)(dbConfig.database, logger);
  } catch (error) {
    io.err(`No se pudo abrir la base de datos: ${error instanceof Error ? error.message : 'error desconocido'}`);
    return 1;
  }

  try {
    const { admins, sessions } = database.repositories;
    const result = await saveAdmin(
      { admins, sessions },
      { email: email.data, password: password.data },
      options.passwordParams ? { params: options.passwordParams } : {},
    );
    if (result.created) {
      io.out(`Administrador creado: ${email.data}`);
    } else {
      io.out(
        `Contraseña actualizada para ${email.data}. Sesiones abiertas cerradas: ${String(result.revokedSessions)}.`,
      );
    }
    io.out(`Base de datos: ${database.description}`);
    return 0;
  } catch (error) {
    io.err(`No se pudo guardar el administrador: ${error instanceof Error ? error.message : 'error desconocido'}`);
    return 1;
  } finally {
    await database.close();
  }
}
