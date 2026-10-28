import { describe, expect, it } from 'vitest';
import type { Servicio } from '../types';
import { descripcionCorta, seoDeServicio, seoServicioNoEncontrado, urlPublicaSegura } from './seoServicio';

const negocio = { nombre: 'MgDetailing', ciudad: 'La Rioja', provincia: 'La Rioja', pais: 'Argentina' } as const;
const sitioBase = {
  direccion: 'Calle Olta Pasaje N2, La Rioja',
  whatsapp: '5493804781737',
  instagram: '',
  mapsUrl: '',
  url: '',
};
const pulido: Servicio = {
  id: 'pulido',
  nombre: 'Pulido',
  resumen: 'Saca las rayas finas y devuelve el brillo a la pintura.',
  descripcion: 'Descripción larga.',
  incluye: ['Lavado', 'Pulido'],
  glosario: [],
  duracion: '4 a 6 h',
  precioDesde: 60000,
  destacado: false,
};

describe('seoDeServicio', () => {
  it('título y descripción salen del servicio; sin URL pública no hay canonical ni og:url', () => {
    const seo = seoDeServicio(pulido, { sitio: sitioBase, negocio });
    expect(seo.titulo).toBe('Pulido en La Rioja · MgDetailing');
    expect(seo.descripcion).toBe(pulido.resumen);
    expect(seo.url).toBeNull();
    expect(seo.noindex).toBe(false);
  });

  it('con URL pública, la URL de la página es absoluta y sin doble barra', () => {
    const seo = seoDeServicio(pulido, { sitio: { ...sitioBase, url: 'https://mgdetailing.com.ar/' }, negocio });
    expect(seo.url).toBe('https://mgdetailing.com.ar/servicios/pulido');
  });

  it('JSON-LD: Service con el negocio de proveedor, zona y oferta; más BreadcrumbList', () => {
    const [servicio, migas] = seoDeServicio(pulido, {
      sitio: { ...sitioBase, url: 'https://mgdetailing.com.ar' },
      negocio,
    }).jsonLd;
    expect(servicio).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Pulido',
      areaServed: { '@type': 'City', name: 'La Rioja' },
      provider: { '@type': 'AutoWash', name: 'MgDetailing', telephone: '+5493804781737' },
      offers: { priceSpecification: { minPrice: 60000, priceCurrency: 'ARS' } },
      url: 'https://mgdetailing.com.ar/servicios/pulido',
    });
    expect((servicio?.provider as Record<string, unknown>)['@context']).toBeUndefined();
    expect(migas).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'Inicio', item: 'https://mgdetailing.com.ar/' },
        { position: 2, name: 'Servicios', item: 'https://mgdetailing.com.ar/#servicios' },
        { position: 3, name: 'Pulido', item: 'https://mgdetailing.com.ar/servicios/pulido' },
      ],
    });
  });

  it('sin precio no hay offers; sin URL, las migas no llevan item', () => {
    const [servicio, migas] = seoDeServicio({ ...pulido, precioDesde: null }, { sitio: sitioBase, negocio }).jsonLd;
    expect(servicio).not.toHaveProperty('offers');
    expect(servicio).not.toHaveProperty('url');
    const items = (migas as { itemListElement: Record<string, unknown>[] }).itemListElement;
    expect(items.every((item) => !('item' in item))).toBe(true);
  });
});

describe('seoServicioNoEncontrado', () => {
  it('no se indexa y no lleva datos estructurados', () => {
    const seo = seoServicioNoEncontrado(negocio);
    expect(seo.noindex).toBe(true);
    expect(seo.jsonLd).toEqual([]);
    expect(seo.url).toBeNull();
  });
});

describe('ayudas', () => {
  it('urlPublicaSegura exige https y saca la barra final', () => {
    expect(urlPublicaSegura('https://a.com.ar/')).toBe('https://a.com.ar');
    expect(urlPublicaSegura('http://a.com.ar')).toBeNull();
    expect(urlPublicaSegura('')).toBeNull();
  });

  it('descripcionCorta no corta palabras y agrega puntos suspensivos', () => {
    const corta = descripcionCorta('palabra '.repeat(40));
    expect(corta.length).toBeLessThanOrEqual(160);
    expect(corta.endsWith('…')).toBe(true);
    expect(descripcionCorta('  hola   mundo ')).toBe('hola mundo');
  });
});
