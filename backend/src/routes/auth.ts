import { type RequestHandler, type Response, Router } from 'express';
import { type SessionCookies, readAccessToken, readRefreshToken } from '../lib/cookies.js';
import { AppError } from '../lib/errors.js';
import { getUsuario } from '../middleware/require-session.js';
import { loginSchema } from '../schemas/auth.js';
import { parseOrThrow } from '../schemas/common.js';
import type { AuthService, UsuarioSesion } from '../services/auth.js';

export interface AuthRouterDeps {
  auth: AuthService;
  cookies: SessionCookies;
  /** Limita los intentos de login FALLIDOS por IP. */
  loginLimiter: RequestHandler;
  requireSession: RequestHandler;
}

/** Lo que el frontend ve del usuario: nunca tokens ni el session_id. */
function publicUsuario(usuario: UsuarioSesion) {
  return { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol };
}

function sendUsuario(res: Response, usuario: UsuarioSesion): void {
  res.json({ usuario: publicUsuario(usuario) });
}

export function authRouter({ auth, cookies, loginLimiter, requireSession }: AuthRouterDeps): Router {
  const router = Router();

  // POST /api/auth/login { email, password } => 200 { usuario } + cookies mg_at y mg_rt
  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = parseOrThrow(loginSchema, req.body ?? {});
    try {
      const { usuario, tokens } = await auth.login(email, password);
      cookies.set(res, tokens);
      sendUsuario(res, usuario);
    } catch (error) {
      // Si había una sesión vieja en el navegador, que no quede mezclada con un login fallido.
      if (readAccessToken(req) !== undefined || readRefreshToken(req) !== undefined) cookies.clear(res);
      throw error;
    }
  });

  // POST /api/auth/refresh => 200 { usuario } + cookies nuevas | 401 UNAUTHORIZED | 403 NO_ACCESS
  // El frontend lo llama cuando /api/admin/* responde 401 SESSION_EXPIRED, y después reintenta el pedido.
  router.post('/refresh', async (req, res) => {
    const accessToken = readAccessToken(req);
    const refreshToken = readRefreshToken(req);
    const result = await auth.refreshFromCookies({
      ...(accessToken !== undefined && { accessToken }),
      ...(refreshToken !== undefined && { refreshToken }),
    });
    if (result.status === 'ok') {
      if (result.renewed) cookies.set(res, result.renewed);
      sendUsuario(res, result.usuario);
      return;
    }
    if (result.status !== 'none') cookies.clear(res);
    throw result.status === 'forbidden' ? AppError.noAccess() : AppError.unauthorized();
  });

  // POST /api/auth/logout => 204. Cierra la sesión en Supabase y borra las cookies. Siempre responde 204.
  router.post('/logout', async (req, res) => {
    const accessToken = readAccessToken(req);
    const refreshToken = readRefreshToken(req);
    if (accessToken !== undefined || refreshToken !== undefined) {
      await auth.logout({
        ...(accessToken !== undefined && { accessToken }),
        ...(refreshToken !== undefined && { refreshToken }),
      });
    }
    cookies.clear(res);
    res.status(204).end();
  });

  // GET /api/auth/me => 200 { usuario: { id, email, nombre, rol } } | 401 | 403. Si el access token venció,
  // acá sí viaja el refresh token: se refresca solo.
  router.get('/me', requireSession, (_req, res) => {
    sendUsuario(res, getUsuario(res));
  });

  return router;
}
