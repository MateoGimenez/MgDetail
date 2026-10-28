import { defineConfig, type HtmlTagDescriptor, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { negocio, sitio } from './src/config/sitio.ts';
import { jsonLdDelNegocio } from './src/lib/negocioJsonLd.ts';

/**
 * Backend local. Se usa 127.0.0.1 y no "localhost": en Windows, con Node 17+,
 * "localhost" puede resolver a ::1 (IPv6) y el backend escucha en 127.0.0.1.
 */
const API_LOCAL = 'http://127.0.0.1:4000';

/** Proxy de desarrollo /api → backend (mismo origen para el navegador). */
const proxyApi: ProxyOptions = { target: API_LOCAL, changeOrigin: false };

/**
 * Datos estructurados (JSON-LD) del negocio, solo con datos reales: nombre,
 * ciudad, provincia y país, más lo que se complete en `src/config/sitio.ts`.
 * La CSP no se define acá: vive en un solo lugar, el backend (middleware/security.ts).
 */
function datosDelNegocio(): Plugin {
  return {
    name: 'mg-datos-del-negocio',
    transformIndexHtml() {
      const jsonLd: Record<string, unknown> = { '@context': 'https://schema.org', ...jsonLdDelNegocio(sitio, negocio) };
      const url = sitio.url.trim().replace(/\/+$/, '');

      const etiqueta: HtmlTagDescriptor = {
        tag: 'script',
        attrs: { type: 'application/ld+json' },
        // "<" escapado: ningún dato puede cerrar la etiqueta <script>.
        children: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        injectTo: 'head',
      };
      const etiquetas: HtmlTagDescriptor[] = [etiqueta];
      // Con la URL pública cargada se emiten canonical, og:url y la imagen para compartir
      // (los crawlers exigen URLs absolutas). Sin URL, la tarjeta queda chica y sin imagen.
      const conUrl = /^https:\/\//i.test(url);
      etiquetas.push({
        tag: 'meta',
        attrs: { name: 'twitter:card', content: conUrl ? 'summary_large_image' : 'summary' },
        injectTo: 'head',
      });
      if (conUrl) {
        const imagen = `${url}/marca/og.jpg`;
        etiquetas.push(
          { tag: 'link', attrs: { rel: 'canonical', href: `${url}/` }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: `${url}/` }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image', content: imagen }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image:height', content: '630' }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image:alt', content: 'Logo de MgDetailing' }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'twitter:image', content: imagen }, injectTo: 'head' },
        );
      }
      return etiquetas;
    },
  };
}

/**
 * Precarga solo las fuentes del primer viewport (título y texto). Se buscan
 * en el build por su nombre de archivo, que Vite completa con un hash.
 */
function precargaDeFuentes(archivos: readonly string[]): Plugin {
  let base = '/';
  return {
    name: 'mg-precarga-de-fuentes',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, contexto) {
        const bundle = contexto.bundle;
        if (!bundle) return [];
        const etiquetas: HtmlTagDescriptor[] = [];
        for (const archivo of archivos) {
          const salida = Object.values(bundle).find(
            (s) => s.type === 'asset' && s.fileName.includes(`/${archivo}-`) && s.fileName.endsWith('.woff2'),
          );
          if (salida) {
            etiquetas.push({
              tag: 'link',
              attrs: { rel: 'preload', href: `${base}${salida.fileName}`, as: 'font', type: 'font/woff2', crossorigin: true },
              injectTo: 'head',
            });
          }
        }
        return etiquetas;
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    datosDelNegocio(),
    precargaDeFuentes(['barlow-condensed-latin-800-normal', 'archivo-latin-wght-normal']),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': proxyApi },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': proxyApi },
  },
});
