import express, { Router } from 'express';
import type { AppConfig } from '../config.js';
import type { BookingRepository } from '../domain/booking.js';
import type { SessionCookies } from '../lib/cookies.js';
import type { Logger } from '../lib/logger.js';
import { notFoundHandler } from '../middleware/error-handler.js';
import type { RateLimiters } from '../middleware/rate-limit.js';
import { requestGuard } from '../middleware/request-guard.js';
import { requireSession } from '../middleware/require-session.js';
import { corsPolicy, noStore } from '../middleware/security.js';
import type { AgendaService } from '../services/agenda.js';
import type { AuthService } from '../services/auth.js';
import type { BookingService } from '../services/bookings.js';
import type { DisponibilidadService } from '../services/disponibilidad.js';
import type { RecordatorioService } from '../services/recordatorios.js';
import type { ServicioService } from '../services/servicios.js';
import type { UsuarioService } from '../services/usuarios.js';
import { adminAgendaRouter } from './admin-agenda.js';
import { adminBookingsRouter } from './admin-bookings.js';
import { adminDisponibilidadRouter } from './admin-disponibilidad.js';
import { adminServiciosRouter } from './admin-servicios.js';
import { adminUsuariosRouter } from './admin-usuarios.js';
import { authRouter } from './auth.js';
import { publicBookingsRouter } from './bookings.js';
import { publicDisponibilidadRouter } from './disponibilidad.js';
import { healthRouter } from './health.js';
import { internalRouter } from './internal.js';
import { publicServiciosRouter } from './servicios.js';
import { publicTurnosRouter } from './turnos.js';

export interface ApiDeps {
  config: AppConfig;
  logger: Logger;
  now: () => Date;
  /** Resuelve si la base responde; se rechaza si no (ver db/postgres.ts). */
  checkDatabase: () => Promise<void>;
  bookings: BookingRepository;
  bookingService: BookingService;
  agenda: AgendaService;
  disponibilidad: DisponibilidadService;
  recordatorios: RecordatorioService;
  auth: AuthService;
  usuarios: UsuarioService;
  servicios: ServicioService;
  cookies: SessionCookies;
  limiters: RateLimiters;
}

/** Router de /api. El ORDEN de los middlewares importa: cada uno protege a los que vienen después. */
export function createApiRouter(deps: ApiDeps): Router {
  const {
    config,
    logger,
    now,
    checkDatabase,
    bookings,
    bookingService,
    agenda,
    disponibilidad,
    recordatorios,
    auth,
    usuarios,
    servicios,
    cookies,
    limiters,
  } = deps;
  const api = Router();

  api.use(corsPolicy(config.frontendOrigins)); // también responde los preflight (OPTIONS)
  api.use(noStore);
  api.use(limiters.api); // tope general por IP, antes de parsear nada
  api.use(requestGuard(config.frontendOrigins)); // CSRF: Origin + Content-Type, antes de leer el body
  // 10 kb alcanzan de sobra. inflate:false rechaza bodies comprimidos (evita "zip bombs").
  api.use(express.json({ limit: '10kb', inflate: false, strict: true }));

  const withSession = requireSession(auth, cookies);

  api.use('/health', healthRouter(checkDatabase));
  api.use('/servicios', publicServiciosRouter({ servicios }));
  api.use('/disponibilidad', publicDisponibilidadRouter({ disponibilidad, now }));
  api.use('/bookings', publicBookingsRouter({ bookings: bookingService, logger, now, limiter: limiters.bookings }));
  api.use('/turnos', publicTurnosRouter({ bookings, limiter: limiters.seguimiento }));
  api.use('/internal', internalRouter({ cronSecret: config.recordatorios.cronSecret, recordatorios }));
  api.use('/auth', authRouter({ auth, cookies, loginLimiter: limiters.loginFailures, requireSession: withSession }));
  // Todo lo que cuelga de /admin exige sesión, existan o no las rutas (así no se revela cuáles existen).
  api.use('/admin', withSession);
  api.use('/admin/bookings', adminBookingsRouter({ bookings, agenda, now }));
  api.use('/admin/agenda', adminAgendaRouter({ agenda, disponibilidad }));
  api.use('/admin/disponibilidad', adminDisponibilidadRouter({ disponibilidad }));
  api.use('/admin/usuarios', adminUsuariosRouter({ usuarios }));
  api.use('/admin/servicios', adminServiciosRouter({ servicios }));

  api.use(notFoundHandler); // 404 JSON para rutas /api desconocidas
  return api;
}
