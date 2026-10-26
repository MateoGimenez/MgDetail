import { Router } from 'express';
import { AppError } from '../lib/errors.js';
import { getUsuario } from '../middleware/require-session.js';
import { parseOrThrow } from '../schemas/common.js';
import { bajaSchema, suscripcionSchema } from '../schemas/push.js';
import type { PushService } from '../services/push.js';

const NO_DISPONIBLE_MESSAGE = 'Los avisos al celular no están disponibles en este momento.';

/**
 * Avisos push en el panel. Detrás de requireSession; los tres roles (cada persona decide en su dispositivo).
 * Los pedidos tienen el rate limit general y la defensa CSRF de toda la API.
 */
export function adminPushRouter(deps: { push: PushService }): Router {
  const { push } = deps;
  const router = Router();

  // GET /api/admin/push/estado => { disponible, clavePublica }
  router.get('/estado', (_req, res) => {
    res.json(push.estado());
  });

  // POST /api/admin/push/suscripciones { endpoint, keys: { p256dh, auth }, agente? } => 201 { ok: true }
  router.post('/suscripciones', async (req, res) => {
    if (!push.disponible) throw AppError.notFound(NO_DISPONIBLE_MESSAGE); // sin claves VAPID: apagado
    const { endpoint, keys, agente } = parseOrThrow(suscripcionSchema, req.body ?? {});
    await push.suscribir(getUsuario(res).id, { endpoint, p256dh: keys.p256dh, auth: keys.auth, agente: agente ?? null });
    res.status(201).json({ ok: true });
  });

  // DELETE /api/admin/push/suscripciones { endpoint } => 204 (también si no existía)
  router.delete('/suscripciones', async (req, res) => {
    const { endpoint } = parseOrThrow(bajaSchema, req.body ?? {});
    await push.desuscribir(endpoint, getUsuario(res).id);
    res.status(204).end();
  });

  return router;
}
