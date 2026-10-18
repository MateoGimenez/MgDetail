import express, { type Express } from 'express';
import type { AppConfig } from './config.js';
import { SessionCookies } from './lib/cookies.js';
import { type Logger, createLogger } from './lib/logger.js';
import { SessionTokens } from './lib/session-token.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { mountFrontend } from './middleware/frontend.js';
import { createRateLimiters } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { securityHeaders } from './middleware/security.js';
import type { BookingNotifier } from './domain/notifier.js';
import { type FetchFn, createNotifier } from './notifications/index.js';
import type { Repositories } from './repositories/index.js';
import { createApiRouter } from './routes/index.js';
import { AuthService } from './services/auth.js';
import { BookingService } from './services/bookings.js';

export interface AppDeps {
  config: AppConfig;
  /** Repositorios sobre una base ya abierta y migrada, SQLite o Postgres (ver db/database.ts). */
  repositories: Repositories;
  /** Resuelve si la base responde; se rechaza si no (para /api/health). */
  checkDatabase: () => Promise<void>;
  logger?: Logger;
  /** Reloj inyectable (los tests lo fijan). */
  now?: () => Date;
  /** fetch inyectable para los avisos (los tests nunca tocan la red). */
  fetch?: FetchFn;
  /** Pisa al notificador elegido por la config (tests). */
  notifier?: BookingNotifier;
}

/**
 * Arma la aplicación Express SIN ponerla a escuchar (index.ts hace el listen; los tests usan supertest).
 * No conoce el motor de base de datos: recibe los repositorios (SQLite o Postgres, ver db/database.ts) y rutas y
 * servicios trabajan contra las interfaces de domain/. No abre ni cierra la base: quien la crea la administra.
 */
export function createApp(deps: AppDeps): Express {
  const { config, checkDatabase } = deps;
  const logger = deps.logger ?? createLogger();
  const now = deps.now ?? (() => new Date());

  const { bookings, admins, sessions } = deps.repositories;
  const bookingService = new BookingService({
    bookings,
    logger,
    notifier: deps.notifier ?? createNotifier(config.whatsapp, config.publicUrl, deps.fetch),
  });
  const auth = new AuthService({
    admins,
    sessions,
    tokens: new SessionTokens(config.jwtSecret, config.sessionTtlSeconds, now),
    passwordParams: config.passwordHashing,
    now,
  });
  const cookies = new SessionCookies(config);
  const limiters = createRateLimiters(config.rateLimits);

  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false); // la API no usa validadores de caché; Cache-Control: no-store
  app.set('query parser', 'simple'); // sin objetos anidados en la query (menos superficie)
  app.set('trust proxy', config.trustProxy);

  app.use(requestLogger(logger));
  app.use(securityHeaders(config));
  app.use(
    '/api',
    createApiRouter({
      config,
      logger,
      now,
      checkDatabase,
      bookings,
      bookingService,
      auth,
      cookies,
      limiters,
    }),
  );

  if (config.serveFrontend) {
    mountFrontend(app, config.frontendDistPath);
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
