import express, { Router } from 'express';
import type { AppConfig } from '../config.js';
import type { BookingRepository } from '../domain/booking.js';
import type { SessionCookies } from '../lib/cookies.js';
import type { Logger } from '../lib/logger.js';
import { notFoundHandler } from '../middleware/error-handler.js';
import type { RateLimiters } from '../middleware/rate-limit.js';
import { requestGuard } from '../middleware/request-guard.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { corsPolicy, noStore } from '../middleware/security.js';
import type { AuthService } from '../services/auth.js';
import type { BookingService } from '../services/bookings.js';
import { adminBookingsRouter } from './admin-bookings.js';
import { authRouter } from './auth.js';
import { publicBookingsRouter } from './bookings.js';
import { healthRouter } from './health.js';

export interface ApiDeps {
  config: AppConfig;
  logger: Logger;
  now: () => Date;
  /** Resuelve si la base responde; se rechaza si no (ver db/health.ts). */
  checkDatabase: () => Promise<void>;
  bookings: BookingRepository;
  bookingService: BookingService;
  auth: AuthService;
  cookies: SessionCookies;
  limiters: RateLimiters;
}

/** Router de /api. El ORDEN de los middlewares importa: cada uno protege a los que vienen después. */
export function createApiRouter(deps: ApiDeps): Router {
  const { config, logger, now, checkDatabase, bookings, bookingService, auth, cookies, limiters } = deps;
  const api = Router();

  api.use(corsPolicy(config.frontendOrigins)); // también responde los preflight (OPTIONS)
  api.use(noStore);
  api.use(limiters.api); // tope general por IP, antes de parsear nada
  api.use(requestGuard(config.frontendOrigins)); // CSRF: Origin + Content-Type, antes de leer el body
  // 10 kb alcanzan de sobra. inflate:false rechaza bodies comprimidos (evita "zip bombs").
  api.use(express.json({ limit: '10kb', inflate: false, strict: true }));

  const adminOnly = requireAdmin(auth, cookies);

  api.use('/health', healthRouter(checkDatabase));
  api.use('/bookings', publicBookingsRouter({ bookings: bookingService, logger, now, limiter: limiters.bookings }));
  api.use('/auth', authRouter({ auth, cookies, loginLimiter: limiters.loginFailures, requireAdmin: adminOnly }));
  // Todo lo que cuelga de /admin exige sesión, existan o no las rutas (así no se revela cuáles existen).
  api.use('/admin', adminOnly);
  api.use('/admin/bookings', adminBookingsRouter({ bookings, now }));

  api.use(notFoundHandler); // 404 JSON para rutas /api desconocidas
  return api;
}
