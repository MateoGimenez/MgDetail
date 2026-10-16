import type { DatosSitio } from '../types.ts';

/**
 * DATOS DEL TALLER — completalos acá y la web se actualiza sola.
 *
 * Todo lo que quede vacío se oculta: sin WhatsApp, los botones de contacto
 * llevan al formulario de turnos; sin horarios o dirección, esos bloques no
 * aparecen. No hace falta tocar ningún otro archivo.
 */
export const sitio: DatosSitio = {
  // COMPLETAR: WhatsApp en formato internacional, solo números y sin "+". Ej.: '5493804123456'
  whatsapp: '',
  // COMPLETAR: usuario de Instagram, sin "@". Ej.: 'mgdetailing'
  instagram: '',
  // COMPLETAR: dirección del taller. Ej.: 'Av. Ejemplo 123, La Rioja'
  direccion: '',
  // COMPLETAR: horarios, un renglón por ítem. Ej.: ['Lunes a viernes, de 9 a 18 h', 'Sábados, de 9 a 13 h']
  horarios: [],
  // COMPLETAR: link de Google Maps del taller (en Maps: Compartir → Copiar vínculo).
  mapsUrl: '',
  // COMPLETAR: dirección pública de la web, sin barra final. Ej.: 'https://mgdetailing.com.ar'
  // (se usa para canonical, og:url y, más adelante, og:image; vacía, esas etiquetas no se emiten)
  url: '',
  // COMPLETAR: '/logo.png' cuando subas el archivo a public/logo.png
  logo: '',
};

/** Datos fijos de la marca. No cambiar. */
export const negocio = {
  nombre: 'MgDetailing',
  ciudad: 'La Rioja',
  provincia: 'La Rioja',
  pais: 'Argentina',
} as const;
