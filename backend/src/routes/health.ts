import { Router } from 'express';
import { AppError } from '../lib/errors.js';

/**
 * GET /api/health => 200 { status: "ok" } | 503 SERVICE_UNAVAILABLE si la base no responde.
 * Cada 503 queda registrado por el logger de requests; no se escribe stack trace por sondeo.
 */
export function healthRouter(checkDatabase: () => Promise<void>): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      await checkDatabase();
    } catch {
      throw AppError.serviceUnavailable();
    }
    res.json({ status: 'ok' });
  });

  return router;
}
