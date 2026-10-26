import type { Server } from 'node:http';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { type Database, openConfiguredDatabase } from './db/database.js';
import { createLogger } from './lib/logger.js';

const SHUTDOWN_GRACE_MS = 10_000;

async function main(): Promise<void> {
  const logger = createLogger();

  // 1) Configuración: si algo obligatorio falta o es inválido, se corta acá con un mensaje claro.
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      logger.error(error.message);
    } else {
      logger.error('No se pudo cargar la configuración', error);
    }
    process.exit(1);
  }
  for (const warning of config.warnings) {
    logger.warn(warning);
  }
  logger.info(
    config.whatsapp.provider === 'none'
      ? 'Avisos de turnos desactivados (WHATSAPP_PROVIDER=none)'
      : `Avisos de turnos activados (${config.whatsapp.provider})`,
  );

  const canalesRecordatorio = [
    ...(config.recordatorios.email ? ['email'] : []),
    ...(config.recordatorios.whatsapp ? ['whatsapp'] : []),
  ];
  logger.info(
    canalesRecordatorio.length === 0
      ? 'Recordatorios desactivados (sin canal configurado)'
      : `Recordatorios activados (${canalesRecordatorio.join(', ')})${config.recordatorios.cronSecret === undefined ? ', pero sin CRON_SECRET' : ''}`,
  );

  logger.info(
    config.push === undefined
      ? 'Avisos push desactivados (sin claves VAPID)'
      : 'Avisos push activados (el panel ofrece el interruptor de avisos)',
  );

  logger.info(`Login del panel: Supabase Auth (${config.supabase.url})`);

  // 2) Base de datos: Postgres en Supabase (conecta y verifica que las migraciones estén aplicadas).
  let database: Database;
  try {
    database = await openConfiguredDatabase(config.database, logger);
    logger.info(`Base de datos lista: ${database.description}`);
  } catch (error) {
    logger.error('No se pudo conectar o verificar la base de datos', error);
    process.exit(1);
  }

  // 3) Servidor HTTP.
  const app = createApp({
    config,
    repositories: database.repositories,
    checkDatabase: database.checkDatabase,
    logger,
  });
  const server: Server = app.listen(config.port, config.host);
  // Timeouts contra conexiones lentas que tienen el socket ocupado (slowloris).
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;

  server.once('listening', () => {
    logger.info(`API escuchando en http://${config.host}:${String(config.port)} (${config.nodeEnv})`);
  });
  server.once('error', (error) => {
    logger.error(`No se pudo escuchar en ${config.host}:${String(config.port)}`, error);
    void closeDatabase().finally(() => process.exit(1));
  });

  // 4) Apagado prolijo: dejar de aceptar conexiones, esperar las en curso y recién ahí cerrar la base.
  let closing: Promise<void> | undefined;
  function closeDatabase(): Promise<void> {
    closing ??= database.close().catch((error: unknown) => {
      logger.error('Error al cerrar la base de datos', error);
    });
    return closing;
  }

  let shuttingDown = false;
  function shutdown(reason: string): void {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${reason}: cerrando el servidor...`);

    const forceTimer = setTimeout(() => {
      logger.error('Cierre forzado: había conexiones abiertas que no terminaron a tiempo');
      server.closeAllConnections();
      void closeDatabase();
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forceTimer.unref();

    server.close((error) => {
      clearTimeout(forceTimer);
      if (error) logger.error('Error al cerrar el servidor', error);
      void closeDatabase().then(() => {
        logger.info('Servidor y base de datos cerrados');
        process.exitCode = error ? 1 : 0;
      });
    });
    server.closeIdleConnections();
  }

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });

  // Errores no previstos: se registran y se corta (un proceso en estado desconocido no debe seguir sirviendo).
  process.on('uncaughtException', (error) => {
    logger.error('Excepción no capturada', error);
    void closeDatabase();
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Promesa rechazada sin manejar', reason);
    void closeDatabase();
    process.exit(1);
  });
}

await main();
