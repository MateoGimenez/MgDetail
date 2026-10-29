import type { SeoPagina } from './seoServicio';
import { urlPublicaSegura } from './seoServicio';

/** SEO de /privacidad: título, descripción y canonical con la URL pública (si está cargada). Se puede indexar. */
export function seoPrivacidad(sitio: { readonly url: string }, negocio: { readonly nombre: string }): SeoPagina {
  const raiz = urlPublicaSegura(sitio.url);
  return {
    titulo: `Política de privacidad · ${negocio.nombre}`,
    descripcion: `Qué datos pedimos al reservar un turno en ${negocio.nombre}, para qué los usamos, con quién se comparten y cómo ejercer tus derechos.`,
    url: raiz ? `${raiz}/privacidad` : null,
    noindex: false,
    jsonLd: [],
  };
}
