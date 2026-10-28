import { type RequestHandler, Router } from 'express';
import { todayInLaRioja } from '../lib/dates.js';
import type { ServicioService } from '../services/servicios.js';

/** Escapa lo que XML no admite en un texto (las URLs salen de PUBLIC_URL y de ids validados, pero se escapa igual). */
export function escaparXml(texto: string): string {
  return texto.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });
}

interface EntradaSitemap {
  loc: string;
  lastmod: string | null;
}

function entradaXml({ loc, lastmod }: EntradaSitemap): string {
  const fecha = lastmod === null ? '' : `<lastmod>${lastmod}</lastmod>`;
  return `  <url><loc>${escaparXml(loc)}</loc>${fecha}</url>`;
}

/**
 * GET /sitemap.xml (contrato: reportes/2026-10-27_16_landing-whatsapp-mapa-servicios.md, sección 4). Se arma en cada
 * pedido con el catálogo: la home y una URL por servicio ACTIVO (`/servicios/<id>`), cada una con `<lastmod>` (la fecha,
 * en hora de La Rioja, en que se editó el servicio; la home, la del cambio más reciente del catálogo). Solo existe
 * con PUBLIC_URL configurada: sin ella no se monta y responde 404 como cualquier ruta desconocida. No lleva el panel
 * (/admin) ni el seguimiento de los turnos (/turno/<id>).
 */
export function sitemapRouter(deps: {
  publicUrl: string;
  servicios: ServicioService;
  limiter: RequestHandler;
}): Router {
  const { publicUrl, servicios, limiter } = deps;
  const router = Router();

  router.get('/sitemap.xml', limiter, async (_req, res) => {
    const activos = await servicios.listActivos();
    const fechas = activos.map((servicio) => todayInLaRioja(new Date(servicio.updatedAt)));
    const masReciente = fechas.length === 0 ? null : fechas.reduce((a, b) => (a > b ? a : b));
    const entradas: EntradaSitemap[] = [
      { loc: `${publicUrl}/`, lastmod: masReciente },
      ...activos.map((servicio, i) => ({
        loc: `${publicUrl}/servicios/${encodeURIComponent(servicio.id)}`,
        lastmod: fechas[i] ?? null,
      })),
    ];
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      `${entradas.map(entradaXml).join('\n')}\n` +
      '</urlset>\n';
    res.type('application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  });

  return router;
}
