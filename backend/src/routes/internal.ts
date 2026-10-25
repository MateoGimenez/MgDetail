import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { AppError } from '../lib/errors.js';
import type { RecordatorioService } from '../services/recordatorios.js';

/** sha256 de un texto: las dos partes de timingSafeEqual quedan del mismo largo (32 bytes) sin revelar el largo real. */
const digest = (text: string): Buffer => createHash('sha256').update(text, 'utf8').digest();

/**
 * true si la cabecera es exactamente `Bearer <secreto>`. La comparación es en tiempo constante (sobre los sha256,
 * para que tampoco dependa del largo de lo que mandaron).
 */
export function bearerValido(header: string | undefined, secret: string): boolean {
  const match = /^Bearer ([\x21-\x7E]{1,500})$/.exec(header ?? '');
  const token = match?.[1] ?? '';
  // Se compara siempre (aunque la cabecera no tenga el formato), así el tiempo no dice si el formato era válido.
  const iguales = timingSafeEqual(digest(token), digest(secret));
  return match !== null && iguales;
}

/**
 * Endpoints internos (los llama un cron, no el navegador). POST /api/internal/recordatorios con
 * `Authorization: Bearer <CRON_SECRET>` => { enviados, fallidos, sinCanal }. Sin CRON_SECRET configurada, responde
 * 404 (igual que una ruta inexistente); con la variable y otro secreto (o sin cabecera), 401.
 */
export function internalRouter(deps: { cronSecret: string | undefined; recordatorios: RecordatorioService }): Router {
  const { cronSecret, recordatorios } = deps;
  const router = Router();

  router.post('/recordatorios', async (req, res) => {
    if (cronSecret === undefined) throw AppError.notFound();
    if (!bearerValido(req.headers.authorization, cronSecret)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      throw new AppError(401, 'UNAUTHORIZED', 'No autorizado.');
    }
    const { enviados, fallidos, sinCanal } = await recordatorios.enviarPendientes();
    res.json({ enviados, fallidos, sinCanal });
  });

  return router;
}
