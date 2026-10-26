import express, { type Express } from 'express';
import type { JWTVerifyGetKey } from 'jose';
import type { AppConfig } from './config.js';
import type { BookingNotifier } from './domain/notifier.js';
import type { PushSender } from './domain/push.js';
import { createAccessTokenVerifier, createSupabaseJwks } from './lib/access-token.js';
import { SessionCookies } from './lib/cookies.js';
import { type Logger, createLogger } from './lib/logger.js';
import { SupabaseAdminClient } from './lib/supabase-admin.js';
import { type FetchFn, SupabaseAuthClient } from './lib/supabase-auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { mountFrontend } from './middleware/frontend.js';
import { createRateLimiters } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { securityHeaders } from './middleware/security.js';
import { NOTIFY_TIMEOUT_MS, createNotifier } from './notifications/index.js';
import { createWebPushSender } from './notifications/push.js';
import { createCanalesRecordatorio } from './notifications/recordatorio.js';
import type { Repositories } from './repositories/index.js';
import { createApiRouter } from './routes/index.js';
import { AgendaService } from './services/agenda.js';
import { AuthService } from './services/auth.js';
import { BookingService } from './services/bookings.js';
import { DisponibilidadService } from './services/disponibilidad.js';
import { PUSH_TIMEOUT_MS, PushService } from './services/push.js';
import { RecordatorioService } from './services/recordatorios.js';
import { ServicioService } from './services/servicios.js';
import { UsuarioService } from './services/usuarios.js';

export interface AppDeps {
  config: AppConfig;
  /** Repositorios sobre una base Postgres ya migrada (ver db/database.ts). */
  repositories: Repositories;
  /** Resuelve si la base responde; se rechaza si no (para /api/health). */
  checkDatabase: () => Promise<void>;
  logger?: Logger;
  /** Reloj inyectable (los tests lo fijan). */
  now?: () => Date;
  /** fetch inyectable para los avisos y los recordatorios (los tests nunca tocan la red). */
  fetch?: FetchFn;
  /** fetch inyectable para Supabase Auth (los tests usan un Supabase Auth falso). */
  authFetch?: FetchFn;
  /** Claves para verificar los access tokens. Por defecto, el JWKS remoto del proyecto (con caché). */
  jwks?: JWTVerifyGetKey;
  /** Pisa al notificador elegido por la config (tests). */
  notifier?: BookingNotifier;
  /** Pisa al cliente de envío push (web-push) para que los tests no toquen la red. */
  pushSender?: PushSender;
}

/**
 * Arma la aplicación Express SIN ponerla a escuchar (index.ts hace el listen; los tests usan supertest).
 * No abre ni cierra la base: quien la crea la administra.
 */
export function createApp(deps: AppDeps): Express {
  const { config, checkDatabase } = deps;
  const logger = deps.logger ?? createLogger();
  const now = deps.now ?? (() => new Date());

  const { bookings, perfiles, servicios, disponibilidad, push: pushRepo } = deps.repositories;
  const push = new PushService({
    repo: pushRepo,
    config: config.push,
    sender: deps.pushSender ?? (config.push === undefined ? undefined : createWebPushSender(config.push, PUSH_TIMEOUT_MS)),
    logger,
    now,
  });
  const bookingService = new BookingService({
    bookings,
    servicios,
    disponibilidad,
    logger,
    notifier: deps.notifier ?? createNotifier(config.whatsapp, config.publicUrl, deps.fetch),
    push,
  });
  const auth = new AuthService({
    supabase: new SupabaseAuthClient(config.supabase, deps.authFetch),
    verifyAccessToken: createAccessTokenVerifier({
      getKey: deps.jwks ?? createSupabaseJwks(config.supabase.jwksUrl),
      issuer: config.supabase.authUrl,
      now,
    }),
    perfiles,
    logger,
  });
  const { secretKey } = config.supabase;
  const usuarios = new UsuarioService({
    perfiles,
    admin:
      secretKey === undefined
        ? undefined
        : new SupabaseAdminClient({ authUrl: config.supabase.authUrl, secretKey }, deps.authFetch),
    logger,
    now,
  });
  const agenda = new AgendaService({ bookings, logger, now });
  const servicioService = new ServicioService({ servicios, logger, now });
  const disponibilidadService = new DisponibilidadService({ disponibilidad, logger, now });
  const recordatorios = new RecordatorioService({
    bookings,
    canales: createCanalesRecordatorio(config.recordatorios, {
      fetch: deps.fetch ?? fetch,
      publicUrl: config.publicUrl,
      timeoutMs: NOTIFY_TIMEOUT_MS,
    }),
    logger,
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
      agenda,
      disponibilidad: disponibilidadService,
      recordatorios,
      push,
      auth,
      usuarios,
      servicios: servicioService,
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
