import type { Servicio } from '../types';
import { jsonLdDelNegocio } from './negocioJsonLd';

/**
 * SEO de la página de un servicio (/servicios/:id): título, descripción, Open Graph, canonical y JSON-LD. Funciones
 * puras; landing/useSeo.ts las aplica al <head> y las restaura al salir. Solo datos reales del catálogo.
 */

export interface SeoPagina {
  readonly titulo: string;
  readonly descripcion: string;
  /** og:url y canonical: solo si la web tiene URL pública (los crawlers exigen URLs absolutas). */
  readonly url: string | null;
  readonly noindex: boolean;
  /** Objetos JSON-LD (cada uno lleva su @context). */
  readonly jsonLd: readonly Record<string, unknown>[];
}

interface Contexto {
  readonly sitio: Parameters<typeof jsonLdDelNegocio>[0];
  readonly negocio: Parameters<typeof jsonLdDelNegocio>[1];
}

/** `sitio.url` sin barra final, o null si no está cargada o no es https. */
export function urlPublicaSegura(url: string): string | null {
  const limpia = url.trim().replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+/i.test(limpia) ? limpia : null;
}

/** El resumen como meta description: una línea, recortada a ~160 caracteres sin cortar palabras. */
export function descripcionCorta(texto: string, maximo = 160): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= maximo) return limpio;
  const corte = limpio.slice(0, maximo - 1);
  const ultimoEspacio = corte.lastIndexOf(' ');
  return `${(ultimoEspacio > 80 ? corte.slice(0, ultimoEspacio) : corte).replace(/[\s,.;:]+$/, '')}…`;
}

export function seoDeServicio(servicio: Servicio, { sitio, negocio }: Contexto): SeoPagina {
  const raiz = urlPublicaSegura(sitio.url);
  const url = raiz ? `${raiz}/servicios/${encodeURIComponent(servicio.id)}` : null;
  const proveedor = jsonLdDelNegocio(sitio, negocio);

  const servicioLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: servicio.nombre,
    serviceType: servicio.nombre,
    description: descripcionCorta(servicio.resumen, 300),
    provider: proveedor,
    areaServed: { '@type': 'City', name: negocio.ciudad },
  };
  if (url) servicioLd.url = url;
  if (servicio.precioDesde !== null) {
    servicioLd.offers = {
      '@type': 'Offer',
      priceCurrency: 'ARS',
      priceSpecification: {
        '@type': 'PriceSpecification',
        priceCurrency: 'ARS',
        minPrice: servicio.precioDesde,
      },
    };
  }

  const miga = (posicion: number, nombre: string, item: string | null) => ({
    '@type': 'ListItem',
    position: posicion,
    name: nombre,
    ...(item ? { item } : {}),
  });
  const migas = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      miga(1, 'Inicio', raiz ? `${raiz}/` : null),
      miga(2, 'Servicios', raiz ? `${raiz}/#servicios` : null),
      miga(3, servicio.nombre, url),
    ],
  };

  return {
    titulo: `${servicio.nombre} en ${negocio.ciudad} · ${negocio.nombre}`,
    descripcion: descripcionCorta(servicio.resumen),
    url,
    noindex: false,
    jsonLd: [servicioLd, migas],
  };
}

/** Página de un servicio que no existe o está inactivo: no se indexa. */
export function seoServicioNoEncontrado(negocio: { readonly nombre: string }): SeoPagina {
  return {
    titulo: `No encontramos ese servicio · ${negocio.nombre}`,
    descripcion: `Ese servicio no está disponible. Mirá los servicios de ${negocio.nombre}.`,
    url: null,
    noindex: true,
    jsonLd: [],
  };
}
