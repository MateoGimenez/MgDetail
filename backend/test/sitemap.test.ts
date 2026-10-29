import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { robotsConSitemap } from '../src/middleware/frontend.js';
import { closeAllContexts, createTestContext } from './helpers.js';

afterEach(closeAllContexts);

const URL_PUBLICA = 'https://mgdetailing.com.ar';
const ROBOTS = 'User-agent: *\nAllow: /\nDisallow: /admin\n';

let dist: string;
beforeAll(() => {
  dist = mkdtempSync(path.join(tmpdir(), 'mg-sitemap-'));
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><body><div id="root">SPA</div></body></html>');
  writeFileSync(path.join(dist, 'robots.txt'), ROBOTS);
});
afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
});

describe('GET /sitemap.xml', () => {
  it('con PUBLIC_URL: la home y una URL por servicio activo, cada una con lastmod, como XML', async () => {
    const { app, db } = await createTestContext({ config: { publicUrl: URL_PUBLICA } });
    await db.sql.query("UPDATE mgdetailing.servicios SET activo = false WHERE id = 'encerado'");
    await db.sql.query("UPDATE mgdetailing.servicios SET updated_at = '2026-10-01T12:00:00Z'");
    await db.sql.query("UPDATE mgdetailing.servicios SET updated_at = '2026-10-20T01:00:00Z' WHERE id = 'pulido'"); // 19/10 22:00 en La Rioja
    const r = await request(app).get('/sitemap.xml');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^application\/xml/);
    expect(r.headers['cache-control']).toBe('public, max-age=3600');
    expect(r.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(r.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locs = [...r.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      `${URL_PUBLICA}/`,
      `${URL_PUBLICA}/servicios/lavado-basico`,
      `${URL_PUBLICA}/servicios/lavado-premium`,
      `${URL_PUBLICA}/servicios/pulido`,
      `${URL_PUBLICA}/servicios/restauracion-opticas`,
      `${URL_PUBLICA}/privacidad`,
    ]);
    expect(r.text).not.toContain('encerado'); // inactivo
    expect(r.text).not.toMatch(/admin|turno\//);
    expect(r.text).toContain(`<url><loc>${URL_PUBLICA}/servicios/pulido</loc><lastmod>2026-10-19</lastmod></url>`);
    expect(r.text).toContain(`<url><loc>${URL_PUBLICA}/servicios/lavado-basico</loc><lastmod>2026-10-01</lastmod></url>`);
    // la home tiene la fecha del cambio más reciente del catálogo
    expect(r.text).toContain(`<url><loc>${URL_PUBLICA}/</loc><lastmod>2026-10-19</lastmod></url>`);
    expect((r.text.match(/<lastmod>/g) ?? []).length).toBe(locs.length - 1); // /privacidad no lleva lastmod
  });

  it('sin servicios activos: solo la home, sin lastmod', async () => {
    const { app, db } = await createTestContext({ config: { publicUrl: URL_PUBLICA } });
    await db.sql.query('UPDATE mgdetailing.servicios SET activo = false, destacado = false');
    const r = await request(app).get('/sitemap.xml');
    expect(r.status).toBe(200);
    expect(r.text).toContain(`<url><loc>${URL_PUBLICA}/</loc></url>`);
    expect(r.text).toContain(`<url><loc>${URL_PUBLICA}/privacidad</loc></url>`);
    expect(r.text).not.toContain('lastmod');
    expect(r.text).not.toContain('/servicios/');
  });

  it('sin PUBLIC_URL: 404 (con y sin el frontend servido)', async () => {
    const solaApi = await createTestContext();
    const a = await request(solaApi.app).get('/sitemap.xml');
    expect(a.status).toBe(404);
    const conSpa = await createTestContext({ config: { serveFrontend: true, frontendDistPath: dist } });
    const b = await request(conSpa.app).get('/sitemap.xml');
    expect(b.status).toBe(404);
    expect(b.text).not.toContain('id="root"');
  });

  it('con el frontend servido y PUBLIC_URL, /sitemap.xml lo responde el backend y no la SPA', async () => {
    const { app } = await createTestContext({ config: { publicUrl: URL_PUBLICA, serveFrontend: true, frontendDistPath: dist } });
    const r = await request(app).get('/sitemap.xml');
    expect(r.status).toBe(200);
    expect(r.text).toContain('<urlset');
    expect(r.text).not.toContain('id="root"');
  });

  it('solo GET/HEAD; el resto de métodos no lo modifican (404)', async () => {
    const { app } = await createTestContext({ config: { publicUrl: URL_PUBLICA } });
    expect((await request(app).post('/sitemap.xml')).status).toBe(404);
    expect((await request(app).delete('/sitemap.xml')).status).toBe(404);
  });
});

describe('robots.txt', () => {
  it('con PUBLIC_URL conserva lo que ya dice y suma la línea Sitemap', async () => {
    const { app } = await createTestContext({ config: { publicUrl: URL_PUBLICA, serveFrontend: true, frontendDistPath: dist } });
    const r = await request(app).get('/robots.txt');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^text\/plain/);
    expect(r.text).toBe(`${ROBOTS}\nSitemap: ${URL_PUBLICA}/sitemap.xml\n`);
    expect(r.text).toContain('Disallow: /admin');
  });

  it('sin PUBLIC_URL sirve el archivo del build tal cual, sin Sitemap', async () => {
    const { app } = await createTestContext({ config: { serveFrontend: true, frontendDistPath: dist } });
    const r = await request(app).get('/robots.txt');
    expect(r.status).toBe(200);
    expect(r.text).toBe(ROBOTS);
    expect(r.text).not.toContain('Sitemap');
  });

  it('robotsConSitemap: sin archivo usa el de siempre, arregla el salto final y no repite un Sitemap existente', () => {
    const vacio = mkdtempSync(path.join(tmpdir(), 'mg-robots-'));
    try {
      expect(robotsConSitemap(vacio, URL_PUBLICA)).toBe(`${ROBOTS}\nSitemap: ${URL_PUBLICA}/sitemap.xml\n`);
      writeFileSync(path.join(vacio, 'robots.txt'), 'User-agent: *\nDisallow: /admin');
      expect(robotsConSitemap(vacio, URL_PUBLICA)).toBe(`User-agent: *\nDisallow: /admin\n\nSitemap: ${URL_PUBLICA}/sitemap.xml\n`);
      writeFileSync(path.join(vacio, 'robots.txt'), `${ROBOTS}Sitemap: https://otro.example/sitemap.xml\n`);
      expect(robotsConSitemap(vacio, URL_PUBLICA)).toBe(`${ROBOTS}Sitemap: https://otro.example/sitemap.xml\n`);
    } finally {
      rmSync(vacio, { recursive: true, force: true });
    }
  });
});

describe('páginas de servicio y CSP', () => {
  it('/servicios/<id> (existente o no) cae al index.html de la SPA, sin noindex', async () => {
    const { app } = await createTestContext({ config: { serveFrontend: true, frontendDistPath: dist } });
    for (const url of ['/servicios/pulido', '/servicios/no-existe', '/servicios/']) {
      const r = await request(app).get(url);
      expect(r.status, url).toBe(200);
      expect(r.text, url).toContain('id="root"');
      expect(r.headers['x-robots-tag'], url).toBeUndefined();
    }
    // la API sigue siendo la API
    expect((await request(app).get('/api/servicios')).headers['content-type']).toMatch(/json/);
  });

  it('la CSP de la SPA permite solo el iframe de Google Maps; la de la API sigue en none', async () => {
    const { app } = await createTestContext({ config: { serveFrontend: true, frontendDistPath: dist } });
    const csp = String((await request(app).get('/servicios/pulido')).headers['content-security-policy']);
    expect(csp.split(';')).toContain('frame-src https://www.google.com/maps/');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/frame-src[^;]*'none'/);
    expect((await request(app).get('/api/health')).headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
  });
});
