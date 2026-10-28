import type { DatosSitio } from '../types';

/**
 * Datos estructurados (JSON-LD) del negocio, solo con datos reales: nombre, ciudad, provincia y país, más lo que se
 * complete en `src/config/sitio.ts`. Lo usan el `index.html` (vite.config.ts) y el `provider` de las páginas de servicio.
 * Archivo sin dependencias de la app: vite.config.ts lo importa.
 */
export function jsonLdDelNegocio(
  sitio: Pick<DatosSitio, 'direccion' | 'whatsapp' | 'instagram' | 'mapsUrl' | 'url'>,
  negocio: { readonly nombre: string; readonly ciudad: string; readonly provincia: string },
): Record<string, unknown> {
  const direccion: Record<string, string> = {
    '@type': 'PostalAddress',
    addressLocality: negocio.ciudad,
    addressRegion: negocio.provincia,
    addressCountry: 'AR',
  };
  if (sitio.direccion.trim()) direccion.streetAddress = sitio.direccion.trim();

  const jsonLd: Record<string, unknown> = {
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
  return jsonLd;
}
