import { sitio } from './sitio';

/**
 * Datos de quien desarrolló el sitio (franja «Desarrollado por» del pie).
 * No son datos del taller: viven aparte para no mezclarse con `sitio.ts`.
 */
export const desarrollador = {
  nombre: 'Mateo Gimenez',
  /** Usuario de Instagram, sin "@". */
  instagram: 'mateo_gimeneezz',
  /** Mismo número que el del taller: se toma de `sitio.ts` para no duplicar el dato. */
  whatsapp: sitio.whatsapp,
  correo: 'matex23gimenez11@gmail.com',
} as const;
