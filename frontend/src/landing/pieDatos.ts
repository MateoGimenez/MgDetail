import { desarrollador } from '../config/desarrollador';
import { instagramArroba, instagramUrl, whatsappUrl, whatsappUrlDe } from '../config/enlaces';
import { negocio } from '../config/sitio';

/** Lógica pura del pie: qué enlaces y textos se muestran. El componente solo los dibuja. */

export type IconoRed = 'instagram' | 'whatsapp' | 'correo';

export interface EnlacePie {
  icono: IconoRed;
  /** Texto accesible (aria-label) y, donde se muestra, rótulo visible. */
  etiqueta: string;
  href: string;
  /** Se abre en otra pestaña con rel="noopener noreferrer". mailto: no. */
  externo: boolean;
}

/** Redes del negocio. Sin dato cargado (p. ej. Instagram sin arroba) simplemente no aparecen. */
export function redesDelNegocio(): EnlacePie[] {
  const redes: EnlacePie[] = [];
  const whatsapp = whatsappUrl();
  if (whatsapp) redes.push({ icono: 'whatsapp', etiqueta: `WhatsApp de ${negocio.nombre}`, href: whatsapp, externo: true });
  const instagram = instagramUrl();
  const arroba = instagramArroba();
  if (instagram && arroba) {
    redes.push({ icono: 'instagram', etiqueta: `Instagram de ${negocio.nombre} ${arroba}`, href: instagram, externo: true });
  }
  return redes;
}

/** Contacto del desarrollador: Instagram, WhatsApp y correo. */
export function contactoDesarrollador(): EnlacePie[] {
  const enlaces: EnlacePie[] = [
    {
      icono: 'instagram',
      etiqueta: `Instagram de ${desarrollador.nombre} @${desarrollador.instagram}`,
      href: `https://instagram.com/${encodeURIComponent(desarrollador.instagram)}`,
      externo: true,
    },
  ];
  const whatsapp = whatsappUrlDe(desarrollador.whatsapp);
  if (whatsapp) enlaces.push({ icono: 'whatsapp', etiqueta: `WhatsApp de ${desarrollador.nombre}`, href: whatsapp, externo: true });
  enlaces.push({
    icono: 'correo',
    etiqueta: `Correo a ${desarrollador.nombre}`,
    href: `mailto:${desarrollador.correo}`,
    externo: false,
  });
  return enlaces;
}

export interface TextosLegales {
  negocio: string;
  desarrollo: string;
  terceros: string;
  ubicacion: string;
}

export function textosLegales(anio: number): TextosLegales {
  return {
    negocio: `© ${anio} ${negocio.nombre}. Todos los derechos reservados. La marca, el logo, los textos y las fotos son de ${negocio.nombre}.`,
    desarrollo: `Diseño y desarrollo del sitio © ${anio} ${desarrollador.nombre}.`,
    terceros: 'Las marcas, logos y nombres de terceros que aparecen en el sitio pertenecen a sus respectivos dueños.',
    ubicacion: `${negocio.ciudad}, ${negocio.pais}`,
  };
}
