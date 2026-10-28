import type { FotoGaleria } from '../types';

/** Anchos de las versiones WebP. Tienen que coincidir con ANCHOS de scripts/optimizar-fotos.mjs. */
export const ANCHOS_FOTO = [480, 800, 1080] as const;
/** Ancho del JPG de respaldo. */
export const ANCHO_RESPALDO_FOTO = 800;

/**
 * Entrada de galería para una foto generada con `npm run fotos`: `nombre` es el nombre final (ej.:
 * 'honda-nx-lateral') y `ancho`/`alto` el tamaño del original (sirven para reservar el lugar y saber si es
 * vertical). Arma el respaldo JPG y el `srcset` de WebP.
 */
export function fotoOptimizada(foto: {
  readonly nombre: string;
  readonly ancho: number;
  readonly alto: number;
  readonly alt: string;
  readonly titulo?: string;
  readonly servicioId?: string;
}): FotoGaleria {
  const { nombre, ancho, alto, ...resto } = foto;
  const base = `/trabajos/${nombre}`;
  const anchos = ANCHOS_FOTO.filter((a) => a <= ancho);
  const alturaRespaldo = Math.round((alto / ancho) * Math.min(ANCHO_RESPALDO_FOTO, ancho));
  return {
    ...resto,
    src: `${base}-${String(ANCHO_RESPALDO_FOTO)}.jpg`,
    srcset: anchos.map((a) => `${base}-${String(a)}.webp ${String(a)}w`).join(', '),
    ancho: Math.min(ANCHO_RESPALDO_FOTO, ancho),
    alto: alturaRespaldo,
  };
}

/** true si la foto es más alta que ancha (la galería le da formato 4:5). Sin medidas se asume horizontal. */
export function esVertical(foto: Pick<FotoGaleria, 'ancho' | 'alto'>): boolean {
  return foto.ancho !== undefined && foto.alto !== undefined && foto.alto > foto.ancho;
}
