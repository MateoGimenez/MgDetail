import { defineConfig, type HtmlTagDescriptor, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { negocio, sitio } from './src/config/sitio.ts';

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
      const direccion: Record<string, string> = {
        '@type': 'PostalAddress',
        addressLocality: negocio.ciudad,
        addressRegion: negocio.provincia,
        addressCountry: 'AR',
      };
      if (sitio.direccion.trim()) direccion.streetAddress = sitio.direccion.trim();

      const jsonLd: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'AutoWash',
        name: negocio.nombre,
        address: direccion,
      };
      const whatsapp = sitio.whatsapp.replace(/\D/g, '');
      if (whatsapp.length >= 8) jsonLd.telephone = `+${whatsapp}`;
      const instagram = sitio.instagram.trim().replace(/^@/, '');
      if (instagram) jsonLd.sameAs = [`https://www.instagram.com/${instagram}/`];
      if (/^https:\/\//i.test(sitio.mapsUrl.trim())) jsonLd.hasMap = sitio.mapsUrl.trim();

      const url = sitio.url.trim().replace(/\/+$/, '');
      if (/^https:\/\//i.test(url)) jsonLd.url = `${url}/`;

      const etiqueta: HtmlTagDescriptor = {
        tag: 'script',
        attrs: { type: 'application/ld+json' },
        // "<" escapado: ningún dato puede cerrar la etiqueta <script>.
        children: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        injectTo: 'head',
      };
      const etiquetas: HtmlTagDescriptor[] = [etiqueta];
      // Con la URL pública cargada se emiten canonical y og:url (og:image, cuando haya una imagen real).
      if (/^https:\/\//i.test(url)) {
        etiquetas.push(
          { tag: 'link', attrs: { rel: 'canonical', href: `${url}/` }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: `${url}/` }, injectTo: 'head' },
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
    precargaDeFuentes(['bodoni-moda-latin-wght-normal', 'archivo-latin-wght-normal']),
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
