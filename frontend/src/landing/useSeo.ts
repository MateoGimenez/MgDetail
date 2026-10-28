import { useEffect } from 'react';
import type { SeoPagina } from '../lib/seoServicio';
import { jsonLdSeguro } from '../lib/jsonLdSeguro';

type Deshacer = () => void;

/** Pone `contenido` en la etiqueta que ya existe (y lo restaura al salir) o crea una nueva (y la saca al salir). */
function fijarEtiqueta(
  selector: string,
  etiqueta: 'meta' | 'link',
  atributos: Record<string, string>,
  atributoDeValor: 'content' | 'href',
  valor: string,
): Deshacer {
  const existente = document.head.querySelector<HTMLElement>(selector);
  if (existente) {
    const anterior = existente.getAttribute(atributoDeValor);
    existente.setAttribute(atributoDeValor, valor);
    return () => {
      if (anterior === null) existente.removeAttribute(atributoDeValor);
      else existente.setAttribute(atributoDeValor, anterior);
    };
  }
  const nueva = document.createElement(etiqueta);
  for (const [clave, contenido] of Object.entries(atributos)) nueva.setAttribute(clave, contenido);
  nueva.setAttribute(atributoDeValor, valor);
  document.head.append(nueva);
  return () => {
    nueva.remove();
  };
}

/**
 * Aplica el SEO de una página al <head> (título, description, Open Graph, canonical, noindex y JSON-LD) y, al salir
 * o cambiar, deja todo como estaba (los meta originales de index.html vuelven). Con `null` no toca nada.
 */
export function useSeo(seo: SeoPagina | null): void {
  useEffect(() => {
    if (!seo) return;
    const deshacer: Deshacer[] = [];

    const tituloAnterior = document.title;
    document.title = seo.titulo;
    deshacer.push(() => {
      document.title = tituloAnterior;
    });

    const meta = (atributo: 'name' | 'property', nombre: string, contenido: string) => {
      deshacer.push(fijarEtiqueta(`meta[${atributo}="${nombre}"]`, 'meta', { [atributo]: nombre }, 'content', contenido));
    };
    meta('name', 'description', seo.descripcion);
    meta('property', 'og:title', seo.titulo);
    meta('property', 'og:description', seo.descripcion);
    meta('name', 'twitter:title', seo.titulo);
    meta('name', 'twitter:description', seo.descripcion);
    if (seo.url) {
      meta('property', 'og:url', seo.url);
      deshacer.push(fijarEtiqueta('link[rel="canonical"]', 'link', { rel: 'canonical' }, 'href', seo.url));
    }
    if (seo.noindex) meta('name', 'robots', 'noindex, nofollow');

    for (const datos of seo.jsonLd) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.mgSeo = '';
      // "<" escapado (003c): ningún dato puede cerrar la etiqueta <script>.
      script.textContent = jsonLdSeguro(datos);
      document.head.append(script);
      deshacer.push(() => {
        script.remove();
      });
    }

    return () => {
      for (const deshacerUno of deshacer.reverse()) deshacerUno();
    };
  }, [seo]);
}
