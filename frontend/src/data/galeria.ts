import type { FotoGaleria, ParAntesDespues } from '../types';

/**
 * GALERÍA DE TRABAJOS — cómo agregar fotos reales
 *
 * 1. Copiá las fotos a la carpeta `public/fotos/`.
 *    Ej.: public/fotos/hilux-pulido.jpg
 *    Recomendado: JPG o WebP, unos 1600 px de ancho y menos de 400 KB cada una.
 *    Las fotos sueltas se muestran en formato 4:3 (horizontal).
 *
 * 2. Fotos sueltas: agregá un objeto en `fotos`. La ruta va SIN "public":
 *      {
 *        src: '/fotos/hilux-pulido.jpg',
 *        alt: 'Capó de una Toyota Hilux gris recién pulido, reflejando el techo del taller',
 *        titulo: 'Toyota Hilux · Pulido',
 *        servicioId: 'pulido',
 *      },
 *
 * 3. Antes y después: sacá las dos fotos desde el mismo lugar y con el mismo
 *    encuadre (mismo tamaño, mejor horizontal 3:2). Agregalas en `antesDespues`:
 *      {
 *        antes: '/fotos/gol-opticas-antes.jpg',
 *        despues: '/fotos/gol-opticas-despues.jpg',
 *        alt: 'Óptica delantera izquierda de un Volkswagen Gol',
 *        titulo: 'VW Gol · Restauración de ópticas',
 *        servicioId: 'restauracion-opticas',
 *      },
 *
 * 4. `alt` describe lo que se ve, para quienes usan lector de pantalla (y
 *    ayuda a Google). En antes/después describí solo el objeto: la web le
 *    agrega "Antes:" y "Después:" sola.
 *
 * Mientras las dos listas estén vacías, la web muestra "Fotos reales muy pronto".
 */

export const fotos: readonly FotoGaleria[] = [];

export const antesDespues: readonly ParAntesDespues[] = [];
