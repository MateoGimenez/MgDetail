import { type RequestHandler, Router } from 'express';
import type { SessionCookies } from '../lib/cookies.js';
import { AppError } from '../lib/errors.js';
import { getAdmin, readSessionToken } from '../middleware/require-admin.js';
import { loginSchema } from '../schemas/auth.js';
import { parseOrThrow } from '../schemas/common.js';
import type { AuthService } from '../services/auth.js';

export interface AuthRouterDeps {
  auth: AuthService;
  cookies: SessionCookies;
  /** Limita los intentos de login FALLIDOS por IP. */
  loginLimiter: RequestHandler;
  requireAdmin: RequestHandler;
}

export function authRouter({ auth, cookies, loginLimiter, requireAdmin }: AuthRouterDeps): Router {
  const router = Router();

  // POST /api/auth/login { email, password } => 200 { admin: { email } } + cookie mg_session
  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = parseOrThrow(loginSchema, req.body ?? {});
    const result = await auth.login(email, password);
    if (!result) {
      throw AppError.invalidCredentials(); // mensaje genérico: no revela si el email existe
    }
    cookies.set(res, result.token);
    res.json({ admin: result.admin });
  });

  // POST /api/auth/logout => 204. Revoca la sesión en el servidor y borra la cookie. Siempre responde 204.
  router.post('/logout', async (req, res) => {
    const token = readSessionToken(req);
    if (token !== undefined) {
      await auth.logout(token);
    }
    cookies.clear(res);
    res.status(204).end();
  });

  // GET /api/auth/me => 200 { admin: { email } } | 401
  router.get('/me', requireAdmin, (_req, res) => {
    res.json({ admin: { email: getAdmin(res).email } });
  });

  return router;
}
